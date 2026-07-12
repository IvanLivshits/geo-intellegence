import { fromUrl } from 'geotiff';
import { createHash } from 'node:crypto';
import { gridCells } from './geo-math';
import { cacheGet, cacheSet } from './cache';
import { sampleImageAt } from './raster';
import { makeField, type MaskField } from './mask-field';
import { clipToZone } from './polygon';
import { Q100_RAMP } from './constants';
import type { MaskContext } from './masks';

const BASE = 'http://wri-projects.s3.amazonaws.com/AqueductFloodTool/download/v2';
const SCENARIOS = {
  now: {
    tag: 'v2',
    river: `${BASE}/inunriver_historical_000000000WATCH_1980_rp00100.tif`,
    coast: `${BASE}/inuncoast_historical_wtsub_hist_rp0100_0.tif`,
    label: 'Flood Q100 · WRI',
    note: 'Official global model: WRI Aqueduct (GLOFRIS) — depth of a "once in 100 years" flood, max(riverine, coastal including land subsidence). Resolution ~1 km, WITHOUT local engineered defences. Rainfall/drainage are not included — see the "River flood risk" and "Pluvial flooding" masks.',
  },
  future2050: {
    tag: 'f2050',
    river: `${BASE}/inunriver_rcp8p5_00000NorESM1-M_2050_rp00100.tif`,
    coast: `${BASE}/inuncoast_rcp8p5_wtsub_2050_rp0100_0.tif`,
    label: 'Flood Q100 · 2050 · WRI',
    note: 'Climate scenario for 2050 (RCP 8.5, NorESM1-M model): depth of a 100-year flood under a pessimistic emissions trajectory, max(riverine, coastal with subsidence). WRI Aqueduct, ~1 km, without local defences. Compare with today\'s Q100: values can be both higher and LOWER than today\'s — climate shifts precipitation in both directions (the Mediterranean, for instance, is drying out).',
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
  return sampleImageAt(image, cells);
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
      .update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius},${scenario.tag},${ctx.zoneTag || ''}`)
      .digest('hex');
  const cached = await cacheGet<MaskField>(key);
  if (cached != null) {
    console.log(`[q100] cache ✓ WRI Aqueduct (${scenario.tag})`);
    return cached;
  }

  const cells = gridCells(lat, lon, radius, n);

  console.log(`[q100] WRI Aqueduct RP100 (${scenario.tag}) · bbox ±${radius} m · ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  const [river, coast] = await Promise.all([
    sampleRaster(scenario.river, cells).catch(() => cells.map(() => null)),
    sampleRaster(scenario.coast, cells).catch(() => cells.map(() => null)),
  ]);

  const values: (number | null)[] = cells.map((_, i) => {
    const depth = Math.max(river[i] ?? 0, coast[i] ?? 0);
    if (depth <= 0) return null;
    return Math.min(depth * 100, DEPTH_MAX_CM);
  });

  const result = makeField(clipToZone(values, n, radius, ctx.zone), n, {
    ramp: Q100_RAMP,
    lo: 0,
    hi: DEPTH_MAX_CM,
    alphaMin: 110,
    alphaMax: 220,
    unit: 'cm',
    label: scenario.label,
    note: scenario.note,
  });
  await cacheSet(key, result, CACHE_TTL_MS);
  return result;
}

export function computeOfficialFloodMask(ctx: MaskContext): Promise<MaskField> {
  return computeScenario(ctx, SCENARIOS.now);
}

export function computeOfficialFloodFutureMask(ctx: MaskContext): Promise<MaskField> {
  return computeScenario(ctx, SCENARIOS.future2050);
}
