import { NextResponse } from 'next/server';
import { storageGet } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function sniff(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return 'image/gif';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  if (!ID_RE.test(params.userId)) return new NextResponse('Invalid id', { status: 400 });
  const buf = await storageGet(`brands/${params.userId}/logo`);
  if (!buf) return new NextResponse('Not found', { status: 404 });
  const type = sniff(buf);
  if (!type) return new NextResponse('Unsupported image', { status: 415 });
  return new NextResponse(buf, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
