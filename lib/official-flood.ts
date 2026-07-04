import { fromUrl } from 'geotiff';
import { createHash } from 'node:crypto';
import { metresToDegLat, metresToDegLon } from './geo';
import { cacheGet, cacheSet } from './cache';
import { fieldFromValues, type MaskField } from './mask-field';
import { Q100_RAMP } from './constants';
import type { MaskContext } from './masks';

const BASE = 'http://wri-projects.s3.amazonaws.com/AqueductFloodTool/download/v2';
const SCENARIOS = {
  now: {
    tag: 'v2',
    river: `${BASE}/inunriver_historical_000000000WATCH_1980_rp00100.tif`,
    coast: `${BASE}/inuncoast_historical_wtsub_hist_rp0100_0.tif`,
    label: 'Паводок Q100 · WRI',
    note: 'Официальная глобальная модель: WRI Aqueduct (GLOFRIS) — глубина паводка «раз в 100 лет», max(речной, прибрежный с учётом проседания грунта). Разрешение ~1 км, БЕЗ локальной инженерной защиты. Ливни/дренаж не входят — см. маски «Риск разлива рек» и «Ливневое подтопление».',
  },
  future2050: {
    tag: 'f2050',
    river: `${BASE}/inunriver_rcp8p5_00000NorESM1-M_2050_rp00100.tif`,
    coast: `${BASE}/inuncoast_rcp8p5_wtsub_2050_rp0100_0.tif`,
    label: 'Паводок Q100 · 2050 · WRI',
    note: 'Климатический сценарий 2050 года (RCP 8.5, модель NorESM1-M): глубина 100-летнего паводка при пессимистичной траектории выбросов, max(речной, прибрежный с проседанием). WRI Aqueduct, ~1 км, без локальной защиты. Сравнивайте с сегодняшним Q100: значения могут быть и выше, и НИЖЕ сегодняшних — климат меняет осадки в обе стороны (Средиземноморье, например, сохнет).',
  },
} as const;

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const GRID_N = 48;
const DEPTH_MAX_CM = 300;

async function sampleRaster(
  url: string,
  cells: { lat: number; lon: number }[],
): Promise<(number | null)[]> {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const [west, south, east, north] = image.getBoundingBox();
  const resX = (east - west) / image.getWidth();
  const resY = (north - south) / image.getHeight();
  const px = (vLon: number) => Math.floor((vLon - west) / resX);
  const py = (vLat: number) => Math.floor((north - vLat) / resY);

  let x0 = image.getWidth();
  let x1 = 0;
  let y0 = image.getHeight();
  let y1 = 0;
  for (const c of cells) {
    const ix = px(c.lon);
    const iy = py(c.lat);
    if (ix < x0) x0 = ix;
    if (ix > x1) x1 = ix;
    if (iy < y0) y0 = iy;
    if (iy > y1) y1 = iy;
  }
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(image.getWidth() - 1, x1 + 1);
  y1 = Math.min(image.getHeight() - 1, y1 + 1);

  const rasters = await image.readRasters({ window: [x0, y0, x1 + 1, y1 + 1] });
  const band = rasters[0];
  if (typeof band === 'number' || !band) return cells.map(() => null);
  const width = x1 + 1 - x0;

  return cells.map((c) => {
    const ix = px(c.lon) - x0;
    const iy = py(c.lat) - y0;
    if (ix < 0 || iy < 0 || ix >= width) return null;
    const v = (band as ArrayLike<number>)[iy * width + ix];
    return Number.isFinite(v) && v > 0 ? v : null;
  });
}

async function computeScenario(
  ctx: MaskContext,
  scenario: (typeof SCENARIOS)[keyof typeof SCENARIOS],
): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = GRID_N;

  const key =
    'q100:' +
    createHash('sha1')
      .update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius},${scenario.tag}`)
      .digest('hex');
  const cached = await cacheGet<MaskField>(key);
  if (cached != null) {
    console.log(`[q100] кэш ✓ WRI Aqueduct (${scenario.tag})`);
    return cached;
  }

  const cellM = (radius * 2) / n;
  const cells: { lat: number; lon: number }[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const dy = -radius + cellM * (r + 0.5);
      const dx = -radius + cellM * (c + 0.5);
      cells.push({ lat: lat - metresToDegLat(dy), lon: lon + metresToDegLon(dx, lat) });
    }
  }

  console.log(`[q100] WRI Aqueduct RP100 (${scenario.tag}) · bbox ±${radius} м · ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  const [river, coast] = await Promise.all([
    sampleRaster(scenario.river, cells).catch(() => cells.map(() => null)),
    sampleRaster(scenario.coast, cells).catch(() => cells.map(() => null)),
  ]);

  const values: (number | null)[] = cells.map((_, i) => {
    const depth = Math.max(river[i] ?? 0, coast[i] ?? 0);
    if (depth <= 0) return null;
    return Math.min(depth * 100, DEPTH_MAX_CM);
  });

  const stats = fieldFromValues(values, n, Q100_RAMP, 0, DEPTH_MAX_CM, 110, 220);
  const result: MaskField = {
    n,
    rgba: stats.rgba,
    avg: stats.avg,
    min: stats.min,
    max: stats.max,
    unit: 'см',
    label: scenario.label,
    note: scenario.note,
  };
  await cacheSet(key, result, CACHE_TTL_MS);
  return result;
}

export function computeOfficialFloodMask(ctx: MaskContext): Promise<MaskField> {
  return computeScenario(ctx, SCENARIOS.now);
}

export function computeOfficialFloodFutureMask(ctx: MaskContext): Promise<MaskField> {
  return computeScenario(ctx, SCENARIOS.future2050);
}
