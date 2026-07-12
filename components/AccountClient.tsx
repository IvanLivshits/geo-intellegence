'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ShareInput } from '@/lib/types';
import { starfieldUri } from './cosmicArt';

export interface AccountUser {
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface AccountLocation {
  id: string;
  share_id: string;
  name: string | null;
  label: string | null;
  center: [number, number] | null;
  radius: number | null;
  stats: { noise: number | null; q100: number | null; pluvial: number | null } | null;
  status: 'processing' | 'ready' | 'error';
  error: string | null;
  input: ShareInput | null;
  created_at: string;
}

const CARD_H = 200;
const GAP = 14;
const MIN_CARD_W = 440;
const MAX_COLS = 2;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function OrbImage({ shareId }: { shareId: string }) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth > 0) setShown(true);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={`/s/${shareId}/orb`}
      alt=""
      loading="lazy"
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth > 0) setShown(true);
      }}
      className={cn(
        'pointer-events-none absolute top-1/2 h-[256px] w-[256px] -translate-y-1/2 object-contain transition-opacity duration-500',
        shown ? 'opacity-100' : 'opacity-0',
      )}
      style={{ right: -40 }}
    />
  );
}

function StatChip({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <span className="whitespace-nowrap font-mono text-mono-badge text-ash">
      {label} <span className="text-stellar-white">{Math.round(value)}</span>
    </span>
  );
}

function LocationCard({
  loc,
  editing,
  editValue,
  busy,
  confirming,
  onEditValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onRetry,
}: {
  loc: AccountLocation;
  editing: boolean;
  editValue: string;
  busy: boolean;
  confirming: boolean;
  onEditValue: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onRetry: () => void;
}) {
  const starfield = useMemo(() => starfieldUri(loc.share_id, 640, 220), [loc.share_id]);
  const title = loc.name || loc.label || 'Location';
  const coord = loc.center ? `${loc.center[1].toFixed(5)}, ${loc.center[0].toFixed(5)}` : null;
  const showCoord = coord != null && title.replace(/\s/g, '') !== coord.replace(/\s/g, '');
  const ready = loc.status === 'ready';
  const processing = loc.status === 'processing';

  return (
    <article
      className="group relative overflow-hidden rounded border border-graphite bg-void-black transition-colors hover:border-smoke"
      style={{ height: CARD_H }}
    >
      <div
        className="absolute inset-0 bg-cover"
        style={{ backgroundImage: `url("${starfield}")` }}
      />
      {ready && <OrbImage shareId={loc.share_id} />}
      {processing && (
        <div className="pointer-events-none absolute right-16 top-1/2 -translate-y-1/2">
          <div className="h-9 w-9 animate-spin rounded-full border border-graphite border-t-stellar-white" />
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, #0c0c0b 30%, rgba(12,12,11,0.7) 55%, rgba(12,12,11,0) 80%)',
        }}
      />

      <div className="relative flex h-full flex-col justify-between p-5">
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-smoke">
            [ GEO-INTELLIGENCE ]
          </div>
          {editing ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => onEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              onBlur={onCancelEdit}
              maxLength={120}
              className="mt-3 w-full max-w-[64%] rounded-none border-b border-smoke bg-transparent pb-1 font-sans text-[28px] tracking-[-0.025em] text-stellar-white outline-none focus:border-stellar-white"
            />
          ) : ready ? (
            <a
              href={`/s/${loc.share_id}`}
              className="mt-3 block max-w-[62%] truncate font-sans text-[28px] tracking-[-0.025em] text-stellar-white hover:underline"
              title={title}
            >
              {title}
            </a>
          ) : (
            <div
              className="mt-3 block max-w-[62%] truncate font-sans text-[28px] tracking-[-0.025em] text-stellar-white"
              title={title}
            >
              {title}
            </div>
          )}
          {showCoord && !editing && (
            <div className="mt-2 max-w-[62%] truncate font-mono text-[13px] tracking-[0.12em] text-ash">
              {coord}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {ready ? (
            <>
              <span className="font-mono text-mono-badge text-smoke">{fmtDate(loc.created_at)}</span>
              <StatChip label="Noise" value={loc.stats?.noise} />
              <StatChip label="Flood" value={loc.stats?.q100} />
              <StatChip label="Pluvial" value={loc.stats?.pluvial} />
            </>
          ) : processing ? (
            <span className="font-mono text-mono-badge uppercase tracking-wider text-ash">
              computing…
            </span>
          ) : (
            <span className="flex items-center gap-3">
              <span className="font-mono text-mono-badge uppercase tracking-wider text-alert-red">
                scan failed
              </span>
              {loc.input && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={busy}
                  className="font-mono text-mono-badge uppercase tracking-wider text-ash transition-colors enabled:hover:text-stellar-white disabled:opacity-40"
                >
                  Retry
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {!editing && (
        <div className="absolute right-2 top-2 flex items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={busy}
                className="bg-void-black/70 px-2 py-1 font-mono text-mono-badge text-alert-red backdrop-blur-sm hover:text-alert-red disabled:opacity-40"
              >
                Delete?
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="bg-void-black/70 px-2 py-1 font-mono text-mono-badge text-ash backdrop-blur-sm hover:text-stellar-white"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onStartEdit}
                className="bg-void-black/70 px-2 py-1 font-mono text-mono-badge text-ash backdrop-blur-sm transition-colors hover:text-stellar-white"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={onAskDelete}
                className="bg-void-black/70 px-2 py-1 font-mono text-mono-badge text-ash backdrop-blur-sm transition-colors hover:text-alert-red"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function AccountClient({
  user,
  locations: initial,
}: {
  user: AccountUser;
  locations: AccountLocation[];
}) {
  const [locations, setLocations] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cols, setCols] = useState(2);
  const [pageSize, setPageSize] = useState(6);
  const [page, setPage] = useState(0);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(0);
  const psRef = useRef(6);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      const nextCols = Math.max(1, Math.min(MAX_COLS, Math.floor((w + GAP) / (MIN_CARD_W + GAP))));
      const nextRows = Math.max(1, Math.floor((h + GAP) / (CARD_H + GAP)));
      const nextPs = Math.max(1, nextCols * nextRows);
      setCols(nextCols);
      if (nextPs !== psRef.current) {
        const first = pageRef.current * psRef.current;
        psRef.current = nextPs;
        setPageSize(nextPs);
        setPage(Math.floor(first / nextPs));
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const processingCount = locations.filter((l) => l.status === 'processing').length;
  useEffect(() => {
    if (processingCount === 0) return;
    const id = setInterval(async () => {
      const res = await fetch('/api/me/locations').catch(() => null);
      if (res?.ok) setLocations(await res.json());
    }, 4000);
    return () => clearInterval(id);
  }, [processingCount]);

  const total = locations.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const start = page * pageSize;
  const visible = locations.slice(start, start + pageSize);

  const initialLetter = (user.name?.trim()?.[0] ?? user.email?.trim()?.[0] ?? '?').toUpperCase();

  async function saveRename(id: string) {
    const name = editValue.trim();
    if (!name) {
      setEditing(null);
      return;
    }
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/me/locations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/me/locations/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error((await res.text()) || `HTTP ${res.status}`);
      setLocations((prev) => prev.filter((l) => l.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function retry(loc: AccountLocation) {
    if (!loc.input) return;
    setBusy(loc.id);
    setError(null);
    const res = await fetch('/api/me/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: loc.input, force: true }),
    }).catch(() => null);
    if (res?.ok) {
      setLocations((prev) =>
        prev.map((l) => (l.id === loc.id ? { ...l, status: 'processing', error: null } : l)),
      );
    } else {
      setError('Could not restart the scan');
    }
    setBusy(null);
  }

  const rangeFrom = total === 0 ? 0 : start + 1;
  const rangeTo = Math.min(start + pageSize, total);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void-black text-stellar-white">
      <header className="flex h-16 flex-none items-center justify-between border-b border-graphite px-5">
        <a
          href="/"
          className="font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:text-stellar-white"
        >
          ← [ GEO-INTELLIGENCE ]
        </a>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-graphite bg-charcoal font-mono text-mono-badge text-stellar-white">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                initialLetter
              )}
            </div>
            <div className="font-mono text-mono-badge text-ash">{user.name || user.email}</div>
          </div>
          <Button variant="nav" onClick={() => signOut({ callbackUrl: '/' })}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col overflow-hidden px-5 py-5">
        <div className="mb-3 flex flex-none items-baseline justify-between">
          <h1 className="font-mono text-mono-label uppercase tracking-wider text-ash">
            Saved locations
          </h1>
          <span className="font-mono text-mono-badge text-smoke">
            {total > 0 ? `${rangeFrom}–${rangeTo} of ${total}` : '0'}
          </span>
        </div>

        {error && (
          <div className="mb-3 flex-none border border-alert-red/70 px-4 py-2 font-mono text-mono-badge text-alert-red">
            {error}
          </div>
        )}

        {total === 0 ? (
          <div className="flex flex-1 items-center justify-center border border-graphite text-center font-sans text-body text-ash">
            Nothing here yet. Build a map on the home page and press “Share” — the location will
            appear here.
          </div>
        ) : (
          <div ref={gridRef} className="min-h-0 flex-1 overflow-hidden">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: GAP,
                gridAutoRows: `${CARD_H}px`,
              }}
            >
              {visible.map((loc) => (
                <LocationCard
                  key={loc.id}
                  loc={loc}
                  editing={editing === loc.id}
                  editValue={editValue}
                  busy={busy === loc.id}
                  confirming={confirmDelete === loc.id}
                  onEditValue={setEditValue}
                  onStartEdit={() => {
                    setEditing(loc.id);
                    setEditValue(loc.name || loc.label || '');
                    setConfirmDelete(null);
                  }}
                  onSaveEdit={() => saveRename(loc.id)}
                  onCancelEdit={() => setEditing(null)}
                  onAskDelete={() => setConfirmDelete(loc.id)}
                  onConfirmDelete={() => remove(loc.id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onRetry={() => retry(loc)}
                />
              ))}
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="mt-3 flex flex-none items-center justify-between border-t border-graphite pt-3">
            <span className="font-mono text-mono-badge text-smoke">
              {pageSize} per page
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page <= 0}
                className="font-mono text-mono-label uppercase tracking-wider text-ash transition-colors enabled:hover:text-stellar-white disabled:opacity-30"
              >
                ‹ Prev
              </button>
              <span className="min-w-[64px] text-center font-mono text-mono-badge text-stellar-white">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="font-mono text-mono-label uppercase tracking-wider text-ash transition-colors enabled:hover:text-stellar-white disabled:opacity-30"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
