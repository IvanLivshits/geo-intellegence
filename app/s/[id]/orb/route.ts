import { storageGet } from '@/lib/storage';
import { SHARE_ID_RE, metaKey, payloadKey } from '@/lib/share';
import { buildOrbArt } from '@/lib/cosmic-art';
import type { ScanPayload, ShareMeta } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!SHARE_ID_RE.test(params.id)) return new Response(null, { status: 400 });

  const rawMeta = await storageGet(metaKey(params.id));
  if (!rawMeta) return new Response(null, { status: 204 });
  const meta = JSON.parse(rawMeta.toString('utf8')) as ShareMeta;

  const rawPayload = await storageGet(payloadKey(params.id));
  if (!rawPayload) return new Response(null, { status: 204 });
  const payload = JSON.parse(rawPayload.toString('utf8')) as ScanPayload;

  if (!payload.buildings?.length && !meta.zone) return new Response(null, { status: 204 });

  const svg = buildOrbArt(meta, payload, meta.id.slice(0, 8), 256);
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=86400',
    },
  });
}
