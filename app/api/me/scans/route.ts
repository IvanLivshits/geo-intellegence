import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sameOrigin } from '@/lib/csrf';
import { computeScan, getCachedScan, type ScanInput } from '@/lib/scan';
import { storagePut } from '@/lib/storage';
import { computeShareId, metaKey, payloadKey, readShareMeta, validateScanInput } from '@/lib/share';
import {
  createProcessingLocation,
  getLocationStatus,
  markLocationError,
  markLocationReady,
} from '@/lib/user-store';
import type { ShareInput, ShareMeta } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SCAN_COOLDOWN_MS = 3000;
const SCAN_MAP_MAX = 5000;
const lastScanByUser = new Map<string, number>();

function tooSoon(userId: string): boolean {
  const now = Date.now();
  const last = lastScanByUser.get(userId) ?? 0;
  if (now - last < SCAN_COOLDOWN_MS) return true;
  if (lastScanByUser.size >= SCAN_MAP_MAX) {
    const cutoff = now - SCAN_COOLDOWN_MS;
    for (const [k, v] of lastScanByUser) if (v < cutoff) lastScanByUser.delete(k);
  }
  lastScanByUser.set(userId, now);
  return false;
}

async function computeAndStore(
  userId: string,
  shareId: string,
  input: ScanInput,
  label: string | null,
): Promise<void> {
  try {
    let payload = (await getCachedScan(input)) ?? (await computeScan(input));
    if (label) payload = { ...payload, label };
    const existing = await readShareMeta(shareId);
    const meta: ShareMeta = {
      id: shareId,
      input,
      ui: existing?.ui ?? null,
      label: label ?? payload.label,
      center: payload.center,
      radius: payload.radius,
      zone: payload.zone ?? null,
      createdAt: new Date().toISOString(),
      stats: {
        noise: payload.masks.noise.avg,
        q100: payload.masks.q100.avg,
        pluvial: payload.masks.pluvial.avg,
      },
    };
    await storagePut(payloadKey(shareId), Buffer.from(JSON.stringify(payload)), 'application/json');
    await storagePut(metaKey(shareId), Buffer.from(JSON.stringify(meta)), 'application/json');
    await markLocationReady(userId, shareId, {
      label: meta.label,
      center: meta.center,
      radius: meta.radius,
      stats: meta.stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markLocationError(userId, shareId, message);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin запрещён', { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Не авторизован', { status: 401 });

  const userId = session.user.id;

  let body: { input?: ShareInput; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return new NextResponse('Нужно JSON-тело', { status: 400 });
  }

  const input = validateScanInput(body.input);
  if (!input) return new NextResponse('Некорректный input: нужны lat/lon или polygon', { status: 400 });

  const label = input.label ?? null;
  const day = new Date().toISOString().slice(0, 10);
  const shareId = computeShareId(input, label, day);

  if (!body.force) {
    const status = await getLocationStatus(userId, shareId);
    if (status === 'ready' || status === 'processing') {
      return NextResponse.json({ id: shareId, url: `/s/${shareId}`, status });
    }
  }

  if (tooSoon(userId)) {
    return new NextResponse('Слишком часто — подождите пару секунд', { status: 429 });
  }

  await createProcessingLocation(userId, {
    shareId,
    label,
    center: input.polygon ? null : [input.lon, input.lat],
    radius: input.polygon ? null : input.radius ?? null,
    input,
  });

  void computeAndStore(userId, shareId, input, label);

  return NextResponse.json({ id: shareId, url: `/s/${shareId}`, status: 'processing' });
}
