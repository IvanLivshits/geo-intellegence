import { fromFile } from 'geotiff';
import { createHash } from 'node:crypto';
import { gridCells } from './geo-math';
import { cacheGet, cacheSet } from './cache';
import { ensureRaster } from './raster-cache';
import { sampleImageAt } from './raster';
import { makeField, type MaskField } from './mask-field';
import { clipToZone } from './polygon';
import { Q100_RAMP } from './constants';
import type { MaskContext } from './masks';

const RP100_URL =
  'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/FLOODS/GlobalMaps/floodMapGL_rp100y.zip';
const RP100_FILE = 'jrc-floodmap-rp100y.tif';

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const GRID_N = 48;
const DEPTH_MAX_CM = 300;

const NOTE =
  'JRC Global River Flood Hazard Map (Copernicus Emergency Management Service): depth of the 1-in-100-year river flood, modelled with LISFLOOD / LISFLOOD-FP at ~1 km. Riverine flooding only — coastal storm surge is NOT included, so a low value here does not rule out coastal inundation. Local engineered defences are not modelled.';

let imagePromise: Promise<import('geotiff').GeoTIFFImage> | null = null;

function floodImage(): Promise<import('geotiff').GeoTIFFImage> {
  if (!imagePromise) {
    imagePromise = (async () => {
      const path = await ensureRaster(RP100_URL, RP100_FILE, true);
      const tiff = await fromFile(path);
      return tiff.getImage();
    })().catch((err) => {
      imagePromise = null;
      throw err;
    });
  }
  return imagePromise;
}

export async function computeOfficialFloodMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = GRID_N;

  const key =
    'q100jrc:' +
    createHash('sha1')
      .update(`${lat.toFixed(5)},${lon.toFixed(5)},${radius},${ctx.zoneTag || ''}`)
      .digest('hex');
  const cached = await cacheGet<MaskField>(key);
  if (cached != null) return cached;

  const cells = gridCells(lat, lon, radius, n);

  let values: (number | null)[];
  let failed = false;
  let uncovered = 0;
  try {
    const image = await floodImage();
    const depths = await sampleImageAt(image, cells);
    values = depths.map((d) => {
      if (d == null || !Number.isFinite(d)) {
        uncovered++;
        return null;
      }
      if (d <= 0) return 0;
      return Math.min(d * 100, DEPTH_MAX_CM);
    });
  } catch (err) {
    failed = true;
    values = cells.map(() => null);
    console.warn(`[q100] JRC flood map unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const noCoverage = !failed && uncovered === cells.length;
  const centerIdx = Math.floor(n / 2) * n + Math.floor(n / 2);
  const site = values[centerIdx];
  const assetUncovered = !failed && !noCoverage && site == null;

  const field = makeField(clipToZone(values, n, radius, ctx.zone), n, {
    ramp: Q100_RAMP,
    lo: 0,
    hi: DEPTH_MAX_CM,
    alphaMin: 0,
    alphaMax: 220,
    unit: 'cm',
    label: 'River flood Q100 · JRC',
    site,
    note: failed
      ? `NOT ASSESSED: the JRC flood map could not be retrieved, so this location was never checked against the 100-year flood zone. ${NOTE}`
      : noCoverage
        ? `NOT ASSESSED: this location lies outside the modelled domain of the JRC flood map, so it was never checked. ${NOTE}`
        : assetUncovered
          ? `NOT ASSESSED: the asset itself lies outside the modelled JRC domain (only part of the scan area is covered), so its river-flood exposure was not established. ${NOTE}`
          : NOTE,
  });

  if (failed || noCoverage || assetUncovered) {
    field.degraded = true;
    return field;
  }

  await cacheSet(key, field, CACHE_TTL_MS);
  return field;
}
