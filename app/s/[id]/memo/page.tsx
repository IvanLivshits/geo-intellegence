import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { storageGet } from '@/lib/storage';
import { payloadKey, readShareMeta } from '@/lib/share';
import { buildMemo } from '@/lib/memo';
import { migratePayload } from '@/lib/schema';
import { narrateMemo, resolveReportLocale } from '@/lib/narrate';
import { buildDistrictSchematic } from '@/lib/cosmic-art';
import { resolveShareBrand } from '@/lib/user-store';
import type { ScanPayload } from '@/lib/types';
import MemoView from '@/components/MemoView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const meta = await readShareMeta(params.id);
  if (!meta) return { title: 'Memo not found · Geo-Intelligence' };
  const place = meta.label || `${meta.center[1].toFixed(4)}, ${meta.center[0].toFixed(4)}`;
  return { title: `Risk memo · ${place}` };
}

export default async function MemoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { lang?: string };
}) {
  const meta = await readShareMeta(params.id);
  if (!meta) notFound();

  const raw = await storageGet(payloadKey(params.id));
  if (!raw) notFound();
  const payload = migratePayload(JSON.parse(raw.toString('utf8')));

  const memo = buildMemo(payload, { now: meta.createdAt });
  const { locale, place } = await resolveReportLocale(memo.center[1], memo.center[0], searchParams.lang);
  const narrative = await narrateMemo(memo, locale, place);
  const brand = await resolveShareBrand(meta);
  const schematic = buildDistrictSchematic(meta, payload, params.id);
  return (
    <MemoView
      memo={memo}
      narrative={narrative}
      shareId={params.id}
      brand={brand}
      schematic={schematic}
      locale={locale}
    />
  );
}
