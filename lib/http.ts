import { createHash } from 'node:crypto';
import { cacheGet, cacheSet } from './cache';

const USER_AGENT =
  'geo-intelligence-engine/0.1 (open-data risk reports; contact: ivanlivshitc@gmail.com)';

const HOST_MIN_INTERVAL: Record<string, number> = {
  'nominatim.openstreetmap.org': 1100,
  'overpass-api.de': 1500,
  'overpass.osm.ch': 1500,
  'maps.mail.ru': 1500,
  'overpass.kumi.systems': 1500,
  'air-quality-api.open-meteo.com': 400,
};
const lastCallByHost = new Map<string, number>();
const hostChain = new Map<string, Promise<void>>();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function respectRate(host: string): Promise<void> {
  const min = HOST_MIN_INTERVAL[host];
  if (!min) return Promise.resolve();
  const prev = hostChain.get(host) ?? Promise.resolve();
  const next = prev.then(async () => {
    const wait = (lastCallByHost.get(host) || 0) + min - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallByHost.set(host, Date.now());
  });
  hostChain.set(host, next);
  return next;
}

function cacheKey(method: string, url: string, body: string | null): string {
  return createHash('sha1').update(`${method} ${url} ${body || ''}`).digest('hex');
}

export interface FetchOptions {
  method?: string;
  body?: string | null;
  headers?: Record<string, string>;
  json?: boolean;
  ttlMs?: number;
  retries?: number;
  timeoutMs?: number;
  cacheKeyUrl?: string;
  validate?: (data: unknown) => boolean;
}

export async function fetchData(url: string, opts: FetchOptions = {}): Promise<any> {
  const {
    method = 'GET',
    body = null,
    headers = {},
    json = true,
    ttlMs = 7 * 24 * 3600 * 1000,
    retries = 2,
    timeoutMs = 30000,
  } = opts;

  const key = cacheKey(method, opts.cacheKeyUrl ?? url, body);
  const host = new URL(url).host;

  const cached = await cacheGet<unknown>(`http:${key}`);
  if (cached != null) {
    if (opts.validate && !opts.validate(cached)) {
      console.warn(`[net] cached response for ${host} is unusable — ignoring it and refetching`);
    } else {
      console.log(`[net] cache ✓ ${host}`);
      return cached;
    }
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await respectRate(host);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const started = Date.now();
      console.log(`[net] ${method} ${host} …${attempt ? ` (attempt ${attempt + 1})` : ''}`);
      const res = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (!res.ok) {
        if ([429, 502, 503, 504].includes(res.status) && attempt < retries) {
          console.warn(`[net] ${res.status} ${host} — retrying in ${1500 * (attempt + 1)} ms`);
          await sleep(1500 * (attempt + 1));
          continue;
        }
        const err = new Error(`HTTP ${res.status} for ${url}`) as Error & { noRetry?: boolean };
        err.noRetry = res.status >= 400 && res.status < 500 && res.status !== 429;
        throw err;
      }
      const data = json ? await res.json() : await res.text();
      if (opts.validate && !opts.validate(data)) {
        const err = new Error(`${host} returned an empty dataset`) as Error & { emptyDataset?: boolean };
        err.emptyDataset = true;
        throw err;
      }
      console.log(`[net] ✓ ${host} · ${Date.now() - started} ms`);
      await cacheSet(`http:${key}`, data, ttlMs);
      return data;
    } catch (err) {
      lastErr = err;
      console.warn(`[net] ✕ ${host} · ${(err as Error).message}`);
      if ((err as Error & { noRetry?: boolean }).noRetry) throw err;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

const EMPTY_QUORUM = 2;

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export async function overpass(query: string, opts: FetchOptions = {}): Promise<any> {
  const request = (url: string) =>
    fetchData(url, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cacheKeyUrl: 'overpass',
      retries: 0,
      validate: (data) => {
        const els = (data as { elements?: unknown[] })?.elements;
        return Array.isArray(els) && els.length > 0;
      },
      ...opts,
    });

  let lastErr: unknown;
  let empties = 0;
  let attempts = 0;
  for (let round = 0; round < 2; round++) {
    if (round > 0) {
      console.warn('[net] no Overpass mirror returned usable data — pausing 2 s and trying a second round');
      await sleep(2000);
    }
    for (const url of OVERPASS_MIRRORS) {
      const host = new URL(url).host;
      attempts++;
      try {
        return await request(url);
      } catch (err) {
        lastErr = err;
        if ((err as Error & { emptyDataset?: boolean }).emptyDataset) {
          empties++;
          console.warn(`[net] Overpass mirror ${host} returned an empty dataset — trying the next one`);
        } else {
          console.warn(`[net] Overpass mirror ${host} unusable (${(err as Error).message}) — trying the next one`);
        }
      }
    }
  }

  if (empties >= EMPTY_QUORUM) {
    console.warn(
      `[net] ${empties} independent Overpass mirrors agree this bbox is empty — treating it as a genuinely empty area`,
    );
    return { elements: [] };
  }

  throw new Error(
    `No Overpass mirror returned usable data (last: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}). Refusing to treat a failed lookup as "no risk".`,
  );
}
