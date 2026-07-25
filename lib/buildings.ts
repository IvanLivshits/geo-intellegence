import type { OsmElement, OsmGeometryPoint } from './noise-model';

export interface BuildingRing {
  pts: [number, number][];
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

function toRing(geom: OsmGeometryPoint[] | undefined): BuildingRing | null {
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

export function buildingRings(els: OsmElement[] | undefined): BuildingRing[] {
  if (!Array.isArray(els)) return [];
  const rings: BuildingRing[] = [];
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

function insideRing(x: number, y: number, r: BuildingRing): boolean {
  if (x < r.xmin || x > r.xmax || y < r.ymin || y > r.ymax) return false;
  let inside = false;
  const p = r.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inAnyBuilding(x: number, y: number, rings: BuildingRing[]): boolean {
  for (const r of rings) {
    if (insideRing(x, y, r)) return true;
  }
  return false;
}
