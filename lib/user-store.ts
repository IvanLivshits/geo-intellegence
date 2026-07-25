import 'server-only';
import { query } from './db';
import type { Brand, ShareInput, ShareMeta } from './types';

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

interface BrandRow {
  brand_name: string | null;
  brand_logo: string | null;
  brand_phone: string | null;
  brand_email: string | null;
  brand_website: string | null;
}

export async function getBrand(userId: string): Promise<Brand | null> {
  const rows = await query<BrandRow>(
    `SELECT brand_name, brand_logo, brand_phone, brand_email, brand_website
     FROM users WHERE id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r || !r.brand_name) return null;
  return {
    name: r.brand_name,
    logo: r.brand_logo,
    phone: r.brand_phone,
    email: r.brand_email,
    website: r.brand_website,
  };
}

export async function ownerOfShare(shareId: string): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM locations WHERE share_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [shareId],
  );
  return rows[0]?.user_id ?? null;
}

export async function resolveShareBrand(meta: ShareMeta): Promise<Brand | null> {
  const ownerId = meta.userId ?? (await ownerOfShare(meta.id).catch(() => null));
  const live = ownerId ? await getBrand(ownerId).catch(() => null) : null;
  return live ?? meta.brand ?? null;
}

export async function setBrand(userId: string, brand: Brand): Promise<void> {
  await query(
    `UPDATE users
       SET brand_name = $2,
           brand_logo = $3,
           brand_phone = $4,
           brand_email = $5,
           brand_website = $6
     WHERE id = $1`,
    [userId, brand.name, brand.logo, brand.phone, brand.email, brand.website],
  );
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
