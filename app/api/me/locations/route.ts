import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listLocations } from '@/lib/user-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Не авторизован', { status: 401 });
  const locations = await listLocations(session.user.id);
  return NextResponse.json(locations);
}
