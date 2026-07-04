import { fromFile } from 'geotiff';
import { createHash } from 'node:crypto';
import { metresToDegLat, metresToDegLon } from './geo';
import { cacheGet, cacheSet } from './cache';
import { ensureRaster } from './raster-cache';
import { fieldFromValues, type MaskField } from './mask-field';
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
    createHash('sha1').update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius}`).digest('hex');
  const cached = await cacheGet<MaskField>(key);
  if (cached != null) {
    console.log('[оползни] кэш ✓ NASA LHASA');
    return cached;
  }

  const path = await ensureRaster(TIF_URL, 'nasa-landslide-susceptibility.tif');
  const tiff = await fromFile(path);
  const image = await tiff.getImage();
  const [west, south, east, north] = image.getBoundingBox();
  const resX = (east - west) / image.getWidth();
  const resY = (north - south) / image.getHeight();
  const px = (vLon: number) => Math.floor((vLon - west) / resX);
  const py = (vLat: number) => Math.floor((north - vLat) / resY);

  const cellM = (radius * 2) / n;
  const x0 = Math.max(0, px(lon - metresToDegLon(radius, lat)) - 1);
  const x1 = Math.min(image.getWidth() - 1, px(lon + metresToDegLon(radius, lat)) + 1);
  const y0 = Math.max(0, py(lat + metresToDegLat(radius)) - 1);
  const y1 = Math.min(image.getHeight() - 1, py(lat - metresToDegLat(radius)) + 1);

  const values: (number | null)[] = new Array(n * n).fill(null);
  if (x1 >= x0 && y1 >= y0) {
    const rasters = await image.readRasters({ window: [x0, y0, x1 + 1, y1 + 1] });
    const band = rasters[0];
    if (typeof band !== 'number' && band) {
      const width = x1 + 1 - x0;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const dy = -radius + cellM * (r + 0.5);
          const dx = -radius + cellM * (c + 0.5);
          const ix = px(lon + metresToDegLon(dx, lat)) - x0;
          const iy = py(lat - metresToDegLat(dy)) - y0;
          if (ix < 0 || iy < 0 || ix >= width) continue;
          const v = (band as ArrayLike<number>)[iy * width + ix];
          if (!Number.isFinite(v) || v < 1 || v > 5) continue;
          const pct = ((v - 1) / 4) * 100;
          values[r * n + c] = pct > 0 ? pct : null;
        }
      }
    }
  }

  const stats = fieldFromValues(values, n, LANDSLIDE_RAMP, 0, 100, 20, 220);
  const result: MaskField = {
    n,
    rgba: stats.rgba,
    avg: stats.avg,
    min: stats.min,
    max: stats.max,
    unit: '%',
    label: 'Оползни · NASA LHASA',
    note: NOTE,
  };
  await cacheSet(key, result, CACHE_TTL_MS);
  return result;
}
