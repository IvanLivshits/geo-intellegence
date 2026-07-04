import { fromFile } from 'geotiff';
import { createHash } from 'node:crypto';
import { gridCells } from './geo-math';
import { cacheGet, cacheSet } from './cache';
import { ensureRaster } from './raster-cache';
import { sampleImageAt } from './raster';
import { makeField, type MaskField } from './mask-field';
import { clipToZone } from './polygon';
import { LANDSLIDE_RAMP } from './constants';
import type { MaskContext } from './masks';

const TIF_URL =
  'https://gpm.nasa.gov/sites/default/files/downloads/global-landslide-susceptibility-map-2-27-23.tif';
const CACHE_TTL_MS = 90 * 24 * 3600 * 1000;
const GRID_N = 48;

const NOTE =
  'NASA LHASA: восприимчивость склонов к оползням (уклон, геология, разломы, дороги, вырубка леса), ~1 км. Классы 1–5 показаны как 0–100%. Восприимчивость ≠ прогноз события. Сухо/ровно = прозрачно.';

export async function computeLandslideMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = GRID_N;

  const key =
    'landslide:' +
    createHash('sha1').update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius},${ctx.zoneTag || ''}`).digest('hex');
  const cached = await cacheGet<MaskField>(key);
  if (cached != null) {
    console.log('[оползни] кэш ✓ NASA LHASA');
    return cached;
  }

  const path = await ensureRaster(TIF_URL, 'nasa-landslide-susceptibility.tif');
  const tiff = await fromFile(path);
  const image = await tiff.getImage();

  const cells = gridCells(lat, lon, radius, n);
  const raw = await sampleImageAt(image, cells);
  const values = raw.map((v) => {
    if (v == null || v < 1 || v > 5) return null;
    const pct = ((v - 1) / 4) * 100;
    return pct > 0 ? pct : null;
  });

  const result = makeField(clipToZone(values, n, radius, ctx.zone), n, {
    ramp: LANDSLIDE_RAMP,
    lo: 0,
    hi: 100,
    alphaMin: 20,
    alphaMax: 220,
    unit: '%',
    label: 'Оползни · NASA LHASA',
    note: NOTE,
  });
  await cacheSet(key, result, CACHE_TTL_MS);
  return result;
}
