import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';

const DIR = join(tmpdir(), 'geo-rasters');
const inflight = new Map<string, Promise<string>>();

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

  if (unzipTif) {
    const entries = unzipSync(new Uint8Array(buf));
    const tifName = Object.keys(entries).find((k) => k.toLowerCase().endsWith('.tif'));
    if (!tifName) throw new Error(`raster ${name}: no .tif inside the archive`);
    await writeFile(path, Buffer.from(entries[tifName]));
  } else {
    await writeFile(path, buf);
  }
  console.log(`[raster] ready ${name}`);
  return path;
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
