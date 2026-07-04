import { haversine, metresToDegLat, metresToDegLon } from './geo';
import { overpass } from './http';
import { sampleElevations } from './dem';
import type { OsmElement, OsmGeometryPoint } from './noise-model';
import { extractActivity } from './activity-sources';
import { computeOvertureBuildings } from './overture';
import { computeAllMasks } from './masks';
import { RADIUS } from './constants';
import type { Building, Road, ScanPayload } from './types';

interface Box {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

function buildingHeight(tags: Record<string, string> = {}): number {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 0) return h;
  const lv = parseFloat(tags['building:levels']);
  if (Number.isFinite(lv) && lv > 0) return lv * 3;
  return 10;
}

const ROAD_WIDTH: Record<string, number> = {
  motorway: 20,
  trunk: 17,
  primary: 13,
  secondary: 10,
  tertiary: 8,
  residential: 5.5,
  living_street: 5,
  service: 3.5,
  rail: 4,
};
function roadWidth(cls: string): number {
  return ROAD_WIDTH[cls] ?? 4;
}

type SegPoint = [number, number, number];
type ClippedSegment = [SegPoint, SegPoint, number, number];

function clipSegment(p0: SegPoint, p1: SegPoint, box: Box): ClippedSegment | null {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const p = [-dx, dx, -dy, dy];
  const q = [p0[0] - box.xmin, box.xmax - p0[0], p0[1] - box.ymin, box.ymax - p0[1]];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  const z = p0[2] ?? 1;
  return [
    [p0[0] + t0 * dx, p0[1] + t0 * dy, z],
    [p0[0] + t1 * dx, p0[1] + t1 * dy, z],
    t0,
    t1,
  ];
}

function clipPolygonToBox(poly: [number, number][], box: Box): [number, number][] | null {
  let pts: [number, number][] = poly.map((p) => [p[0], p[1]]);
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  const ix = (a: [number, number], b: [number, number], x: number): [number, number] => [
    x,
    a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]),
  ];
  const iy = (a: [number, number], b: [number, number], y: number): [number, number] => [
    a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]),
    y,
  ];
  const edges = [
    { in: (p: [number, number]) => p[0] >= box.xmin, cut: (a: [number, number], b: [number, number]) => ix(a, b, box.xmin) },
    { in: (p: [number, number]) => p[0] <= box.xmax, cut: (a: [number, number], b: [number, number]) => ix(a, b, box.xmax) },
    { in: (p: [number, number]) => p[1] >= box.ymin, cut: (a: [number, number], b: [number, number]) => iy(a, b, box.ymin) },
    { in: (p: [number, number]) => p[1] <= box.ymax, cut: (a: [number, number], b: [number, number]) => iy(a, b, box.ymax) },
  ];
  for (const e of edges) {
    if (!pts.length) break;
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const curIn = e.in(cur);
      const prevIn = e.in(prev);
      if (curIn) {
        if (!prevIn) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(e.cut(prev, cur));
      }
    }
    pts = out;
  }
  return pts.length >= 3 ? pts : null;
}

function clipPathToBox(coords: SegPoint[], box: Box): SegPoint[][] {
  const out: SegPoint[][] = [];
  let cur: SegPoint[] | null = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const seg = clipSegment(coords[i], coords[i + 1], box);
    if (!seg) {
      cur = null;
      continue;
    }
    const [a, b, t0, t1] = seg;
    if (t0 > 0 || !cur) {
      cur = [a];
      out.push(cur);
    }
    cur.push(b);
    if (t1 < 1) cur = null;
  }
  return out.filter((pts) => pts.length >= 2);
}

export interface ScanInput {
  lat: number;
  lon: number;
  radius?: number;
  label?: string | null;
}

export async function computeScan(input: ScanInput): Promise<ScanPayload> {
  const { lat, lon, radius = RADIUS, label = null } = input;

  const box: Box = {
    xmin: lon - metresToDegLon(radius, lat),
    xmax: lon + metresToDegLon(radius, lat),
    ymin: lat - metresToDegLat(radius),
    ymax: lat + metresToDegLat(radius),
  };
  const bbox = `${box.ymin},${box.xmin},${box.ymax},${box.xmax}`;
  const q = `[out:json][timeout:60];
      ( way(${bbox})[highway];
        way(${bbox})[railway=rail]; )->.roads;
      ( way(${bbox})[building];
        relation(${bbox})[building]; )->.bld;
      ( nwr(${bbox})[amenity~"^(nightclub|bar|pub|marketplace|cinema|theatre|events_venue|bus_station|fuel)$"];
        nwr(${bbox})[shop=mall];
        nwr(${bbox})[building=retail];
        nwr(${bbox})[leisure=stadium];
        nwr(${bbox})[railway~"^(station|subway_entrance|tram_stop)$"];
        nwr(${bbox})[landuse~"^(construction|industrial)$"];
        nwr(${bbox})[man_made=storage_tank];
        nwr(${bbox})[aeroway=aerodrome];
        nwr(${bbox})[power=substation]; )->.act;
      ( way(${bbox})[power=line]; )->.pw;
      .roads out geom;
      .bld out geom;
      .act out center;
      .pw out geom;`;

  const overturePromise = computeOvertureBuildings({ lat, lon, radius }).catch((err) => {
    console.warn(`[overture] застройка недоступна, фолбэк на OSM: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });

  console.log(`[карта] OSM-запрос Overpass · bbox ±${radius} м · ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  const res = await overpass(q);
  const els: OsmElement[] = res.elements || [];
  console.log(`[карта] OSM получен · элементов: ${els.length}`);

  const masksPromise = computeAllMasks({ lat, lon, radius, osmElements: els });

  const osmBuildings: Building[] = [];
  const sourceEls: OsmElement[] = [];
  const addBuilding = (ring: OsmGeometryPoint[] | undefined, height: number): void => {
    if (!Array.isArray(ring) || ring.length < 3) return;
    const clipped = clipPolygonToBox(
      ring.map((p): [number, number] => [p.lon, p.lat]),
      box,
    );
    if (clipped) osmBuildings.push({ polygon: clipped, height });
  };
  for (const el of els) {
    const t = el.tags || {};
    if (t.building) {
      const height = buildingHeight(t);
      if (el.type === 'way') {
        addBuilding(el.geometry, height);
      } else if (el.type === 'relation' && Array.isArray(el.members)) {
        for (const m of el.members) {
          if (m.type === 'way' && (m.role === 'outer' || !m.role)) addBuilding(m.geometry, height);
        }
      }
    }
    if (el.type === 'way' && (t.highway || t.railway === 'rail')) sourceEls.push(el);
  }

  const roads: Road[] = [];
  for (const el of sourceEls) {
    if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const t = el.tags || {};
    const cls = t.railway === 'rail' ? 'rail' : t.highway;
    const coords: SegPoint[] = el.geometry.map((p): SegPoint => [p.lon, p.lat, 4]);
    for (const path of clipPathToBox(coords, box)) {
      roads.push({ path, width: roadWidth(cls), rail: cls === 'rail' });
    }
  }

  const powerLines: Road[] = [];
  for (const el of els) {
    const t = el.tags || {};
    if (el.type !== 'way' || t.power !== 'line') continue;
    if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const coords: SegPoint[] = el.geometry.map((p): SegPoint => [p.lon, p.lat, 8]);
    for (const path of clipPathToBox(coords, box)) {
      powerLines.push({ path, width: 2, rail: false });
    }
  }

  const activity = extractActivity(els, lat, lon, radius);

  const elevationPromise = sampleElevations([{ lat, lon }])
    .then((e) => e[0])
    .catch(() => null);

  const [overture, masks, elevation] = await Promise.all([
    overturePromise,
    masksPromise,
    elevationPromise,
  ]);
  const buildings =
    overture && overture.buildings.length > osmBuildings.length ? overture.buildings : osmBuildings;
  const buildingsSource = buildings === osmBuildings ? 'OSM' : 'Overture';
  console.log(
    `[карта] застройка: ${buildingsSource} ${buildings.length} (OSM ${osmBuildings.length}) · дороги/ж-д: ${roads.length} · активность: ${activity.length} · маски: шум ${masks.noise.avg ?? '—'} дБ · воздух ${masks.air.avg ?? '—'} · затопление ${masks.flood.avg ?? '—'}`,
  );

  let roadsM = 0;
  for (const r of roads) {
    for (let i = 0; i < r.path.length - 1; i++) {
      roadsM += haversine(r.path[i][1], r.path[i][0], r.path[i + 1][1], r.path[i + 1][0]);
    }
  }
  const heights = buildings.map((b) => b.height).filter((h) => Number.isFinite(h) && h > 0);
  const facts = {
    elevationM: elevation != null ? Math.round(elevation) : null,
    roadsKm: Math.round(roadsM / 100) / 10,
    buildingHeightAvgM: heights.length
      ? Math.round((heights.reduce((s, h) => s + h, 0) / heights.length) * 10) / 10
      : null,
  };

  return {
    center: [lon, lat],
    radius,
    label,
    buildings,
    roads,
    powerLines,
    activity,
    masks,
    facts,
  };
}
