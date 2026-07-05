import { gridCells, haversine, metresToDegLat, metresToDegLon } from '@/lib/geo-math';
import { overpass } from '@/lib/http';
import { computeOvertureWater } from '@/lib/overture';
import { sampleElevations, type DemPoint } from '@/lib/dem';
import { makeField, type MaskField } from '@/lib/mask-field';
import { clipToZone, properCross } from '@/lib/polygon';
import { FLOOD_RAMP } from '@/lib/constants';
import type { MaskContext } from '@/lib/masks';

interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type?: string;
  tags?: Record<string, string>;
  geometry?: OverpassGeomPoint[];
  members?: { geometry?: OverpassGeomPoint[] }[];
}

const HAND_SPAN_M = 10;
const MAX_WATER_POINTS = 4000;
const PROTECTION_FACTOR = 0.35;
const DEFENSE_MANMADE = new Set(['dyke', 'embankment', 'levee', 'flood_wall']);
const DEFENSE_BARRIER = new Set(['flood_wall', 'flood_barrier']);

type LonLat = [number, number];
type Segment = [LonLat, LonLat];

const WATER_MIN_AREA_M2 = 100000;
const DECORATIVE_WATER = new Set([
  'pond',
  'fountain',
  'basin',
  'reflecting_pool',
  'swimming_pool',
  'wastewater',
]);

function ringAreaM2(ring: OverpassGeomPoint[]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const lat0 = ring[0].lat;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 111320;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.lon * kx * (b.lat * ky) - b.lon * kx * (a.lat * ky);
  }
  return Math.abs(sum) / 2;
}

async function fetchWaterPoints(
  lat: number,
  lon: number,
  radius: number,
): Promise<{
  points: DemPoint[];
  sampled: boolean;
  failed: boolean;
  defenses: Segment[];
  pumps: number;
}> {
  const ymin = lat - metresToDegLat(radius);
  const ymax = lat + metresToDegLat(radius);
  const xmin = lon - metresToDegLon(radius, lat);
  const xmax = lon + metresToDegLon(radius, lat);
  const bbox = `${ymin},${xmin},${ymax},${xmax}`;
  const q = `[out:json][timeout:60];
      ( way(${bbox})[natural=water];
        relation(${bbox})[natural=water];
        way(${bbox})[waterway~"^(river|stream|canal|drain)$"]; )->.w;
      ( way(${bbox})[man_made~"^(dyke|embankment|levee|flood_wall)$"];
        way(${bbox})[barrier~"^(flood_wall|flood_barrier)$"];
        way(${bbox})[waterway=dam]; )->.def;
      ( nwr(${bbox})[man_made=pumping_station]; )->.pump;
      .w out geom;
      .def out geom;
      .pump out center;`;

  let els: OverpassElement[] = [];
  let failed = false;
  try {
    const res = await overpass(q);
    els = ((res as { elements?: OverpassElement[] }).elements || []) as OverpassElement[];
  } catch {
    failed = true;
  }

  const points: DemPoint[] = [];
  const defenses: Segment[] = [];
  let pumps = 0;
  const collect = (geom?: OverpassGeomPoint[]): void => {
    if (!Array.isArray(geom)) return;
    for (const p of geom) {
      if (typeof p.lat === 'number' && typeof p.lon === 'number') {
        points.push({ lat: p.lat, lon: p.lon });
      }
    }
  };
  const collectDefense = (geom?: OverpassGeomPoint[]): void => {
    if (!Array.isArray(geom)) return;
    for (let i = 0; i < geom.length - 1; i++) {
      defenses.push([
        [geom[i].lon, geom[i].lat],
        [geom[i + 1].lon, geom[i + 1].lat],
      ]);
    }
  };
  for (const el of els) {
    const t = el.tags || {};
    if (t.man_made === 'pumping_station') {
      pumps++;
      continue;
    }
    if (
      DEFENSE_MANMADE.has(t.man_made || '') ||
      DEFENSE_BARRIER.has(t.barrier || '') ||
      t.waterway === 'dam'
    ) {
      collectDefense(el.geometry);
      continue;
    }
    if (t.waterway) {
      collect(el.geometry);
      continue;
    }
    if (DECORATIVE_WATER.has(t.water || '')) continue;
    let area = ringAreaM2(el.geometry || []);
    if (Array.isArray(el.members)) {
      for (const m of el.members) area += ringAreaM2(m.geometry || []);
    }
    if (area < WATER_MIN_AREA_M2) continue;
    collect(el.geometry);
    if (Array.isArray(el.members)) {
      for (const m of el.members) collect(m.geometry);
    }
  }

  if (points.length <= MAX_WATER_POINTS) return { points, sampled: false, failed, defenses, pumps };
  const stride = Math.ceil(points.length / MAX_WATER_POINTS);
  const sampledPoints: DemPoint[] = [];
  for (let i = 0; i < points.length; i += stride) sampledPoints.push(points[i]);
  return { points: sampledPoints, sampled: true, failed, defenses, pumps };
}

export async function computeFloodMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = 48;

  const cells = gridCells(lat, lon, radius, n);

  let waterRes = await fetchWaterPoints(lat, lon, radius * 2.5);
  if (waterRes.failed) {
    console.warn('[затопление] все зеркала Overpass недоступны — фолбэк на Overture water (S3)');
    try {
      const points = await computeOvertureWater({ lat, lon, radius: radius * 2.5 });
      waterRes = { points, sampled: false, failed: false, defenses: [], pumps: 0 };
    } catch (err) {
      console.warn(`[затопление] Overture water тоже недоступен: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const elevations = await sampleElevations([...cells, ...waterRes.points]);
  const cellElevs = elevations.slice(0, cells.length);
  const rawWaterElevs = elevations.slice(cells.length);

  const water: { lat: number; lon: number; elev: number }[] = [];
  waterRes.points.forEach((p, i) => {
    const e = rawWaterElevs[i];
    if (e != null) water.push({ lat: p.lat, lon: p.lon, elev: e });
  });

  const values: (number | null)[] = new Array(n * n).fill(null);
  let protectedCells = 0;
  for (let i = 0; i < n * n; i++) {
    if (waterRes.failed) break;
    const elev = cellElevs[i];
    if (elev == null) continue;
    if (!water.length) {
      values[i] = 0;
      continue;
    }
    let best = Infinity;
    let bestElev = elev;
    let bestPt: LonLat = [cells[i].lon, cells[i].lat];
    for (const w of water) {
      const d = haversine(cells[i].lat, cells[i].lon, w.lat, w.lon);
      if (d < best) {
        best = d;
        bestElev = w.elev;
        bestPt = [w.lon, w.lat];
      }
    }
    const hand = Math.max(0, elev - bestElev);
    let risk = Math.max(0, Math.min(1, 1 - hand / HAND_SPAN_M)) * 100;
    if (risk > 0 && waterRes.defenses.length) {
      const cellPt: LonLat = [cells[i].lon, cells[i].lat];
      for (const [a, b] of waterRes.defenses) {
        if (properCross(cellPt, bestPt, a, b)) {
          risk *= PROTECTION_FACTOR;
          protectedCells++;
          break;
        }
      }
    }
    values[i] = risk;
  }

  const missing = cellElevs.filter((e) => e == null).length;
  const baseNote = water.length
    ? `Модель HAND-lite: высота над ближайшей водой (реки/каналы/крупные водоёмы OSM в радиусе ${Math.round(radius * 2.5)} м; пруды и фонтаны игнорируются), рельеф Copernicus DEM GLO-30 (~30 м). ${HAND_SPAN_M}+ м над водой → риск 0. НЕ официальная карта затоплений.`
    : `В радиусе ${Math.round(radius * 2.5)} м нет значимой воды (OSM) — рельефная экспозиция минимальна, риск ~0. НЕ официальная карта затоплений.`;
  let note = waterRes.sampled ? `${baseNote} Точки воды прорежены для скорости.` : baseNote;
  if (waterRes.defenses.length) {
    const protectedPct = Math.round((protectedCells / (n * n)) * 100);
    note = `Инженерная защита учтена: дамбы/валы (${waterRes.defenses.length} сегм.)${waterRes.pumps ? ` + насосные ×${waterRes.pumps}` : ''} — за сооружением риск ×${PROTECTION_FACTOR} (затронуто ${protectedPct}% ячеек). Защита НЕ абсолютна. ${note}`;
  } else if (waterRes.pumps > 0) {
    note = `Рядом насосные станции (×${waterRes.pumps}), но линейных дамб/валов в OSM не найдено — инженерный дисконт не применён. ${note}`;
  } else if (!waterRes.failed && water.length) {
    note = `Защитные сооружения в OSM рядом не найдены (или не замаплены) — риск без инженерного дисконта. ${note}`;
  }
  if (waterRes.failed) {
    note = '⚠ Данные о воде недоступны (Overpass не ответил) — поле не рассчитано. Перестройте позже. НЕ официальная карта затоплений.';
  }
  if (missing > 0) {
    const pct = Math.round((missing / (n * n)) * 100);
    note = `⚠ Поле НЕПОЛНОЕ: высоты получены для ${n * n - missing} из ${n * n} ячеек (${pct}% пропущено). Перестройте позже. ${note}`;
  }

  const field = makeField(clipToZone(values, n, radius, ctx.zone), n, {
    ramp: FLOOD_RAMP,
    lo: 0,
    hi: 100,
    alphaMin: 0,
    alphaMax: 210,
    unit: '%',
    label: 'Риск разлива рек (модель)',
    note,
  });
  if (waterRes.failed || missing > 0) field.degraded = true;
  return field;
}
