import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteLocation, renameLocation } from '@/lib/user-store';
import { sameOrigin } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin запрещён', { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Не авторизован', { status: 401 });
  if (!UUID_RE.test(params.id)) return new NextResponse('Некорректный id', { status: 400 });

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse('Нужно JSON-тело', { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return new NextResponse('Нужно непустое имя', { status: 400 });

  const ok = await renameLocation(session.user.id, params.id, name);
  if (!ok) return new NextResponse('Локация не найдена', { status: 404 });
  return NextResponse.json({ id: params.id, name });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin запрещён', { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Не авторизован', { status: 401 });
  if (!UUID_RE.test(params.id)) return new NextResponse('Некорректный id', { status: 400 });

  const ok = await deleteLocation(session.user.id, params.id);
  if (!ok) return new NextResponse('Локация не найдена', { status: 404 });
  return new NextResponse(null, { status: 204 });
}
