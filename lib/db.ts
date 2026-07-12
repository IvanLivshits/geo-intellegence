import 'server-only';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';
const needsSsl = /\bsslmode=require\b/.test(DATABASE_URL) || process.env.DATABASE_SSL === '1';

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPool(): Pool | null {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err) => {
      console.warn(`[db] Postgres pool error: ${err.message}`);
    });
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub    text UNIQUE NOT NULL,
  email         text,
  name          text,
  image         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS locations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_id   text NOT NULL,
  name       text,
  label      text,
  center     jsonb,
  radius     integer,
  stats      jsonb,
  status     text NOT NULL DEFAULT 'ready',
  error      text,
  input      jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, share_id)
);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS input jsonb;
CREATE INDEX IF NOT EXISTS locations_user_created_idx ON locations (user_id, created_at DESC);
`;

export function ensureSchema(): Promise<void> {
  const p = getPool();
  if (!p) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = p
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not set — Postgres is unavailable');
  await ensureSchema();
  const res = await p.query(text, params);
  return res.rows as T[];
}
