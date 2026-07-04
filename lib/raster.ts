import type { GeoTIFFImage } from 'geotiff';

export async function sampleImageAt(
  image: GeoTIFFImage,
  points: { lat: number; lon: number }[],
): Promise<(number | null)[]> {
  const [west, south, east, north] = image.getBoundingBox();
  const resX = (east - west) / image.getWidth();
  const resY = (north - south) / image.getHeight();
  const px = (lon: number) => Math.floor((lon - west) / resX);
  const py = (lat: number) => Math.floor((north - lat) / resY);

  let x0 = image.getWidth();
  let x1 = 0;
  let y0 = image.getHeight();
  let y1 = 0;
  for (const p of points) {
    const ix = px(p.lon);
    const iy = py(p.lat);
    if (ix < x0) x0 = ix;
    if (ix > x1) x1 = ix;
    if (iy < y0) y0 = iy;
    if (iy > y1) y1 = iy;
  }
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(image.getWidth() - 1, x1 + 1);
  y1 = Math.min(image.getHeight() - 1, y1 + 1);
  if (x1 < x0 || y1 < y0) return points.map(() => null);

  const rasters = await image.readRasters({ window: [x0, y0, x1 + 1, y1 + 1] });
  const band = rasters[0];
  if (typeof band === 'number' || !band) return points.map(() => null);
  const width = x1 + 1 - x0;
  const height = y1 + 1 - y0;

  return points.map((p) => {
    const ix = px(p.lon) - x0;
    const iy = py(p.lat) - y0;
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return null;
    const v = (band as ArrayLike<number>)[iy * width + ix];
    return Number.isFinite(v) ? v : null;
  });
}
