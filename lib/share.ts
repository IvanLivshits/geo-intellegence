import { createHash } from 'node:crypto';
import { storageGet } from './storage';
import { RADIUS, RADIUS_MAX, RADIUS_MIN } from './constants';
import type { ScanInput } from './scan';
import type { ShareInput, ShareMeta } from './types';

export const SHARE_ID_RE = /^[0-9a-f]{10}$/;

export const metaKey = (id: string): string => `shares/${id}/meta.json`;
export const payloadKey = (id: string): string => `shares/${id}/payload.json`;

export async function readShareMeta(id: string): Promise<ShareMeta | null> {
  if (!SHARE_ID_RE.test(id)) return null;
  const raw = await storageGet(metaKey(id));
  if (!raw) return null;
  return JSON.parse(raw.toString('utf8')) as ShareMeta;
}

export function validateScanInput(raw: ShareInput | undefined): ScanInput | null {
  if (!raw) return null;
  if (Array.isArray(raw.polygon)) {
    const polygon = raw.polygon;
    if (polygon.length < 3 || polygon.length > 100) return null;
    for (const p of polygon) {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const [lat, lon] = p;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    }
    return { lat: polygon[0][0], lon: polygon[0][1], polygon, label: raw.label ?? null };
  }
  const { lat, lon } = raw;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const radius = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, raw.radius || RADIUS));
  return { lat, lon, radius, label: raw.label ?? null };
}

export function computeShareId(input: ScanInput, label: string | null, day: string): string {
  const canonical = JSON.stringify({
    lat: input.polygon ? undefined : input.lat.toFixed(6),
    lon: input.polygon ? undefined : input.lon.toFixed(6),
    radius: input.polygon ? undefined : input.radius,
    polygon: input.polygon?.map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`),
    label,
    day,
  });
  return createHash('sha1').update(canonical).digest('hex').slice(0, 10);
}
