import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { storageGet, storagePublicUrl } from '@/lib/storage';
import type { ShareMeta } from '@/lib/types';
import ShareViewer from '@/components/ShareViewer';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-f]{10}$/;

async function readMeta(id: string): Promise<ShareMeta | null> {
  if (!ID_RE.test(id)) return null;
  const raw = await storageGet(`shares/${id}/meta.json`);
  if (!raw) return null;
  return JSON.parse(raw.toString('utf8')) as ShareMeta;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const meta = await readMeta(params.id);
  if (!meta) return { title: 'Снимок не найден · Geo-Intelligence' };
  const place = meta.label || `${meta.center[1].toFixed(4)}, ${meta.center[0].toFixed(4)}`;
  const bits: string[] = [];
  if (meta.stats.noise != null) bits.push(`шум ${meta.stats.noise} дБ`);
  if (meta.stats.q100 != null) bits.push(`паводок Q100 ${meta.stats.q100} см`);
  if (meta.stats.pluvial != null) bits.push(`ливни ${meta.stats.pluvial} см`);
  return {
    title: `Риски района · ${place}`,
    description: `3D-разбор рисков по открытым данным${bits.length ? ': ' + bits.join(' · ') : ''}. Geo-Intelligence.`,
  };
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const meta = await readMeta(params.id);
  if (!meta) notFound();
  const payloadUrl = storagePublicUrl(`shares/${params.id}/payload.json`) ?? `/api/share/${params.id}/payload`;
  return <ShareViewer meta={meta} payloadUrl={payloadUrl} />;
}
