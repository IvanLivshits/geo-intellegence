import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCachedScan, type ScanInput } from '@/lib/scan';
import { storageGet, storagePut } from '@/lib/storage';
import { RADIUS, RADIUS_MAX, RADIUS_MIN } from '@/lib/constants';
import type { ShareInput, ShareMeta, ShareUiState } from '@/lib/types';

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

function validInput(raw: ShareInput | undefined): ScanInput | null {
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

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const last = lastShareByIp.get(ip) || 0;
  if (Date.now() - last < RATE_WINDOW_MS) {
    return new NextResponse('Слишком часто — подождите пару секунд', { status: 429 });
  }

  let body: ShareBody;
  try {
    body = await request.json();
  } catch {
    return new NextResponse('Нужно JSON-тело', { status: 400 });
  }

  const input = validInput(body.input);
  if (!input) return new NextResponse('Некорректный input: нужны lat/lon или polygon', { status: 400 });
  const ui = body.ui ?? null;

  const day = new Date().toISOString().slice(0, 10);
  const canonical = JSON.stringify({
    lat: input.polygon ? undefined : input.lat.toFixed(6),
    lon: input.polygon ? undefined : input.lon.toFixed(6),
    radius: input.polygon ? undefined : input.radius,
    polygon: input.polygon?.map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`),
    day,
  });
  const id = createHash('sha1').update(canonical).digest('hex').slice(0, 10);
  const metaKey = `shares/${id}/meta.json`;

  const existing = await storageGet(metaKey);
  if (existing) {
    const meta = JSON.parse(existing.toString('utf8')) as ShareMeta;
    if (JSON.stringify(meta.ui) !== JSON.stringify(ui)) {
      meta.ui = ui;
      await storagePut(metaKey, Buffer.from(JSON.stringify(meta)), 'application/json');
    }
    markIp(ip);
    return NextResponse.json({ id, url: `/s/${id}` });
  }

  try {
    let payload = await getCachedScan(input);
    if (!payload) {
      return new NextResponse(
        'Скан не найден в кэше — постройте карту и нажмите «Поделиться» ещё раз',
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
    await storagePut(`shares/${id}/payload.json`, Buffer.from(JSON.stringify(payload)), 'application/json');
    await storagePut(metaKey, Buffer.from(JSON.stringify(meta)), 'application/json');
    markIp(ip);
    return NextResponse.json({ id, url: `/s/${id}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse('Ошибка: ' + message, { status: 500 });
  }
}
