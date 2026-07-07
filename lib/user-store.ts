import 'server-only';
import { query } from './db';
import type { ShareInput } from './types';

export interface DbUser {
  id: string;
  google_sub: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export interface DbLocation {
  id: string;
  share_id: string;
  name: string | null;
  label: string | null;
  center: [number, number] | null;
  radius: number | null;
  stats: { noise: number | null; q100: number | null; pluvial: number | null } | null;
  status: 'processing' | 'ready' | 'error';
  error: string | null;
  input: ShareInput | null;
  created_at: string;
}

export async function upsertUser(u: {
  googleSub: string;
  email: string | null;
  name: string | null;
  image: string | null;
}): Promise<DbUser> {
  const rows = await query<DbUser>(
    `INSERT INTO users (google_sub, email, name, image)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           image = EXCLUDED.image,
           last_login_at = now()
     RETURNING id, google_sub, email, name, image`,
    [u.googleSub, u.email, u.name, u.image],
  );
  return rows[0];
}

export async function saveLocation(
  userId: string,
  loc: {
    shareId: string;
    label: string | null;
    center: [number, number];
    radius: number;
    stats: DbLocation['stats'];
    input: ShareInput;
  },
): Promise<void> {
  await query(
    `INSERT INTO locations (user_id, share_id, label, center, radius, stats, input, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready')
     ON CONFLICT (user_id, share_id) DO UPDATE
       SET label = EXCLUDED.label,
           center = EXCLUDED.center,
           radius = EXCLUDED.radius,
           stats = EXCLUDED.stats,
           input = EXCLUDED.input,
           status = 'ready',
           error = NULL`,
    [
      userId,
      loc.shareId,
      loc.label,
      JSON.stringify(loc.center),
      loc.radius,
      JSON.stringify(loc.stats),
      JSON.stringify(loc.input),
    ],
  );
}

export async function createProcessingLocation(
  userId: string,
  loc: {
    shareId: string;
    label: string | null;
    center: [number, number] | null;
    radius: number | null;
    input: ShareInput;
  },
): Promise<void> {
  await query(
    `INSERT INTO locations (user_id, share_id, label, center, radius, input, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'processing')
     ON CONFLICT (user_id, share_id) DO UPDATE
       SET label = EXCLUDED.label, input = EXCLUDED.input, status = 'processing', error = NULL`,
    [userId, loc.shareId, loc.label, loc.center ? JSON.stringify(loc.center) : null, loc.radius, JSON.stringify(loc.input)],
  );
}

export async function markLocationReady(
  userId: string,
  shareId: string,
  d: { label: string | null; center: [number, number]; radius: number; stats: DbLocation['stats'] },
): Promise<void> {
  await query(
    `UPDATE locations
       SET status = 'ready', error = NULL, label = $3, center = $4, radius = $5, stats = $6
     WHERE user_id = $1 AND share_id = $2`,
    [userId, shareId, d.label, JSON.stringify(d.center), d.radius, JSON.stringify(d.stats)],
  );
}

export async function getLocationStatus(
  userId: string,
  shareId: string,
): Promise<DbLocation['status'] | null> {
  const rows = await query<{ status: DbLocation['status'] }>(
    `SELECT status FROM locations WHERE user_id = $1 AND share_id = $2`,
    [userId, shareId],
  );
  return rows[0]?.status ?? null;
}

export async function markLocationError(userId: string, shareId: string, message: string): Promise<void> {
  await query(`UPDATE locations SET status = 'error', error = $3 WHERE user_id = $1 AND share_id = $2`, [
    userId,
    shareId,
    message.slice(0, 300),
  ]);
}

export async function listLocations(userId: string): Promise<DbLocation[]> {
  return query<DbLocation>(
    `SELECT id, share_id, name, label, center, radius, stats, status, error, input, created_at
     FROM locations
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
}

export async function renameLocation(userId: string, id: string, name: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE locations SET name = $3 WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id, name],
  );
  return rows.length > 0;
}

export async function deleteLocation(userId: string, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM locations WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id],
  );
  return rows.length > 0;
}
