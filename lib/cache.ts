import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = 'geo:';

let client: Redis | null = null;
let unavailable = false;

function getClient(): Redis | null {
  if (unavailable) return null;
  if (!client) {
    client = new Redis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 2 ? null : 300),
    });
    client.on('error', (err) => {
      if (!unavailable) {
        unavailable = true;
        console.warn(`[кэш] Redis недоступен (${err.message}) — работаю без кэша`);
      }
    });
    client.on('ready', () => {
      unavailable = false;
    });
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(PREFIX + key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(PREFIX + key, JSON.stringify(value), 'PX', Math.max(1000, Math.round(ttlMs)));
  } catch {
    return;
  }
}
