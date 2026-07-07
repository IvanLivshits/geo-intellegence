import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { storagePublicUrl } from '@/lib/storage';
import { payloadKey, readShareMeta } from '@/lib/share';
import ShareViewer from '@/components/ShareViewer';

export const dynamic = 'force-dynamic';

function requestBase(): URL {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return new URL(`${proto}://${host}`);
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const meta = await readShareMeta(params.id);
  if (!meta) return { title: 'Снимок не найден · Geo-Intelligence' };
  const place = meta.label || `${meta.center[1].toFixed(4)}, ${meta.center[0].toFixed(4)}`;
  const title = `Риски района · ${place}`;
  const description = '3D-разбор рисков района по открытым данным. Geo-Intelligence.';
  const ogUrl = new URL(`/s/${params.id}/og`, requestBase()).toString();
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const meta = await readShareMeta(params.id);
  if (!meta) notFound();
  const payloadUrl = storagePublicUrl(payloadKey(params.id)) ?? `/api/share/${params.id}/payload`;
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name ?? null, image: session.user.image ?? null }
    : null;
  return <ShareViewer meta={meta} payloadUrl={payloadUrl} user={user} />;
}
