import { haversine } from './geo-math';

export interface OsmGeometryPoint {
  lat: number;
  lon: number;
}

export interface OsmMember {
  type?: string;
  role?: string;
  geometry?: OsmGeometryPoint[];
}

export interface OsmElement {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: OsmGeometryPoint[];
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  members?: OsmMember[];
}

const ROAD_DB: Record<string, number> = {
  motorway: 80,
  trunk: 77,
  primary: 72,
  secondary: 67,
  tertiary: 62,
  residential: 57,
  living_street: 52,
  service: 50,
};
const RAIL_DB = 75;

function attenuate(refDb: number, dist: number): number {
  const d = Math.max(dist, 10);
  return refDb - 10 * Math.log10(d / 10);
}

interface SourceClass {
  ref: number;
  kind: string;
}

interface NearestSource {
  db: number;
  dist: number;
  kind: string;
}

function nearestByClass(
  elements: OsmElement[],
  lat: number,
  lon: number,
  classer: (tags: Record<string, string>) => SourceClass | null,
): NearestSource | null {
  let best: NearestSource | null = null;
  for (const el of elements) {
    const cls = classer(el.tags || {});
    if (cls == null) continue;
    const geom: OsmGeometryPoint[] =
      el.geometry || (el.lat != null ? [{ lat: el.lat, lon: el.lon as number }] : []);
    for (const pt of geom) {
      const d = haversine(lat, lon, pt.lat, pt.lon);
      const db = attenuate(cls.ref, d);
      if (!best || db > best.db) best = { db, dist: Math.round(d), kind: cls.kind };
    }
  }
  return best;
}

export interface LdenResult {
  lden: number | null;
  dominant: NearestSource | null;
  road: NearestSource | null;
  rail: NearestSource | null;
}

export function ldenAt(lat: number, lon: number, elements: OsmElement[]): LdenResult {
  const road = nearestByClass(elements, lat, lon, (t) => {
    if (!t.highway || ROAD_DB[t.highway] == null) return null;
    return { ref: ROAD_DB[t.highway], kind: `дорога (${t.highway})` };
  });
  const rail = nearestByClass(elements, lat, lon, (t) =>
    t.railway === 'rail' ? { ref: RAIL_DB, kind: 'ж/д' } : null,
  );

  const sources = [road, rail].filter(Boolean) as NearestSource[];
  let lden: number | null = null;
  let dominant: NearestSource | null = null;
  if (sources.length) {
    const energy = sources.reduce((s, x) => s + 10 ** (x.db / 10), 0);
    lden = Math.round(10 * Math.log10(energy));
    dominant = sources.reduce((a, b) => (b.db > a.db ? b : a));
  }
  return { lden, dominant, road, rail };
}
