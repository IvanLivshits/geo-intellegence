import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { metresToDegLat, metresToDegLon } from '@/lib/geo-math';
import { cacheGet, cacheSet } from '@/lib/cache';
import type { Building } from '@/lib/types';

const execFileAsync = promisify(execFile);

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const RELEASE = '2026-06-17.0';
const NOTE =
  'Здания · Overture (OSM ∪ Google Open Buildings ∪ Microsoft). Высота часто отсутствует → дефолт 10 м.';

interface Box {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

interface OvertureRow {
  g: { type: string; coordinates: unknown };
  height: number | null;
  num_floors: number | null;
}

interface OvertureResult {
  buildings: Building[];
  count: number;
  note: string;
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

function resolveHeight(height: number | null, numFloors: number | null): number {
  if (typeof height === 'number' && height > 0) return height;
  if (typeof numFloors === 'number' && numFloors > 0) return numFloors * 3;
  return 10;
}

function toRing(coords: unknown): [number, number][] {
  const ring = coords as [number, number][];
  return ring.map((p): [number, number] => [p[0], p[1]]);
}

function rowsToBuildings(rows: OvertureRow[], box: Box): Building[] {
  const buildings: Building[] = [];
  for (const row of rows) {
    if (!row || !row.g) continue;
    const height = resolveHeight(row.height, row.num_floors);
    const rings: [number, number][][] = [];
    if (row.g.type === 'Polygon') {
      const c = row.g.coordinates as unknown[];
      if (Array.isArray(c) && c.length) rings.push(toRing(c[0]));
    } else if (row.g.type === 'MultiPolygon') {
      const c = row.g.coordinates as unknown[][];
      for (const poly of c) {
        if (Array.isArray(poly) && poly.length) rings.push(toRing(poly[0]));
      }
    }
    for (const ring of rings) {
      if (ring.length < 3) continue;
      const clipped = clipPolygonToBox(ring, box);
      if (clipped) buildings.push({ polygon: clipped, height });
    }
  }
  return buildings;
}

export async function computeOvertureBuildings(input: {
  lat: number;
  lon: number;
  radius?: number;
}): Promise<OvertureResult> {
  const { lat, lon, radius = 500 } = input;

  const box: Box = {
    xmin: lon - metresToDegLon(radius, lat),
    xmax: lon + metresToDegLon(radius, lat),
    ymin: lat - metresToDegLat(radius),
    ymax: lat + metresToDegLat(radius),
  };

  const key = createHash('sha1')
    .update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius}`)
    .digest('hex');
  const cacheKey = `overture:${key}`;

  const cached = await cacheGet<OvertureResult>(cacheKey);
  if (cached != null) {
    console.log('[здания] кэш ✓ Overture');
    return cached;
  }

  const query =
    `LOAD httpfs; LOAD spatial; SET s3_region='us-west-2';\n` +
    `SELECT ST_AsGeoJSON(geometry) AS g, height, num_floors\n` +
    `FROM read_parquet('s3://overturemaps-us-west-2/release/${RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)\n` +
    `WHERE bbox.xmin BETWEEN ${box.xmin} AND ${box.xmax} AND bbox.ymin BETWEEN ${box.ymin} AND ${box.ymax};`;

  const binary = join(process.cwd(), 'bin', 'duckdb');
  console.log(`[здания] Overture-запрос · bbox ±${radius} м · ${lat.toFixed(4)}, ${lon.toFixed(4)}`);

  let stdout: string;
  try {
    const result = await execFileAsync(binary, ['-json', '-c', query], {
      timeout: 150000,
      maxBuffer: 256 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (err) {
    throw new Error(`Overture/DuckDB запрос не выполнен: ${(err as Error).message}`);
  }

  let rows: OvertureRow[];
  try {
    const trimmed = stdout.trim();
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    if (!Array.isArray(parsed)) throw new Error('ожидался массив');
    rows = parsed as OvertureRow[];
  } catch (err) {
    throw new Error(`Overture: не удалось разобрать вывод DuckDB как JSON: ${(err as Error).message}`);
  }

  const geoRows: OvertureRow[] = rows.map((r) => ({
    g: typeof r.g === 'string' ? JSON.parse(r.g as unknown as string) : r.g,
    height: r.height,
    num_floors: r.num_floors,
  }));

  const buildings = rowsToBuildings(geoRows, box);
  const result: OvertureResult = { buildings, count: buildings.length, note: NOTE };
  console.log(`[здания] Overture получено · зданий: ${result.count}`);

  await cacheSet(cacheKey, result, CACHE_TTL_MS);

  return result;
}

const DECORATIVE_WATER_SUBTYPES = new Set([
  'pond',
  'fountain',
  'swimming_pool',
  'basin',
  'reflecting_pool',
  'wastewater',
]);
const AREA_GATED_SUBTYPES = new Set(['lake', 'reservoir', 'lagoon']);
const WATER_MIN_AREA_M2 = 100000;
const MAX_WATER_POINTS = 4000;

interface OvertureWaterRow {
  g: { type: string; coordinates: unknown } | string;
  subtype: string | null;
  class: string | null;
}

interface WaterGeom {
  type: string;
  coordinates: unknown;
}

function collectVertices(coords: unknown, out: [number, number][]): void {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    out.push([coords[0] as number, coords[1] as number]);
    return;
  }
  for (const c of coords) collectVertices(c, out);
}

function outerRingAreaM2(geom: WaterGeom): number {
  const rings: [number, number][][] = [];
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
    rings.push((geom.coordinates as [number, number][][])[0] || []);
  } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    for (const poly of geom.coordinates as [number, number][][][]) rings.push(poly[0] || []);
  }
  let total = 0;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const kx = 111320 * Math.cos((ring[0][1] * Math.PI) / 180);
    const ky = 111320;
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      sum += a[0] * kx * (b[1] * ky) - b[0] * kx * (a[1] * ky);
    }
    total += Math.abs(sum) / 2;
  }
  return total;
}

export async function computeOvertureWater(input: {
  lat: number;
  lon: number;
  radius?: number;
}): Promise<{ lat: number; lon: number }[]> {
  const { lat, lon, radius = 500 } = input;
  const west = lon - metresToDegLon(radius, lat);
  const east = lon + metresToDegLon(radius, lat);
  const south = lat - metresToDegLat(radius);
  const north = lat + metresToDegLat(radius);

  const key =
    'overture-water:' +
    createHash('sha1').update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius}`).digest('hex');
  const cached = await cacheGet<{ lat: number; lon: number }[]>(key);
  if (cached != null) {
    console.log('[вода] кэш ✓ Overture water');
    return cached;
  }

  const query =
    `LOAD httpfs; LOAD spatial; SET s3_region='us-west-2';\n` +
    `SELECT ST_AsGeoJSON(geometry) AS g, subtype, class\n` +
    `FROM read_parquet('s3://overturemaps-us-west-2/release/${RELEASE}/theme=base/type=water/*', hive_partitioning=1)\n` +
    `WHERE bbox.xmin <= ${east} AND bbox.xmax >= ${west} AND bbox.ymin <= ${north} AND bbox.ymax >= ${south};`;

  const binary = join(process.cwd(), 'bin', 'duckdb');
  console.log(`[вода] Overture-запрос (S3-фолбэк) · bbox ±${radius} м · ${lat.toFixed(4)}, ${lon.toFixed(4)}`);

  const result = await execFileAsync(binary, ['-json', '-c', query], {
    timeout: 150000,
    maxBuffer: 256 * 1024 * 1024,
  });
  const trimmed = result.stdout.trim();
  const rows: OvertureWaterRow[] = trimmed ? JSON.parse(trimmed) : [];

  const points: { lat: number; lon: number }[] = [];
  for (const row of rows) {
    const subtype = (row.subtype || row.class || '').toLowerCase();
    if (DECORATIVE_WATER_SUBTYPES.has(subtype)) continue;
    const geom: WaterGeom = typeof row.g === 'string' ? JSON.parse(row.g) : row.g;
    if (!geom || !geom.type) continue;
    if (AREA_GATED_SUBTYPES.has(subtype) && outerRingAreaM2(geom) < WATER_MIN_AREA_M2) continue;
    const verts: [number, number][] = [];
    collectVertices(geom.coordinates, verts);
    for (const [vlon, vlat] of verts) {
      if (vlon >= west && vlon <= east && vlat >= south && vlat <= north) {
        points.push({ lat: vlat, lon: vlon });
      }
    }
  }

  let capped = points;
  if (points.length > MAX_WATER_POINTS) {
    const stride = Math.ceil(points.length / MAX_WATER_POINTS);
    capped = [];
    for (let i = 0; i < points.length; i += stride) capped.push(points[i]);
  }

  console.log(`[вода] Overture water · точек: ${capped.length}`);
  await cacheSet(key, capped, CACHE_TTL_MS);
  return capped;
}
