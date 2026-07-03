import { fromUrl } from 'geotiff';
import { createHash } from 'node:crypto';
import { cacheGet, cacheSet } from './cache';

export interface DemPoint {
  lat: number;
  lon: number;
}

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

function tileName(lat: number, lon: number): string {
  const latBase = Math.floor(lat);
  const lonBase = Math.floor(lon);
  const latPart = latBase >= 0 ? `N${String(latBase).padStart(2, '0')}` : `S${String(-latBase).padStart(2, '0')}`;
  const lonPart = lonBase >= 0 ? `E${String(lonBase).padStart(3, '0')}` : `W${String(-lonBase).padStart(3, '0')}`;
  return `Copernicus_DSM_COG_10_${latPart}_00_${lonPart}_00_DEM`;
}

interface TileWindow {
  west: number;
  north: number;
  resX: number;
  resY: number;
  x0: number;
  y0: number;
  width: number;
  data: Float32Array;
}

async function loadTileWindow(name: string, points: DemPoint[]): Promise<TileWindow | null> {
  const url = `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`;
  try {
    const tiff = await fromUrl(url);
    const image = await tiff.getImage();
    const [west, , , north] = image.getBoundingBox();
    const resX = image.getResolution()[0];
    const resY = Math.abs(image.getResolution()[1]);
    const w = image.getWidth();
    const h = image.getHeight();

    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    for (const p of points) {
      const px = Math.floor((p.lon - west) / resX);
      const py = Math.floor((north - p.lat) / resY);
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(w - 1, x1 + 1);
    y1 = Math.min(h - 1, y1 + 1);

    const rasters = await image.readRasters({ window: [x0, y0, x1 + 1, y1 + 1] });
    const band = rasters[0];
    if (typeof band === 'number' || !band) return null;
    return {
      west,
      north,
      resX,
      resY,
      x0,
      y0,
      width: x1 + 1 - x0,
      data: band instanceof Float32Array ? band : Float32Array.from(band as ArrayLike<number>),
    };
  } catch (err) {
    console.warn(`[рельеф] тайл ${name} недоступен: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function sampleFrom(win: TileWindow, p: DemPoint): number | null {
  const px = Math.floor((p.lon - win.west) / win.resX) - win.x0;
  const py = Math.floor((win.north - p.lat) / win.resY) - win.y0;
  if (px < 0 || py < 0 || px >= win.width) return null;
  const v = win.data[py * win.width + px];
  return Number.isFinite(v) ? v : null;
}

export async function sampleElevations(points: DemPoint[]): Promise<(number | null)[]> {
  const key =
    'dem:' +
    createHash('sha1')
      .update(points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';'))
      .digest('hex');
  const cached = await cacheGet<(number | null)[]>(key);
  if (cached != null) {
    console.log('[рельеф] кэш ✓ Copernicus DEM');
    return cached;
  }

  const byTile = new Map<string, number[]>();
  points.forEach((p, i) => {
    const name = tileName(p.lat, p.lon);
    const list = byTile.get(name);
    if (list) list.push(i);
    else byTile.set(name, [i]);
  });

  console.log(`[рельеф] Copernicus GLO-30 · точек: ${points.length} · тайлов: ${byTile.size}`);
  const out: (number | null)[] = new Array(points.length).fill(null);

  await Promise.all(
    Array.from(byTile.entries()).map(async ([name, idxs]) => {
      const win = await loadTileWindow(name, idxs.map((i) => points[i]));
      if (!win) return;
      for (const i of idxs) out[i] = sampleFrom(win, points[i]);
    }),
  );

  const got = out.filter((v) => v != null).length;
  console.log(`[рельеф] высоты получены: ${got}/${points.length}`);
  if (got > 0) await cacheSet(key, out, CACHE_TTL_MS);
  return out;
}
