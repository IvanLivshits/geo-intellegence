import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { storageGet } from '@/lib/storage';
import { payloadKey, readShareMeta } from '@/lib/share';
import { buildMemo } from '@/lib/memo';
import { narrateMemo } from '@/lib/narrate';
import type { ScanPayload } from '@/lib/types';
import MemoView from '@/components/MemoView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const meta = await readShareMeta(params.id);
  if (!meta) return { title: 'Memo not found · Geo-Intelligence' };
  const place = meta.label || `${meta.center[1].toFixed(4)}, ${meta.center[0].toFixed(4)}`;
  return { title: `Risk memo · ${place}` };
}

export default async function MemoPage({ params }: { params: { id: string } }) {
  const meta = await readShareMeta(params.id);
  if (!meta) notFound();

  const raw = await storageGet(payloadKey(params.id));
  if (!raw) notFound();
  const payload = JSON.parse(raw.toString('utf8')) as ScanPayload;

  const memo = buildMemo(payload, { now: meta.createdAt });
  const narrative = await narrateMemo(memo);
  return <MemoView memo={memo} narrative={narrative} shareId={params.id} />;
}
