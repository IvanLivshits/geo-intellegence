import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sameOrigin } from '@/lib/csrf';
import { deletePortfolio, getPortfolio, listItems } from '@/lib/portfolio-store';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  if (!UUID_RE.test(params.id)) return new NextResponse('Not found', { status: 404 });

  const portfolio = await getPortfolio(userId, params.id);
  if (!portfolio) return new NextResponse('Not found', { status: 404 });

  const items = await listItems(portfolio.id);
  return NextResponse.json({ portfolio, items });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin forbidden', { status: 403 });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  if (!UUID_RE.test(params.id)) return new NextResponse('Not found', { status: 404 });

  const deleted = await deletePortfolio(userId, params.id);
  if (!deleted) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(null, { status: 204 });
}
