import { NextResponse } from 'next/server';
import { storageGet } from '@/lib/storage';
import { SHARE_ID_RE, metaKey } from '@/lib/share';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!SHARE_ID_RE.test(params.id)) return new NextResponse('Некорректный id', { status: 400 });
  const meta = await storageGet(metaKey(params.id));
  if (!meta) return new NextResponse('Снимок не найден', { status: 404 });
  return new NextResponse(meta, { headers: { 'Content-Type': 'application/json' } });
}
