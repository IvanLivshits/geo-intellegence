import { NextResponse } from 'next/server';
import { storageGet } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-f]{10}$/;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!ID_RE.test(params.id)) return new NextResponse('Некорректный id', { status: 400 });
  const payload = await storageGet(`shares/${params.id}/payload.json`);
  if (!payload) return new NextResponse('Снимок не найден', { status: 404 });
  return new NextResponse(payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
