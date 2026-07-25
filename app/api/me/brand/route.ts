import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBrand, setBrand } from '@/lib/user-store';
import { storageDelete } from '@/lib/storage';
import { sameOrigin } from '@/lib/csrf';
import type { Brand } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CAP = { name: 120, logo: 2000, phone: 40, email: 160, website: 2000 };

function cleanText(v: unknown, cap: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, cap);
  return t || null;
}

function cleanUrl(v: unknown, cap: number): string | null | false {
  const t = cleanText(v, cap);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return t;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
  const brand = await getBrand(session.user.id);
  return NextResponse.json(brand);
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin forbidden', { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new NextResponse('JSON body required', { status: 400 });
  }

  const name = cleanText(body.name, CAP.name);
  if (!name) return new NextResponse('A non-empty brand name is required', { status: 400 });

  const logo = cleanUrl(body.logo, CAP.logo);
  if (logo === false) return new NextResponse('Logo must be a valid http(s) URL', { status: 400 });

  const website = cleanUrl(body.website, CAP.website);
  if (website === false) return new NextResponse('Website must be a valid http(s) URL', { status: 400 });

  const brand: Brand = {
    name,
    logo,
    phone: cleanText(body.phone, CAP.phone),
    email: cleanText(body.email, CAP.email),
    website,
  };

  const hosted =
    !!logo &&
    (logo.includes(`/brands/${session.user.id}/logo`) ||
      logo.includes(`/api/brand-logo/${session.user.id}`));
  if (!hosted) {
    await storageDelete(`brands/${session.user.id}/logo`).catch(() => undefined);
  }

  await setBrand(session.user.id, brand);
  return NextResponse.json(brand);
}
