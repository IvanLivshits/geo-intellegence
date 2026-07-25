import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sameOrigin } from '@/lib/csrf';
import { storagePut, storagePublicUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;
const ALLOWED: Record<string, true> = {
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true,
  'image/gif': true,
};

function baseUrl(request: Request): string {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse('Cross-origin forbidden', { status: 403 });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new NextResponse('Multipart form-data required', { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return new NextResponse('A file field is required', { status: 400 });
  if (!ALLOWED[file.type]) return new NextResponse('Logo must be PNG, JPEG, WebP or GIF', { status: 415 });
  if (file.size > MAX_BYTES) return new NextResponse('Logo must be 512 KB or smaller', { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const key = `brands/${userId}/logo`;
  await storagePut(key, buf, file.type);

  const version = createHash('sha1').update(buf).digest('hex').slice(0, 8);
  const base = storagePublicUrl(key) ?? `${baseUrl(request)}/api/brand-logo/${userId}`;
  return NextResponse.json({ url: `${base}?v=${version}` });
}
