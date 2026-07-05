import { NextResponse } from 'next/server';
import { storageGet } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-f]{10}$/;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!ID_RE.test(params.id)) return new NextResponse('Некорректный id', { status: 400 });
  const meta = await storageGet(`shares/${params.id}/meta.json`);
  if (!meta) return new NextResponse('Снимок не найден', { status: 404 });
  return new NextResponse(meta, { headers: { 'Content-Type': 'application/json' } });
}
