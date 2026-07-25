import { gridCells } from './geo-math';
import { sampleElevations } from './dem';
import { makeField, type MaskField } from './mask-field';
import { clipToZone, pointInZone } from './polygon';
import { PLUVIAL_RAMP } from './constants';
import type { MaskContext } from './masks';
import { buildingRings, inAnyBuilding } from './buildings';

const GRID_N = 48;
const POND_MAX_CM = 100;
const ARTIFACT_CM = 300;
const MISSING_TOLERANCE = 0.2;

const NOTE =
  'Stormwater ponding model: filling of local terrain depressions (Copernicus DEM GLO-30). Shows where water will pool during heavy rainfall, WITHOUT accounting for storm drainage. Depressions deeper than 3 m are discarded as built-up artefacts, so genuinely deep sinks (underpasses, quarries) are not reported. Indicative only — the terrain model is a surface model, so values in dense built-up areas are approximate. NOT an official hazard map.';

function fillDepressions(elevs: (number | null)[], n: number): number[] {
  const filled = new Array<number>(n * n);
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const border = r === 0 || c === 0 || r === n - 1 || c === n - 1;
    const e = elevs[i];
    filled[i] = border || e == null ? (e ?? -Infinity) : Infinity;
  }

  let changed = true;
  let passes = 0;
  while (changed && passes < 500) {
    changed = false;
    passes++;
    const order = passes % 2 === 1;
    for (let k = 0; k < n * n; k++) {
      const i = order ? k : n * n - 1 - k;
      const e = elevs[i];
      if (e == null) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      if (r === 0 || c === 0 || r === n - 1 || c === n - 1) continue;
      let minNb = Infinity;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nb = filled[(r + dr) * n + (c + dc)];
          if (nb < minNb) minNb = nb;
        }
      }
      const cand = Math.max(e, minNb);
      if (cand < filled[i]) {
        filled[i] = cand;
        changed = true;
      }
    }
  }
  return filled;
}

function pondingAtAsset(groundDepth: (number | null)[], n: number): number | null {
  const c = Math.floor(n / 2);
  for (const rad of [1, 2, 4]) {
    const vals: number[] = [];
    for (let r = Math.max(0, c - rad); r <= Math.min(n - 1, c + rad); r++) {
      for (let col = Math.max(0, c - rad); col <= Math.min(n - 1, c + rad); col++) {
        const d = groundDepth[r * n + col];
        if (d != null) vals.push(d);
      }
    }
    if (vals.length) {
      vals.sort((a, b) => a - b);
      return Math.round(vals[Math.floor(vals.length / 2)]);
    }
  }
  return null;
}

export async function computePluvialMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = GRID_N;

  const cells = gridCells(lat, lon, radius, n);
  const elevs = await sampleElevations(cells);

  const rings = buildingRings(ctx.osmElements);
  const onBuilding = new Array<boolean>(n * n).fill(false);
  let masked = 0;
  if (rings.length) {
    for (let i = 0; i < cells.length; i++) {
      if (inAnyBuilding(cells[i].lon, cells[i].lat, rings)) {
        onBuilding[i] = true;
        masked++;
      }
    }
  }

  const filled = fillDepressions(elevs, n);

  const values: (number | null)[] = new Array(n * n).fill(null);
  const groundDepth: (number | null)[] = new Array(n * n).fill(null);
  for (let i = 0; i < n * n; i++) {
    if (onBuilding[i]) continue;
    const e = elevs[i];
    if (e == null || !Number.isFinite(filled[i])) continue;
    const pondCm = (filled[i] - e) * 100;
    if (pondCm > ARTIFACT_CM) continue;
    const depth = pondCm <= 1 ? 0 : Math.min(pondCm, POND_MAX_CM);
    groundDepth[i] = depth;
    if (depth > 0) values[i] = depth;
  }

  const clipped = clipToZone(values, n, radius, ctx.zone);

  const inZone = new Array<boolean>(n * n).fill(true);
  if (ctx.zone && ctx.zone.length >= 3) {
    const cellM = (radius * 2) / n;
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const x = -radius + cellM * (c + 0.5);
      const y = radius - cellM * (r + 0.5);
      inZone[i] = pointInZone(x, y, ctx.zone);
    }
  }

  let zoneCells = 0;
  let noTerrain = 0;
  let rooftop = 0;
  let ground = 0;
  for (let i = 0; i < n * n; i++) {
    if (!inZone[i]) continue;
    zoneCells++;
    if (elevs[i] == null) noTerrain++;
    else if (onBuilding[i]) rooftop++;
    else ground++;
  }

  const terrainMissing = zoneCells > 0 && noTerrain === zoneCells;
  const allRooftop = !terrainMissing && ground === 0 && rooftop > 0;
  const missingRatio = zoneCells > 0 ? noTerrain / zoneCells : 1;
  const tooIncomplete = !terrainMissing && missingRatio > MISSING_TOLERANCE;
  const incompletePct = Math.round(missingRatio * 100);

  let note = NOTE;
  if (terrainMissing) {
    note = `NOT ASSESSED: terrain data (Copernicus DEM) could not be retrieved for this area, so ponding was not modelled. ${NOTE}`;
  } else if (allRooftop) {
    note = `NOT ASSESSED: every cell in this area is covered by a building footprint, so there is no ground surface to model ponding on. ${NOTE}`;
  } else if (tooIncomplete) {
    note = `INCOMPLETE FIELD: terrain data missing for ${incompletePct}% of cells — rebuild later. ${NOTE}`;
  } else if (noTerrain > 0) {
    note = `${NOTE} Terrain data was missing for ${incompletePct}% of cells.`;
  }

  const field = makeField(clipped, n, {
    ramp: PLUVIAL_RAMP,
    lo: 0,
    hi: POND_MAX_CM,
    alphaMin: 90,
    alphaMax: 220,
    unit: 'cm',
    label: 'Pluvial flooding (model)',
    note,
  });
  if (terrainMissing || allRooftop || tooIncomplete) field.degraded = true;

  let sum = 0;
  let count = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n * n; i++) {
    if (!inZone[i]) continue;
    const d = groundDepth[i];
    if (d == null) continue;
    sum += d;
    count++;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  if (count > 0) {
    field.avg = Math.round(sum / count);
    field.min = Math.round(lo);
    field.max = Math.round(hi);
  }
  field.site = pondingAtAsset(groundDepth, n);

  return field;
}
