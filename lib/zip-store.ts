import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  offset: number;
  compressedSize: number;
  size: number;
  method: number;
}

const EOCD_SIG = 0x06054b50;
const EOCD64_SIG = 0x06064b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
const MAX_COMMENT = 66560;
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

function readZip64Extra(extra: Buffer, entry: ZipEntry, needSize: boolean, needComp: boolean, needOffset: boolean): void {
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p);
    const len = extra.readUInt16LE(p + 2);
    let q = p + 4;
    if (id === 0x0001) {
      if (needSize && q + 8 <= extra.length) {
        entry.size = Number(extra.readBigUInt64LE(q));
        q += 8;
      }
      if (needComp && q + 8 <= extra.length) {
        entry.compressedSize = Number(extra.readBigUInt64LE(q));
        q += 8;
      }
      if (needOffset && q + 8 <= extra.length) {
        entry.offset = Number(extra.readBigUInt64LE(q));
      }
      return;
    }
    p += 4 + len;
  }
}

export async function readCentralDirectory(path: string): Promise<Map<string, ZipEntry>> {
  const fh = await open(path, 'r');
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, MAX_COMMENT);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('not a zip archive: end-of-central-directory not found');

    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    const count = tail.readUInt16LE(eocd + 10);

    if (cdOffset === U32_MAX || cdSize === U32_MAX || count === U16_MAX) {
      let locator = -1;
      for (let i = eocd - 20; i >= 0; i--) {
        if (tail.readUInt32LE(i) === EOCD64_LOCATOR_SIG) {
          locator = i;
          break;
        }
      }
      if (locator < 0) throw new Error('zip64 archive without an end-of-central-directory locator');
      const eocd64Offset = Number(tail.readBigUInt64LE(locator + 8));
      const head = Buffer.alloc(56);
      await fh.read(head, 0, 56, eocd64Offset);
      if (head.readUInt32LE(0) !== EOCD64_SIG) throw new Error('zip64 end-of-central-directory is corrupt');
      cdSize = Number(head.readBigUInt64LE(40));
      cdOffset = Number(head.readBigUInt64LE(48));
    }

    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);

    const entries = new Map<string, ZipEntry>();
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === CENTRAL_SIG) {
      const method = cd.readUInt16LE(p + 10);
      const compressedSize = cd.readUInt32LE(p + 20);
      const size = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const offset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);

      const entry: ZipEntry = { name, offset, compressedSize, size, method };
      if (compressedSize === U32_MAX || size === U32_MAX || offset === U32_MAX) {
        const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
        readZip64Extra(extra, entry, size === U32_MAX, compressedSize === U32_MAX, offset === U32_MAX);
      }
      entries.set(name, entry);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    await fh.close();
  }
}

export async function extractEntry(path: string, entry: ZipEntry): Promise<Buffer> {
  const fh = await open(path, 'r');
  try {
    const head = Buffer.alloc(30);
    await fh.read(head, 0, 30, entry.offset);
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip entry ${entry.name}: local header is corrupt`);
    const nameLen = head.readUInt16LE(26);
    const extraLen = head.readUInt16LE(28);
    const start = entry.offset + 30 + nameLen + extraLen;

    const raw = Buffer.alloc(entry.compressedSize);
    await fh.read(raw, 0, entry.compressedSize, start);

    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateRawSync(raw);
    throw new Error(`zip entry ${entry.name}: unsupported compression method ${entry.method}`);
  } finally {
    await fh.close();
  }
}
