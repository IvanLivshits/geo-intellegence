import { NextResponse } from 'next/server';
import { computeScan } from '@/lib/scan';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');
  const radius = parseFloat(searchParams.get('radius') ?? '') || 500;
  const label = searchParams.get('label');

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new NextResponse('Нужны параметры lat и lon', { status: 400 });
  }

  try {
    const payload = await computeScan({ lat, lon, radius, label });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse('Ошибка: ' + message, { status: 500 });
  }
}
