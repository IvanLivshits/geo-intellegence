import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { gridCells, haversine } from './geo-math';
import { cacheGet, cacheSet } from './cache';
import { ensureFile } from './raster-cache';
import { coastalTerrain, DTM_CLIP_M } from './coastal-terrain';
import { makeField, type MaskField } from './mask-field';
import { clipToZone } from './polygon';
import { COASTAL_RAMP } from './constants';
import { ATTENUATION_CM_PER_KM, attenuationAt, surgeFill } from './surge-fill';
import type { MaskContext } from './masks';

const ESL_URL = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/LISCOAST/10012/LATEST/globalESLprojections.zip';
const ESL_FILE = 'jrc-esl-projections.zip';
const ESL_ENTRY = 'ESL_100RP_Baseline.csv';

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const GRID_N = 48;
const DEPTH_MAX_CM = 300;
const MAX_COAST_DISTANCE_M = 50000;
const ASSET_RADIUS_M = 60;
const ASSET_RADIUS_WIDE_M = 150;
const MISSING_TOLERANCE = 0.2;

const METHOD =
  `Method: the 1-in-100-year extreme sea level from the JRC LISCOAST global projections (still-water level: tide + surge + wave setup, 20 865 coastal points) is propagated inland over DeltaDTM — a bare-earth coastal terrain model (Deltares) in which Copernicus DEM is bias-corrected with ICESat-2 and GEDI lidar and buildings and vegetation are removed, vertical MAE 0.43 m — by a hydraulic-connectivity flood fill: only ground continuously connected to the sea below the water surface is flooded, so inland depressions cut off from the sea are NOT counted (Poulter & Halpin 2008). The water level is attenuated along the flow path at ${ATTENUATION_CM_PER_KM} cm/km, the urban-land-cover rate of Vafeidis et al. (2019) — the lowest attenuation class, so the result is deliberately conservative. The reported figure is the depth AT THE ASSET: ground level at the building against the attenuated water surface. Area statistics are context, not the asset's exposure. ` +
  'What this does and does not capture about defences: dike crests, embankments and dune ridges are present in the terrain, so they do block the flood path and ARE reflected here. Movable surge barriers, pumping, drainage and any breach or overtopping of a defence are NOT modelled — an asset shown as dry behind a dike is dry only as long as that dike holds.';

interface CoastPoint {
  lat: number;
  lon: number;
  esl: number;
}

let coastCache: CoastPoint[] | null = null;
let coastLoading: Promise<CoastPoint[]> | null = null;

async function loadCoastPoints(): Promise<CoastPoint[]> {
  if (coastCache) return coastCache;
  if (coastLoading) return coastLoading;

  coastLoading = (async () => {
    const path = await ensureFile(ESL_URL, ESL_FILE);
    const zip = unzipSync(new Uint8Array(await readFile(path)));
    const entry = Object.keys(zip).find((k) => k.endsWith(ESL_ENTRY) && !k.includes('__MACOSX'));
    if (!entry) throw new Error(`${ESL_ENTRY} not found inside the JRC archive`);

    const text = Buffer.from(zip[entry]).toString('utf8');
    const lines = text.split(/\r?\n/);
    const points: CoastPoint[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',');
      if (cells.length < 3) continue;
      const lat = parseFloat(cells[0]);
      const lon = parseFloat(cells[1]);
      const esl = parseFloat(cells[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(esl)) continue;
      points.push({ lat, lon, esl });
    }
    if (!points.length) throw new Error('the JRC sea-level file has no usable rows');
    console.log(`[coastal] JRC extreme sea levels loaded · ${points.length} coastal points`);
    coastCache = points;
    return points;
  })().catch((err) => {
    coastLoading = null;
    throw err;
  });

  return coastLoading;
}

function nearestCoast(lat: number, lon: number, points: CoastPoint[]): { point: CoastPoint; dist: number } | null {
  const latWindow = MAX_COAST_DISTANCE_M / 111320 + 0.05;
  let best: CoastPoint | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    if (Math.abs(p.lat - lat) > latWindow) continue;
    const d = haversine(lat, lon, p.lat, p.lon);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best && bestDist <= MAX_COAST_DISTANCE_M ? { point: best, dist: bestDist } : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function computeCoastalMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = GRID_N;

  const key =
    'coastal:v2:' +
    createHash('sha1')
      .update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius},${ctx.zoneTag || ''}`)
      .digest('hex');
  const cached = await cacheGet<MaskField>(key);
  if (cached != null) return cached;

  const spec = {
    ramp: COASTAL_RAMP,
    lo: 0,
    hi: DEPTH_MAX_CM,
    alphaMin: 0,
    alphaMax: 220,
    unit: 'cm',
    label: 'Coastal flooding (model)',
  };

  let points: CoastPoint[];
  try {
    points = await loadCoastPoints();
  } catch (err) {
    console.warn(`[coastal] JRC sea levels unavailable: ${err instanceof Error ? err.message : String(err)}`);
    const field = makeField(new Array(4).fill(null), 2, {
      ...spec,
      note: `NOT ASSESSED: the JRC extreme sea-level dataset could not be retrieved, so coastal exposure was never checked. ${METHOD}`,
    });
    field.degraded = true;
    field.site = null;
    return field;
  }

  const coast = nearestCoast(lat, lon, points);
  if (!coast) {
    const field = makeField(new Array(4).fill(null), 2, {
      ...spec,
      note: `No modelled coastline within ${MAX_COAST_DISTANCE_M / 1000} km of the site — storm surge cannot reach it. ${METHOD}`,
      site: 0,
    });
    await cacheSet(key, field, CACHE_TTL_MS);
    return field;
  }

  const eslCm = coast.point.esl * 100;
  const context = `Nearest modelled coastline: ${Math.round(coast.dist / 100) / 10} km away, 1-in-100-year extreme sea level ${coast.point.esl.toFixed(2)} m.`;

  if (eslCm > DTM_CLIP_M * 100) {
    const field = makeField(new Array(4).fill(null), 2, {
      ...spec,
      note: `NOT ASSESSED: the 1-in-100-year sea level here (${coast.point.esl.toFixed(2)} m) exceeds the ${DTM_CLIP_M} m ceiling of the DeltaDTM coastal terrain model, so inundation could not be resolved. ${context} ${METHOD}`,
    });
    field.degraded = true;
    field.site = null;
    return field;
  }

  const cells = gridCells(lat, lon, radius, n);

  let terrain;
  let fill;
  try {
    terrain = await coastalTerrain(cells);
    fill = await surgeFill(lat, lon, coast.point.lat, coast.point.lon, eslCm, radius);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.warn(`[coastal] terrain unavailable: ${why}`);
    const field = makeField(new Array(4).fill(null), 2, {
      ...spec,
      note: `NOT ASSESSED: ${why}. Coastal exposure was never checked — this is a gap in the data, not a finding of low risk. ${context} ${METHOD}`,
    });
    field.degraded = true;
    field.site = null;
    return field;
  }

  const elevs = terrain.elev;
  const isWater = terrain.water;

  const ground: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (elevs[i] != null && !isWater[i]) ground.push(i);
  }
  const missing = elevs.filter((e) => e == null).length;

  if (!ground.length) {
    const field = makeField(new Array(4).fill(null), 2, {
      ...spec,
      note: `NOT ASSESSED: no dry-land terrain cell here — the scanned area has no ground the model can measure against. ${context} ${METHOD}`,
    });
    field.degraded = true;
    field.site = null;
    return field;
  }

  const waterLevel = cells.map((c) => {
    const att = attenuationAt(fill, c.x, c.y);
    return Number.isFinite(att) ? eslCm - att : null;
  });

  const wet = (i: number): boolean => {
    const e = elevs[i];
    const wl = waterLevel[i];
    return e != null && wl != null && e * 100 < wl;
  };
  const passable = (i: number): boolean => isWater[i] || wet(i);

  const flooded = new Array<boolean>(cells.length).fill(false);
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (flooded[i] || !passable(i)) return;
    flooded[i] = true;
    stack.push(i);
  };

  for (let i = 0; i < cells.length; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const onEdge = r === 0 || c === 0 || r === n - 1 || c === n - 1;
    if (onEdge || isWater[i]) seed(i);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const r = Math.floor(i / n);
    const c = i % n;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rj = r + dr;
        const cj = c + dc;
        if (rj < 0 || cj < 0 || rj >= n || cj >= n) continue;
        seed(rj * n + cj);
      }
    }
  }

  const values: (number | null)[] = cells.map((_, i) => {
    if (elevs[i] == null || isWater[i]) return null;
    if (!flooded[i]) return 0;
    const depth = (waterLevel[i] as number) - (elevs[i] as number) * 100;
    return Math.min(Math.max(depth, 0), DEPTH_MAX_CM);
  });

  const near = (limit: number): number[] =>
    ground.filter((i) => Math.hypot(cells[i].x, cells[i].y) <= limit);
  const tight = near(ASSET_RADIUS_M);
  const assetCells = tight.length ? tight : near(ASSET_RADIUS_WIDE_M);
  const assetRadius = tight.length ? ASSET_RADIUS_M : ASSET_RADIUS_WIDE_M;

  let site: number | null = null;
  let siteNote: string;
  let shielded = false;

  const m = (cm: number): string => (cm / 100).toFixed(2);

  if (!assetCells.length) {
    siteNote = `NOT ASSESSED AT THE ASSET: no dry-land terrain cell within ${ASSET_RADIUS_WIDE_M} m of the point, so ground level at the asset could not be established.`;
  } else {
    const groundCm = median(assetCells.map((i) => (elevs[i] as number) * 100));
    const wetCells = assetCells.filter((i) => flooded[i]);

    if (wetCells.length) {
      const wl = Math.max(...wetCells.map((i) => waterLevel[i] as number));
      site = Math.min(Math.max(wl - groundCm, 0), DEPTH_MAX_CM);
      siteNote = `Inundated at the asset: ground level ${m(groundCm)} m against an attenuated water surface of ${m(wl)} m.`;
    } else if (groundCm >= eslCm) {
      site = 0;
      siteNote =
        groundCm >= DTM_CLIP_M * 100
          ? `Dry: the asset stands above the ${DTM_CLIP_M} m ceiling of the coastal terrain model — more than ${DTM_CLIP_M} m above mean sea level, far above the 1-in-100-year sea level (${m(eslCm)} m).`
          : `Dry: ground level at the asset (${m(groundCm)} m, median of bare-earth cells within ${assetRadius} m) is above the 1-in-100-year sea level (${m(eslCm)} m).`;
    } else {
      site = 0;
      shielded = true;
      siteNote = `SHIELDED, NOT ELEVATED: ground level at the asset (${m(groundCm)} m) is ${m(eslCm - groundCm)} m BELOW the 1-in-100-year sea level (${m(eslCm)} m), and it stays dry only because no continuous flow path from the sea reaches it — the terrain in between (dune ridge, dike crest or embankment present in the DEM) blocks the water. Modelled depth is therefore 0, but this is defended land, not high ground: a breach or overtopping of that defence is not modelled and would inundate the asset.`;
    }
  }

  const floodedShare = Math.round((ground.filter((i) => flooded[i]).length / ground.length) * 100);

  const field = makeField(clipToZone(values, n, radius, ctx.zone), n, {
    ...spec,
    note: `${context} ${siteNote} ${floodedShare}% of the assessed ground area is inundated at this level. ${METHOD}`,
    site,
    siteNote: `${siteNote}${shielded ? '' : ` ${context}`}`,
  });

  if (site == null) field.degraded = true;

  if (missing / (n * n) > MISSING_TOLERANCE) {
    field.degraded = true;
    field.note = `INCOMPLETE FIELD: terrain data missing for ${Math.round((missing / (n * n)) * 100)}% of cells. ${field.note}`;
    return field;
  }
  if (fill.coverage < 1 - MISSING_TOLERANCE) {
    field.degraded = true;
    field.note = `INCOMPLETE FLOW PATH: terrain data covers only ${Math.round(fill.coverage * 100)}% of the corridor between the coast and the site, so the connectivity check is partial. ${field.note}`;
    return field;
  }

  await cacheSet(key, field, CACHE_TTL_MS);
  return field;
}
