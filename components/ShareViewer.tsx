'use client';

import { useEffect, useState } from 'react';
import type { ScanPayload, ShareMeta } from '@/lib/types';
import MapView from './MapView';
import UserMenu, { type SessionUser } from './UserMenu';

export default function ShareViewer({
  meta,
  payloadUrl,
  user,
}: {
  meta: ShareMeta;
  payloadUrl: string;
  user: SessionUser | null;
}) {
  const [payload, setPayload] = useState<ScanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apiUrl = `/api/share/${meta.id}/payload`;
    const urls = payloadUrl === apiUrl ? [payloadUrl] : [payloadUrl, apiUrl];

    (async () => {
      let lastErr: unknown = null;
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: ScanPayload = await res.json();
          if (!cancelled) setPayload(data);
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!cancelled) setError(lastErr instanceof Error ? lastErr.message : String(lastErr));
    })();

    return () => {
      cancelled = true;
    };
  }, [payloadUrl, meta.id]);

  const date = new Date(meta.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void-black">
      <header className="flex h-16 flex-none items-center justify-between border-b border-graphite px-5">
        <a
          href="/"
          className="font-mono text-mono-badge uppercase tracking-widest text-stellar-white hover:text-ash"
        >
          [ GEO-INTELLIGENCE ]
        </a>
        <div className="flex items-center gap-4">
          <a
            href={`/s/${meta.id}/memo`}
            className="font-mono text-mono-badge uppercase tracking-widest text-ash hover:text-stellar-white"
          >
            Risk memo →
          </a>
          <div className="font-mono text-mono-badge text-ash">snapshot from {date}</div>
          <UserMenu user={user} />
        </div>
      </header>

      <div className="relative flex min-h-0 w-full flex-1">
        {payload && (
          <MapView
            payload={payload}
            onBack={() => {
              window.location.href = '/';
            }}
            backLabel="← Your own scan"
            initial={meta.ui ?? undefined}
          />
        )}
        {!payload && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-void-black px-6 text-center text-ash">
            {error ? (
              <div className="font-sans text-body text-ash">Could not load the snapshot: {error}</div>
            ) : (
              <>
                <div className="h-9 w-9 animate-spin rounded-full border border-graphite border-t-stellar-white" />
                <div className="font-sans text-body text-ash">
                  Loading snapshot:{' '}
                  <span className="text-stellar-white">
                    {meta.label || `${meta.center[1].toFixed(4)}, ${meta.center[0].toFixed(4)}`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
