import { execFile } from 'node:child_process';
import { access, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { addDecoder, BaseDecoder, fromFile } from 'geotiff';
import { decompress } from 'fzstd';
import { ensureFile, ensureLargeFile, rasterDir } from './raster-cache';
import { extractEntry, readCentralDirectory } from './zip-store';
import type { DemPoint } from './dem';

const BASE = 'https://data.4tu.nl/file/1da2e70f-6c4d-4b03-86bd-b53e789cc629/';
const GPKG_ID = '13372797-659e-43c0-bd19-9a75b591d6d0';

const ZIP_IDS: Record<string, string> = {
  'Africa.zip': '9c0b91b9-40c5-48eb-90df-c4f8431de0ed',
  'Antarctica.zip': '5e938590-c0f8-452b-8d60-7607c6f6f3a9',
  'Asia.zip': 'd2236cbd-908c-40de-af4d-75bb23faaabd',
  'Europe.zip': 'ae67d734-d929-4860-b6c4-48074d2591a0',
  'North_America.zip': 'afe67a34-9a23-44ea-8549-004dce426697',
  'Oceania.zip': '059ec578-2703-4ff6-837e-aeade844f1d1',
  'South_America.zip': '3c036df4-be04-4ee6-945b-74c63e2a1a3a',
  'Seven_seas_(open_ocean).zip': 'fbbde231-cb21-4714-a12a-cf0d6a43c65c',
};

const NODATA = -9999;
const TERRAIN_WAIT_MS = parseInt(process.env.TERRAIN_WAIT_MS ?? '', 10) || 25000;
const execFileAsync = promisify(execFile);

export class TerrainNotReady extends Error {
  constructor(readonly archive: string) {
    super(
      `the DeltaDTM coastal terrain for ${archive} is still downloading (one-time, multi-GB); it will be on disk shortly`,
    );
    this.name = 'TerrainNotReady';
  }
}

class ZstdDecoder extends BaseDecoder {
  decodeBlock(buffer: ArrayBuffer): ArrayBuffer {
    const out = decompress(new Uint8Array(buffer));
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
}

let decoderReady = false;
function registerZstd(): void {
  if (decoderReady) return;
  addDecoder([50000], () => Promise.resolve(ZstdDecoder));
  decoderReady = true;
}

export function tileName(lat: number, lon: number): string {
  const la = Math.floor(lat);
  const lo = Math.floor(lon);
  const ns = la >= 0 ? `N${String(la).padStart(2, '0')}` : `S${String(-la).padStart(2, '0')}`;
  const ew = lo >= 0 ? `E${String(lo).padStart(3, '0')}` : `W${String(-lo).padStart(3, '0')}`;
  return `${ns}${ew}`;
}

let indexCache: Map<string, string> | null = null;
let indexLoading: Promise<Map<string, string>> | null = null;

async function loadIndex(): Promise<Map<string, string>> {
  if (indexCache) return indexCache;
  if (indexLoading) return indexLoading;

  indexLoading = (async () => {
    const gpkg = await ensureFile(BASE + GPKG_ID, 'deltadtm-tiles.gpkg');
    const binary = join(process.cwd(), 'bin', 'duckdb');
    const { stdout } = await execFileAsync(
      binary,
      ['-json', '-c', `LOAD spatial; SELECT tile, zipfile FROM st_read('${gpkg}');`],
      { timeout: 60000, maxBuffer: 64 * 1024 * 1024 },
    );
    const rows = JSON.parse(stdout) as { tile: string; zipfile: string }[];
    const map = new Map<string, string>();
    for (const r of rows) {
      const m = /_([NS]\d{2}[EW]\d{3})\.tif$/i.exec(r.tile);
      if (m) map.set(m[1].toUpperCase(), r.zipfile);
    }
    if (!map.size) throw new Error('the DeltaDTM tile index is empty');
    console.log(`[deltadtm] tile index loaded · ${map.size} coastal tiles`);
    indexCache = map;
    return map;
  })().catch((err) => {
    indexLoading = null;
    throw err;
  });

  return indexLoading;
}

const tileInflight = new Map<string, Promise<string | null>>();

async function fetchTile(tile: string): Promise<string | null> {
  const dir = join(rasterDir(), 'deltadtm');
  const path = join(dir, `${tile}.tif`);
  try {
    await access(path);
    return path;
  } catch {
    void 0;
  }

  const index = await loadIndex();
  const zipfile = index.get(tile);
  if (!zipfile) return null;

  const id = ZIP_IDS[zipfile];
  if (!id) throw new Error(`DeltaDTM: no download for ${zipfile}`);

  const download = ensureLargeFile(BASE + id, `deltadtm-${zipfile}`);
  const zipPath = await Promise.race([
    download,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TERRAIN_WAIT_MS)),
  ]);
  if (zipPath == null) {
    void download.catch(() => undefined);
    throw new TerrainNotReady(zipfile);
  }

  const entries = await readCentralDirectory(zipPath);
  const key = [...entries.keys()].find((k) => k.toUpperCase().endsWith(`_${tile}.TIF`));
  if (!key) throw new Error(`DeltaDTM: tile ${tile} is indexed in ${zipfile} but missing from the archive`);

  const buf = await extractEntry(zipPath, entries.get(key) as never);
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.part-${process.pid}`;
  try {
    await writeFile(tmp, buf);
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
  console.log(`[deltadtm] tile ${tile} extracted from ${zipfile}`);
  return path;
}

function ensureTile(tile: string): Promise<string | null> {
  let p = tileInflight.get(tile);
  if (!p) {
    p = fetchTile(tile).catch((err) => {
      tileInflight.delete(tile);
      throw err;
    });
    tileInflight.set(tile, p);
  }
  return p;
}

export async function prewarmTerrain(archives?: string[]): Promise<void> {
  const list = archives?.length ? archives : Object.keys(ZIP_IDS);
  for (const zipfile of list) {
    const id = ZIP_IDS[zipfile];
    if (!id) {
      console.warn(`[prewarm] unknown archive ${zipfile} — known: ${Object.keys(ZIP_IDS).join(', ')}`);
      continue;
    }
    await ensureLargeFile(BASE + id, `deltadtm-${zipfile}`);
  }
  await loadIndex();
  console.log('[prewarm] coastal terrain ready');
}

export async function sampleDeltaDtm(points: DemPoint[]): Promise<(number | null)[]> {
  registerZstd();
  const out: (number | null)[] = new Array(points.length).fill(null);

  const byTile = new Map<string, number[]>();
  points.forEach((p, i) => {
    const t = tileName(p.lat, p.lon);
    const list = byTile.get(t);
    if (list) list.push(i);
    else byTile.set(t, [i]);
  });

  await Promise.all(
    Array.from(byTile.entries()).map(async ([tile, idxs]) => {
      const path = await ensureTile(tile);
      if (!path) return;

      const tiff = await fromFile(path);
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
      for (const i of idxs) {
        const px = Math.floor((points[i].lon - west) / resX);
        const py = Math.floor((north - points[i].lat) / resY);
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
      x0 = Math.max(0, x0 - 1);
      y0 = Math.max(0, y0 - 1);
      x1 = Math.min(w - 1, x1 + 1);
      y1 = Math.min(h - 1, y1 + 1);
      if (x1 < x0 || y1 < y0) return;

      const rasters = await image.readRasters({ window: [x0, y0, x1 + 1, y1 + 1] });
      const band = rasters[0];
      if (typeof band === 'number' || !band) return;
      const width = x1 + 1 - x0;
      const data = band as ArrayLike<number>;

      for (const i of idxs) {
        const px = Math.floor((points[i].lon - west) / resX) - x0;
        const py = Math.floor((north - points[i].lat) / resY) - y0;
        if (px < 0 || py < 0 || px >= width) continue;
        const v = data[py * width + px];
        out[i] = Number.isFinite(v) && v !== NODATA ? v : null;
      }
    }),
  );

  return out;
}
