import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT = (process.env.R2_ENDPOINT || '').replace(/\/$/, '');
const BUCKET = process.env.R2_BUCKET || '';
const KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const SECRET = process.env.R2_SECRET_ACCESS_KEY || '';
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');

const useR2 = Boolean(ENDPOINT && BUCKET && KEY_ID && SECRET);
const FILE_ROOT = path.join(process.cwd(), '.data');

const sha256hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

async function r2Fetch(
  method: 'GET' | 'PUT',
  key: string,
  body?: Buffer,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const url = new URL(`${ENDPOINT}/${BUCKET}/${key}`);
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash = sha256hex(body ?? Buffer.alloc(0));

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };
  for (const [k, v] of Object.entries(extraHeaders)) headers[k.toLowerCase()] = v;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((h) => `${h}:${headers[h].trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, bodyHash].join('\n');

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  let k = hmac(`AWS4${SECRET}`, dateStamp);
  k = hmac(k, 'auto');
  k = hmac(k, 's3');
  k = hmac(k, 'aws4_request');
  const signature = createHmac('sha256', k).update(stringToSign).digest('hex');

  const { host: _host, ...sendHeaders } = headers;
  return fetch(url, {
    method,
    body,
    cache: 'no-store',
    headers: {
      ...sendHeaders,
      authorization: `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
}

export async function storagePut(key: string, body: Buffer, contentType: string): Promise<void> {
  if (useR2) {
    const res = await r2Fetch('PUT', key, body, { 'content-type': contentType });
    if (!res.ok) throw new Error(`R2 PUT ${key}: HTTP ${res.status} ${await res.text()}`);
    return;
  }
  const file = path.join(FILE_ROOT, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function storageGet(key: string): Promise<Buffer | null> {
  if (useR2) {
    const res = await r2Fetch('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 GET ${key}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await readFile(path.join(FILE_ROOT, key));
  } catch {
    return null;
  }
}

export function storagePublicUrl(key: string): string | null {
  return PUBLIC_BASE ? `${PUBLIC_BASE}/${key}` : null;
}
