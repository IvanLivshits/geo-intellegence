import { fromFile } from 'geotiff';
import { createHash } from 'node:crypto';
import { cacheGet, cacheSet } from './cache';
import { ensureRaster } from './raster-cache';
import { sampleImageAt } from './raster';
import { makeField, type MaskField } from './mask-field';
import { SEISMIC_RAMP } from './constants';
import type { MaskContext } from './masks';

const ZIP_URL =
  'https://zenodo.org/api/records/8409647/files/GEM-GSHM_PGA-475y-rock_v2023.zip/content';
const CACHE_TTL_MS = 90 * 24 * 3600 * 1000;
const PGA_MAX_PCT_G = 60;

const NOTE =
  'GEM Global Seismic Hazard Map v2023: пиковое ускорение грунта (PGA) с вероятностью превышения 10% за 50 лет (период ~475 лет), скальное основание. На масштабе района значение ~однородно. Лицензия CC BY-NC-SA (некоммерческое использование).';

export async function computeSeismicMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon } = ctx;
  const n = 2;

  const key =
    'seismic:' + createHash('sha1').update(`${lat.toFixed(3)},${lon.toFixed(3)}`).digest('hex');
  const cached = await cacheGet<MaskField>(key);
  if (cached != null) {
    console.log('[сейсмика] кэш ✓ GEM GSHM');
    return cached;
  }

  const path = await ensureRaster(ZIP_URL, 'gem-gshm-pga475.tif', true);
  const tiff = await fromFile(path);
  const image = await tiff.getImage();
  const [raw] = await sampleImageAt(image, [{ lat, lon }]);
  const pga = raw != null && raw >= 0 ? raw : null;

  const pctG = pga != null ? Math.min(pga * 100, PGA_MAX_PCT_G) : null;
  const result = makeField(new Array(n * n).fill(pctG), n, {
    ramp: SEISMIC_RAMP,
    lo: 0,
    hi: PGA_MAX_PCT_G,
    alphaMin: 40,
    alphaMax: 190,
    unit: '%g',
    label: 'Сейсмика · GEM PGA-475',
    note: pga != null ? NOTE : `Данные GEM для этой точки недоступны. ${NOTE}`,
  });
  await cacheSet(key, result, CACHE_TTL_MS);
  return result;
}
