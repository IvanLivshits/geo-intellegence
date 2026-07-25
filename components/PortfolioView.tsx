'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Upload, Trash2, ArrowLeft } from 'lucide-react';
import { BAND_RANK, MASK_META, type Band, type MaskKey } from '@/lib/constants';
import { ItemStatus, PortfolioStatus, type DbPortfolio, type DbPortfolioItem } from '@/lib/portfolio-types';
import { cn } from '@/lib/utils';
import UserMenu, { type SessionUser } from './UserMenu';

const VISIBLE: MaskKey[] = (Object.keys(MASK_META) as MaskKey[]).filter((k) => !MASK_META[k].hidden);

const BAND_COLOR: Record<Band, string> = {
  low: '#4ade80',
  moderate: '#facc15',
  high: '#ff6308',
  severe: '#f87171',
  unknown: '#7d8187',
};

const BAND_ORDER: Band[] = ['severe', 'high', 'moderate', 'low', 'unknown'];

function Dot({ band }: { band: Band }) {
  return <span className="inline-block h-2 w-2 flex-none" style={{ backgroundColor: BAND_COLOR[band] }} />;
}

export default function PortfolioView({ id, user }: { id: string; user: SessionUser | null }) {
  const [portfolio, setPortfolio] = useState<DbPortfolio | null>(null);
  const [items, setItems] = useState<DbPortfolioItem[]>([]);
  const [filter, setFilter] = useState<Band | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portfolios/${id}`);
      if (!alive.current) return;
      if (res.status === 401 || res.status === 404) {
        setError(await res.text());
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { portfolio: DbPortfolio; items: DbPortfolioItem[] };
      if (!alive.current) return;
      setPortfolio(data.portfolio);
      setItems(data.items);
      setStale(null);
      if (data.portfolio.status === PortfolioStatus.Processing) {
        timer.current = setTimeout(load, 4000);
      }
    } catch (err) {
      if (!alive.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setStale(message);
      timer.current = setTimeout(load, 8000);
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const done = items.filter((i) => i.status === ItemStatus.Ready || i.status === ItemStatus.Error).length;
  const failed = items.filter((i) => i.status === ItemStatus.Error).length;

  const counts = useMemo(() => {
    const map = new Map<Band, number>();
    for (const i of items) {
      if (i.status !== ItemStatus.Ready || !i.overall_band) continue;
      map.set(i.overall_band, (map.get(i.overall_band) ?? 0) + 1);
    }
    return BAND_ORDER.map((band) => ({ band, n: map.get(band) ?? 0 })).filter((c) => c.n > 0);
  }, [items]);

  const rows = useMemo(() => {
    const ready = items.filter((i) => i.status === ItemStatus.Ready);
    const sorted = [...ready].sort(
      (a, b) => BAND_RANK[b.overall_band ?? 'unknown'] - BAND_RANK[a.overall_band ?? 'unknown'],
    );
    const rest = items.filter((i) => i.status !== ItemStatus.Ready);
    const all = [...sorted, ...rest];
    return filter ? all.filter((i) => i.overall_band === filter) : all;
  }, [items, filter]);

  const exportCsv = () => {
    const header = [
      'ref',
      'address',
      'lat',
      'lon',
      'status',
      'overall_band',
      'layers_assessed',
      ...VISIBLE.flatMap((k) => [`${k}_value`, `${k}_band`]),
      'headline',
      'memo_url',
      'error',
    ];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const i of items) {
      const settled = i.status === ItemStatus.Ready;
      lines.push(
        [
          i.ref,
          i.address ?? '',
          i.lat ?? '',
          i.lon ?? '',
          i.status,
          settled ? (i.overall_band ?? '') : '',
          settled ? (i.assessed ?? '') : '',
          ...VISIBLE.flatMap((k) => (settled ? [i.vals?.[k] ?? '', i.bands?.[k] ?? ''] : ['', ''])),
          settled ? (i.headline ?? '') : '',
          settled && i.share_id ? `${window.location.origin}/s/${i.share_id}/memo` : '',
          i.error ?? '',
        ]
          .map(esc)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${portfolio?.name ?? 'portfolio'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return <div className="p-8 font-sans text-body text-alert-red">Could not load the portfolio: {error}</div>;
  }
  if (!portfolio) {
    return <div className="p-8 font-mono text-mono-badge uppercase text-ash">Loading…</div>;
  }

  const processing = portfolio.status === PortfolioStatus.Processing;

  return (
    <div className="min-h-screen bg-void-black">
      <header className="flex items-center justify-between border-b border-graphite px-6 py-4">
        <div className="flex items-center gap-4">
          <a
            href="/account"
            className="flex items-center gap-2 font-mono text-mono-badge uppercase tracking-widest text-ash hover:text-stellar-white"
          >
            <ArrowLeft size={13} /> Account
          </a>
          <div>
            <div className="font-sans text-body-lg text-stellar-white">{portfolio.name}</div>
            <div className="font-mono text-mono-badge text-ash">
              {portfolio.total} assets · radius {portfolio.radius} m
              {failed > 0 && <span className="text-alert-red"> · {failed} failed</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 border border-graphite px-3 py-2 font-mono text-mono-badge uppercase tracking-widest text-ash hover:text-stellar-white"
          >
            <Download size={13} /> Export CSV
          </button>
          <UserMenu user={user} />
        </div>
      </header>

      {stale && (
        <div className="border-b border-graphite bg-charcoal/40 px-6 py-2 font-mono text-mono-badge text-ash">
          Live updates interrupted ({stale}) — retrying…
        </div>
      )}

      {processing && (
        <div className="border-b border-graphite px-6 py-3">
          <div className="flex items-center justify-between font-mono text-mono-badge text-ash">
            <span>
              Scanning · {done}/{portfolio.total}
            </span>
            <span>{Math.round((done / Math.max(1, portfolio.total)) * 100)}%</span>
          </div>
          <div className="mt-2 h-0.5 w-full bg-graphite">
            <div
              className="h-0.5 bg-stellar-white transition-all"
              style={{ width: `${(done / Math.max(1, portfolio.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-graphite px-6 py-4">
          {counts.map((c) => (
            <button
              key={c.band}
              type="button"
              onClick={() => setFilter(filter === c.band ? null : c.band)}
              className={cn(
                'flex items-center gap-2 border px-3 py-1.5 font-mono text-mono-badge uppercase tracking-widest transition-colors',
                filter === c.band
                  ? 'border-stellar-white text-stellar-white'
                  : 'border-graphite text-ash hover:text-stellar-white',
              )}
            >
              <Dot band={c.band} />
              {c.band} · {c.n}
            </button>
          ))}
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="px-3 py-1.5 font-mono text-mono-badge uppercase tracking-widest text-ash hover:text-stellar-white"
            >
              clear filter
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto px-6 py-4">
        <table className="w-full border-collapse font-sans text-body">
          <thead>
            <tr className="border-b border-graphite text-left font-mono text-mono-badge uppercase tracking-widest text-ash">
              <th className="py-2 pr-4 font-normal">Ref</th>
              <th className="py-2 pr-4 font-normal">Address</th>
              <th className="py-2 pr-4 font-normal">Overall</th>
              <th className="py-2 pr-4 font-normal">Assessed</th>
              {VISIBLE.map((k) => (
                <th key={k} className="py-2 pr-3 text-right font-normal">
                  {MASK_META[k].label}
                </th>
              ))}
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const settled = i.status === ItemStatus.Ready;
              return (
              <tr key={i.id} className="border-b border-charcoal align-top">
                <td className="py-2.5 pr-4 font-mono text-mono-badge text-ash">{i.ref}</td>
                <td className="py-2.5 pr-4 text-stellar-white">
                  {i.address ?? `${i.lat?.toFixed(4)}, ${i.lon?.toFixed(4)}`}
                  {i.status === ItemStatus.Error && (
                    <div className="font-mono text-mono-badge text-alert-red">{i.error}</div>
                  )}
                  {i.status === ItemStatus.Ready && i.headline && (
                    <div className="font-mono text-mono-badge text-ash">{i.headline}</div>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  {i.status === ItemStatus.Ready && i.overall_band ? (
                    <span className="flex items-center gap-2 font-mono text-mono-badge uppercase text-stellar-white">
                      <Dot band={i.overall_band} />
                      {i.overall_band === 'unknown' ? 'not assessed' : i.overall_band}
                    </span>
                  ) : (
                    <span className="font-mono text-mono-badge uppercase text-ash">{i.status}</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-mono-badge text-ash">
                  {settled ? (i.assessed ?? '—') : '—'}
                </td>
                {VISIBLE.map((k) => {
                  const band = settled ? (i.bands?.[k] ?? null) : null;
                  const value = settled ? (i.vals?.[k] ?? null) : null;
                  return (
                    <td key={k} className="whitespace-nowrap py-2.5 pr-3 text-right font-mono text-mono-badge">
                      {band ? (
                        <span className="flex items-center justify-end gap-1.5 text-ash">
                          {value == null ? '—' : `${value} ${MASK_META[k].unit}`}
                          <Dot band={band} />
                        </span>
                      ) : (
                        <span className="text-smoke">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="py-2.5 text-right">
                  {settled && i.share_id && (
                    <Link
                      href={`/s/${i.share_id}/memo`}
                      className="font-mono text-mono-badge uppercase tracking-widest text-ash hover:text-stellar-white"
                    >
                      Memo →
                    </Link>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PortfolioUpload({ onCreated }: { onCreated: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const csv = await file.text();
      const res = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name.replace(/\.csv$/i, ''), csv }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { id: string };
      onCreated(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="flex items-center gap-2 border border-graphite px-3 py-2 font-mono text-mono-badge uppercase tracking-widest text-ash hover:text-stellar-white disabled:opacity-50"
      >
        <Upload size={13} /> {busy ? 'Uploading…' : 'Upload portfolio CSV'}
      </button>
      {error && <div className="mt-2 font-mono text-mono-badge text-alert-red">{error}</div>}
    </div>
  );
}

export function PortfolioList({ portfolios }: { portfolios: DbPortfolio[] }) {
  const [items, setItems] = useState(portfolios);

  const remove = async (id: string) => {
    const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((p) => p.id !== id));
  };

  if (!items.length) {
    return (
      <div className="font-sans text-body text-ash">
        No portfolios yet. Upload a CSV with an <span className="text-stellar-white">address</span> column (or{' '}
        <span className="text-stellar-white">lat</span>/<span className="text-stellar-white">lon</span>) to scan a whole
        book of collateral.
      </div>
    );
  }

  return (
    <div className="divide-y divide-graphite border border-graphite">
      {items.map((p) => (
        <div key={p.id} className="flex items-center justify-between px-4 py-3">
          <a href={`/portfolio/${p.id}`} className="min-w-0 flex-1">
            <div className="truncate font-sans text-body text-stellar-white">{p.name}</div>
            <div className="font-mono text-mono-badge text-ash">
              {p.total} assets · {p.status === PortfolioStatus.Processing ? 'scanning…' : 'ready'}
            </div>
          </a>
          <button
            type="button"
            onClick={() => void remove(p.id)}
            aria-label="Delete portfolio"
            className="text-ash hover:text-alert-red"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
