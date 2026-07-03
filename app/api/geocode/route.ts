import { NextResponse } from 'next/server';
import { geocode } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim();

  if (!query) {
    return new NextResponse('Нужен параметр q', { status: 400 });
  }

  try {
    const loc = await geocode(query);
    return NextResponse.json(loc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse('Ошибка: ' + message, { status: 500 });
  }
}
