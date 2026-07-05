import { storageGet } from './storage';
import type { ShareMeta } from './types';

export const SHARE_ID_RE = /^[0-9a-f]{10}$/;

export const metaKey = (id: string): string => `shares/${id}/meta.json`;
export const payloadKey = (id: string): string => `shares/${id}/payload.json`;

export async function readShareMeta(id: string): Promise<ShareMeta | null> {
  if (!SHARE_ID_RE.test(id)) return null;
  const raw = await storageGet(metaKey(id));
  if (!raw) return null;
  return JSON.parse(raw.toString('utf8')) as ShareMeta;
}
