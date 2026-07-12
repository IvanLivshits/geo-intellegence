import { gridCells } from './geo-math';
import { sampleElevations } from './dem';
import { makeField, type MaskField } from './mask-field';
import { clipToZone, pointInZone } from './polygon';
import { PLUVIAL_RAMP } from './constants';
import type { MaskContext } from './masks';
import type { OsmElement, OsmGeometryPoint } from './noise-model';

const GRID_N = 48;
const POND_MAX_CM = 100;
const ARTIFACT_CM = 300;
const MISSING_TOLERANCE = 0.2;

const NOTE =
  'Stormwater ponding model: filling of local terrain depressions (Copernicus DEM GLO-30). Shows where water will pool during heavy rainfall, WITHOUT accounting for storm drainage. Depressions deeper than 3 m are discarded as built-up artefacts, so genuinely deep sinks (underpasses, quarries) are not reported. Indicative only — the terrain model is a surface model, so values in dense built-up areas are approximate. NOT an official hazard map.';

interface Ring {
  pts: [number, number][];
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

function toRing(geom: OsmGeometryPoint[] | undefined): Ring | null {
  if (!Array.isArray(geom) || geom.length < 3) return null;
  const pts: [number, number][] = geom.map((p) => [p.lon, p.lat]);
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const [x, y] of pts) {
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  return { pts, xmin, xmax, ymin, ymax };
}

function buildingRings(els: OsmElement[] | undefined): Ring[] {
  if (!Array.isArray(els)) return [];
  const rings: Ring[] = [];
  for (const el of els) {
    if (!el.tags?.building) continue;
    if (el.type === 'way') {
      const r = toRing(el.geometry);
      if (r) rings.push(r);
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      for (const m of el.members) {
        if (m.type === 'way' && (m.role === 'outer' || !m.role)) {
          const r = toRing(m.geometry);
          if (r) rings.push(r);
        }
      }
    }
  }
  return rings;
}

function insideRing(x: number, y: number, r: Ring): boolean {
  if (x < r.xmin || x > r.xmax || y < r.ymin || y > r.ymax) return false;
  let inside = false;
  const p = r.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi) inside = !inside;
  }
  return inside;
}

function inAnyBuilding(x: number, y: number, rings: Ring[]): boolean {
  for (const r of rings) {
    if (insideRing(x, y, r)) return true;
  }
  return false;
}

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
  for (let i = 0; i < n * n; i++) {
    if (onBuilding[i]) continue;
    const e = elevs[i];
    if (e == null || !Number.isFinite(filled[i])) continue;
    const pondCm = (filled[i] - e) * 100;
    if (pondCm <= 1 || pondCm > ARTIFACT_CM) continue;
    values[i] = Math.min(pondCm, POND_MAX_CM);
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

  console.log(
    `[pluvial] buildings: ${rings.length} rings · in-zone cells: ${zoneCells} (ground ${ground} · rooftop ${rooftop} · no terrain ${noTerrain})`,
  );

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
  return field;
}
