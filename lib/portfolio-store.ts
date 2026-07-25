import 'server-only';
import { query, withTransaction } from './db';
import type { Band, MaskKey } from './constants';
import type { PortfolioRow } from './portfolio';
import {
  ItemStatus,
  PortfolioStatus,
  STUCK_AFTER_MINUTES,
  type DbPortfolio,
  type DbPortfolioItem,
  type PendingItem,
} from './portfolio-types';

export * from './portfolio-types';

export class PortfolioLimitError extends Error {
  constructor(public readonly active: number) {
    super('active portfolio limit reached');
    this.name = 'PortfolioLimitError';
  }
}

export async function createPortfolio(
  userId: string,
  name: string,
  radius: number,
  rows: PortfolioRow[],
  maxActive: number,
): Promise<string> {
  return withTransaction(async (q) => {
    await q(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [userId]);
    const active = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM portfolios WHERE user_id = $1 AND status = $2`,
      [userId, PortfolioStatus.Processing],
    );
    const activeCount = parseInt(active[0]?.n ?? '0', 10);
    if (activeCount >= maxActive) {
      throw new PortfolioLimitError(activeCount);
    }

    const created = await q<{ id: string }>(
      `INSERT INTO portfolios (user_id, name, radius, total, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, name, radius, rows.length, PortfolioStatus.Processing],
    );
    const id = created[0].id;

    const CHUNK = 200;
    for (let start = 0; start < rows.length; start += CHUNK) {
      const slice = rows.slice(start, start + CHUNK);
      const parts: string[] = [];
      const flat: unknown[] = [];
      slice.forEach((r, i) => {
        const o = i * 6;
        parts.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`);
        flat.push(id, start + i, r.ref, r.address, r.lat, r.lon);
      });
      await q(
        `INSERT INTO portfolio_items (portfolio_id, position, ref, address, lat, lon)
         VALUES ${parts.join(', ')}`,
        flat,
      );
    }

    return id;
  });
}

export async function countActivePortfolios(userId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM portfolios WHERE user_id = $1 AND status = $2`,
    [userId, PortfolioStatus.Processing],
  );
  return parseInt(rows[0]?.n ?? '0', 10);
}

export async function listPortfolios(userId: string): Promise<DbPortfolio[]> {
  return query<DbPortfolio>(
    `SELECT id, name, radius, total, status, created_at, finished_at
     FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
}

export async function getPortfolio(userId: string, id: string): Promise<DbPortfolio | null> {
  const rows = await query<DbPortfolio>(
    `SELECT id, name, radius, total, status, created_at, finished_at
     FROM portfolios WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ?? null;
}

export async function listItems(portfolioId: string): Promise<DbPortfolioItem[]> {
  return query<DbPortfolioItem>(
    `SELECT id, position, ref, address, lat, lon, status, error, share_id,
            overall_band, assessed, bands, vals, headline
     FROM portfolio_items WHERE portfolio_id = $1 ORDER BY position`,
    [portfolioId],
  );
}

export async function deletePortfolio(userId: string, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM portfolios WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id],
  );
  return rows.length > 0;
}

export async function claimNextItem(): Promise<PendingItem | null> {
  const rows = await query<PendingItem>(
    `UPDATE portfolio_items SET status = $1, updated_at = now()
     WHERE id = (
       SELECT i.id FROM portfolio_items i
       JOIN portfolios p ON p.id = i.portfolio_id
       WHERE i.status = $2
       ORDER BY p.created_at, i.position
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, portfolio_id, position, ref, address, lat, lon, status, error, share_id,
               overall_band, assessed, bands, vals, headline,
               (SELECT radius FROM portfolios WHERE id = portfolio_id) AS radius`,
    [ItemStatus.Processing, ItemStatus.Pending],
  );
  return rows[0] ?? null;
}

export async function markItemReady(
  id: string,
  data: {
    lat: number;
    lon: number;
    shareId: string | null;
    overallBand: Band;
    assessed: string;
    bands: Partial<Record<MaskKey, Band>>;
    vals: Partial<Record<MaskKey, number | null>>;
    headline: string;
  },
): Promise<void> {
  await query(
    `UPDATE portfolio_items
     SET status = $10, error = NULL, lat = $2, lon = $3, share_id = $4,
         overall_band = $5, assessed = $6, bands = $7, vals = $8, headline = $9, updated_at = now()
     WHERE id = $1`,
    [
      id,
      data.lat,
      data.lon,
      data.shareId,
      data.overallBand,
      data.assessed,
      JSON.stringify(data.bands),
      JSON.stringify(data.vals),
      data.headline,
      ItemStatus.Ready,
    ],
  );
}

export async function touchItem(id: string): Promise<void> {
  await query(`UPDATE portfolio_items SET updated_at = now() WHERE id = $1 AND status = $2`, [
    id,
    ItemStatus.Processing,
  ]);
}

const CLEAR_RESULTS = `error = null, share_id = null, overall_band = null, assessed = null, bands = null, vals = null, headline = null`;

export async function requeueItems(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await query(
    `UPDATE portfolio_items SET status = $1, ${CLEAR_RESULTS}, updated_at = now()
     WHERE id = ANY($2::uuid[]) AND status = $3`,
    [ItemStatus.Pending, ids, ItemStatus.Processing],
  );
}

export async function rescanPortfolio(portfolioId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE portfolio_items SET status = $1, ${CLEAR_RESULTS}, updated_at = now()
     WHERE portfolio_id = $2 RETURNING id`,
    [ItemStatus.Pending, portfolioId],
  );
  await query(`UPDATE portfolios SET status = $1, finished_at = null WHERE id = $2`, [
    PortfolioStatus.Processing,
    portfolioId,
  ]);
  return rows.length;
}

export async function markItemError(id: string, message: string): Promise<void> {
  await query(
    `UPDATE portfolio_items SET status = $3, error = $2, updated_at = now() WHERE id = $1`,
    [id, message.slice(0, 300), ItemStatus.Error],
  );
}

export async function finishCompletedPortfolios(): Promise<void> {
  await query(
    `UPDATE portfolios p SET status = $1, finished_at = now()
     WHERE p.status = $2
       AND EXISTS (SELECT 1 FROM portfolio_items i WHERE i.portfolio_id = p.id)
       AND NOT EXISTS (
         SELECT 1 FROM portfolio_items i
         WHERE i.portfolio_id = p.id AND i.status IN ($3, $4)
       )`,
    [PortfolioStatus.Ready, PortfolioStatus.Processing, ItemStatus.Pending, ItemStatus.Processing],
  );
}

export async function resetStuckItems(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE portfolio_items SET status = $1, updated_at = now()
     WHERE status = $2 AND updated_at < now() - ($3 || ' minutes')::interval
     RETURNING id`,
    [ItemStatus.Pending, ItemStatus.Processing, String(STUCK_AFTER_MINUTES)],
  );
  return rows.length;
}
