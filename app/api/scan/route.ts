import { NextResponse } from 'next/server';
import { computeScan } from '@/lib/scan';
import { RADIUS, RADIUS_MAX, RADIUS_MIN } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function parsePolygon(raw: string | null): [number, number][] | null {
  if (!raw) return null;
  const points = raw.split(';').map((pair) => {
    const [lat, lon] = pair.split(',').map(Number);
    return [lat, lon] as [number, number];
  });
  if (points.length < 3 || points.length > 100) return null;
  for (const [lat, lon] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  }
  return points;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const label = searchParams.get('label');
  const polygon = parsePolygon(searchParams.get('polygon'));

  const lat = polygon ? polygon[0][0] : parseFloat(searchParams.get('lat') ?? '');
  const lon = polygon ? polygon[0][1] : parseFloat(searchParams.get('lon') ?? '');
  const radiusRaw = parseFloat(searchParams.get('radius') ?? '') || RADIUS;
  const radius = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, radiusRaw));

  if (!polygon && (!Number.isFinite(lat) || !Number.isFinite(lon))) {
    return new NextResponse('Нужны параметры lat и lon либо polygon', { status: 400 });
  }

  try {
    const payload = await computeScan({ lat, lon, radius, label, polygon: polygon ?? undefined });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /Зона слишком большая|пересекает сам себя/.test(message) ? 400 : 500;
    return new NextResponse('Ошибка: ' + message, { status });
  }
}
