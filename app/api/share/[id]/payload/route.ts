import { NextResponse } from 'next/server';
import { storageGet } from '@/lib/storage';
import { SHARE_ID_RE, payloadKey } from '@/lib/share';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!SHARE_ID_RE.test(params.id)) return new NextResponse('Некорректный id', { status: 400 });
  const payload = await storageGet(payloadKey(params.id));
  if (!payload) return new NextResponse('Снимок не найден', { status: 404 });
  return new NextResponse(payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
