import { mkdir, writeFile, access, rename, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';

const DIR = process.env.RASTER_DIR || join(tmpdir(), 'geo-rasters');
const inflight = new Map<string, Promise<string>>();

export function rasterDir(): string {
  return DIR;
}

async function downloadStream(url: string, name: string): Promise<string> {
  const path = join(DIR, name);
  try {
    await access(path);
    return path;
  } catch {
    void 0;
  }

  await mkdir(DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`raster ${name}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  console.log(
    `[raster] downloading ${name}${total ? ` · ${(total / 1e9).toFixed(2)} GB` : ''} — this happens once, then it is cached on disk`,
  );

  const tmp = `${path}.part-${process.pid}`;
  try {
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tmp));
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
  console.log(`[raster] ready ${name}`);
  return path;
}

export function ensureLargeFile(url: string, name: string): Promise<string> {
  let p = inflight.get(name);
  if (!p) {
    p = downloadStream(url, name).catch((err) => {
      inflight.delete(name);
      throw err;
    });
    inflight.set(name, p);
  }
  return p;
}

async function download(url: string, name: string, unzipTif: boolean): Promise<string> {
  const path = join(DIR, name);
  try {
    await access(path);
    return path;
  } catch {
    void 0;
  }

  await mkdir(DIR, { recursive: true });
  console.log(`[raster] downloading ${name} · ${url.slice(0, 80)}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`raster ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const tmp = `${path}.part-${process.pid}`;
  try {
    if (unzipTif) {
      const entries = unzipSync(new Uint8Array(buf));
      const tifName = Object.keys(entries).find((k) => k.toLowerCase().endsWith('.tif'));
      if (!tifName) throw new Error(`raster ${name}: no .tif inside the archive`);
      await writeFile(tmp, Buffer.from(entries[tifName]));
    } else {
      await writeFile(tmp, buf);
    }
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
  console.log(`[raster] ready ${name}`);
  return path;
}

export function ensureFile(url: string, name: string): Promise<string> {
  return ensureRaster(url, name, false);
}

export function ensureRaster(url: string, name: string, unzipTif = false): Promise<string> {
  let p = inflight.get(name);
  if (!p) {
    p = download(url, name, unzipTif).catch((err) => {
      inflight.delete(name);
      throw err;
    });
    inflight.set(name, p);
  }
  return p;
}
