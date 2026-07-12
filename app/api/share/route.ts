import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getCachedScan } from '@/lib/scan';
import { storagePut } from '@/lib/storage';
import { computeShareId, metaKey, payloadKey, readShareMeta, validateScanInput } from '@/lib/share';
import { saveLocation } from '@/lib/user-store';
import { sameOrigin } from '@/lib/csrf';
import type { ShareInput, ShareMeta, ShareUiState } from '@/lib/types';

async function saveToCabinet(userId: string, meta: ShareMeta): Promise<void> {
  try {
    await saveLocation(userId, {
      shareId: meta.id,
      label: meta.label,
      center: meta.center,
      radius: meta.radius,
      stats: meta.stats,
      input: meta.input,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[share] failed to save the location to the account: ${message}`);
  }
}

export const dynamic = 'force-dynamic';

interface ShareBody {
  input?: ShareInput;
  ui?: ShareUiState;
}

const RATE_WINDOW_MS = 5000;
const RATE_MAP_MAX = 1000;
const lastShareByIp = new Map<string, number>();

function markIp(ip: string): void {
  if (lastShareByIp.size >= RATE_MAP_MAX) {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [k, v] of lastShareByIp) {
      if (v < cutoff) lastShareByIp.delete(k);
    }
    while (lastShareByIp.size >= RATE_MAP_MAX) {
      const oldest = lastShareByIp.keys().next().value;
      if (oldest === undefined) break;
      lastShareByIp.delete(oldest);
    }
  }
  lastShareByIp.set(ip, Date.now());
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin forbidden', { status: 403 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  if (ip) {
    const last = lastShareByIp.get(ip) || 0;
    if (Date.now() - last < RATE_WINDOW_MS) {
      return new NextResponse('Too many requests — please wait a couple of seconds', { status: 429 });
    }
  }

  let body: ShareBody;
  try {
    body = await request.json();
  } catch {
    return new NextResponse('JSON body required', { status: 400 });
  }

  const input = validateScanInput(body.input);
  if (!input) return new NextResponse('Invalid input: lat/lon or polygon required', { status: 400 });
  const ui = body.ui ?? null;
  const label = input.label ?? null;

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const day = new Date().toISOString().slice(0, 10);
  const id = computeShareId(input, label, day);

  const existing = await readShareMeta(id);
  if (existing) {
    if (JSON.stringify(existing.ui) !== JSON.stringify(ui)) {
      existing.ui = ui;
      await storagePut(metaKey(id), Buffer.from(JSON.stringify(existing)), 'application/json');
    }
    if (userId) await saveToCabinet(userId, existing);
    if (ip) markIp(ip);
    return NextResponse.json({ id, url: `/s/${id}` });
  }

  try {
    let payload = await getCachedScan(input);
    if (!payload) {
      return new NextResponse(
        'Scan not found in cache — build the map and click “Share” again',
        { status: 409 },
      );
    }
    if (input.label) payload = { ...payload, label: input.label };
    const meta: ShareMeta = {
      id,
      input,
      ui,
      label: input.label ?? payload.label,
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
    await storagePut(payloadKey(id), Buffer.from(JSON.stringify(payload)), 'application/json');
    await storagePut(metaKey(id), Buffer.from(JSON.stringify(meta)), 'application/json');
    if (userId) await saveToCabinet(userId, meta);
    if (ip) markIp(ip);
    return NextResponse.json({ id, url: `/s/${id}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse('Error: ' + message, { status: 500 });
  }
}
