import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { storageGet } from '@/lib/storage';
import { SHARE_ID_RE, metaKey, payloadKey } from '@/lib/share';
import { buildArt } from '@/lib/cosmic-art';
import type { ScanPayload, ShareMeta } from '@/lib/types';

export const dynamic = 'force-dynamic';

const W = 1200;
const H = 630;

let fontsPromise: Promise<[Buffer, Buffer, Buffer]> | null = null;
function loadFonts(): Promise<[Buffer, Buffer, Buffer]> {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), 'assets', 'fonts');
    fontsPromise = Promise.all([
      readFile(path.join(dir, 'JetBrainsMono-Regular.ttf')),
      readFile(path.join(dir, 'Inter-latin-400.woff')),
      readFile(path.join(dir, 'Inter-cyrillic-400.woff')),
    ]).catch((err) => {
      fontsPromise = null;
      throw err;
    });
  }
  return fontsPromise;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const [mono, interLatin, interCyr] = await loadFonts();

  let meta: ShareMeta | null = null;
  let payload: ScanPayload | null = null;
  if (SHARE_ID_RE.test(params.id)) {
    const raw = await storageGet(metaKey(params.id));
    if (raw) meta = JSON.parse(raw.toString('utf8')) as ShareMeta;
    if (meta) {
      const rawPayload = await storageGet(payloadKey(params.id));
      if (rawPayload) payload = JSON.parse(rawPayload.toString('utf8')) as ScanPayload;
    }
  }

  const coordsText = meta ? `${meta.center[1].toFixed(5)}, ${meta.center[0].toFixed(5)}` : '';
  const label = meta ? meta.label || coordsText : 'Snapshot not found';
  const showCoords = Boolean(meta) && label.replace(/\s/g, '') !== coordsText.replace(/\s/g, '');
  const date = meta
    ? new Date(meta.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const art = buildArt(meta, payload, (meta?.id ?? '0badc0de').slice(0, 8));
  const artUri = `data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#0c0c0b',
          fontFamily: 'JetBrains Mono',
          position: 'relative',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artUri} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} alt="" />

        <div
          style={{
            position: 'absolute',
            left: 80,
            top: 90,
            width: 560,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 4, color: '#7d8187' }}>
            [ GEO-INTELLIGENCE ]
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 38,
              fontSize: 52,
              lineHeight: 1.25,
              color: '#ffffff',
              maxHeight: 260,
              overflow: 'hidden',
              fontFamily: 'Inter',
              letterSpacing: '-0.025em',
            }}
          >
            {label}
          </div>
          {showCoords && (
            <div style={{ display: 'flex', marginTop: 20, fontSize: 24, letterSpacing: 2, color: '#7d8187' }}>
              {coordsText}
            </div>
          )}
        </div>

        <div
          style={{
            position: 'absolute',
            left: 80,
            bottom: 58,
            display: 'flex',
            fontSize: 22,
            letterSpacing: 2,
            color: '#7d8187',
          }}
        >
          {date ? `snapshot from ${date} · 3D district risk scanner` : '3D district risk scanner'}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: 'JetBrains Mono', data: mono, style: 'normal', weight: 400 },
        { name: 'Inter', data: interLatin, style: 'normal', weight: 400 },
        { name: 'Inter', data: interCyr, style: 'normal', weight: 400 },
      ],
      headers: { 'Cache-Control': 'public, max-age=86400' },
    },
  );
}
