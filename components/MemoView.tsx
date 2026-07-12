'use client';

import { Printer, ArrowLeft } from 'lucide-react';
import { BAND_RANK, type Band } from '@/lib/constants';
import type { MemoNarrative } from '@/lib/narrate';
import type { RiskMemo, RiskMemoEntry } from '@/lib/types';

const BAND_COLOR: Record<Band, string> = {
  low: '#15a34a',
  moderate: '#d97706',
  high: '#ea580c',
  severe: '#dc2626',
  unknown: '#9aa0a8',
};

const KIND_ORDER: RiskMemoEntry['kind'][] = ['official', 'measured', 'modeled'];
const KIND_TITLE: Record<RiskMemoEntry['kind'], string> = {
  official: 'Official dataset',
  measured: 'Observation',
  modeled: 'Model (open data)',
};
const KIND_TAG: Record<RiskMemoEntry['kind'], string> = {
  official: 'official',
  measured: 'observed',
  modeled: 'model',
};
const SUMMARY_ORDER: Band[] = ['severe', 'high', 'moderate', 'low', 'unknown'];

const BAND_TEXT: Record<Band, string> = {
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  severe: 'severe',
  unknown: 'no data',
};

function modelledBand(memo: RiskMemo, key: string): Band {
  return memo.entries.find((e) => e.key === key)?.band ?? 'unknown';
}

const NEIGHBOUR_MEANING: Record<string, string> = {
  hazard: 'Fuel, storage tanks, substations, aerodromes — sources of fire, blast or contamination exposure.',
  hub: 'Stations, terminals and construction sites — traffic, dust and noise load.',
  nightlife: 'Bars, pubs, clubs — evening noise and footfall, relevant to residential use.',
  retail: 'Malls and large retail — delivery traffic and parking pressure.',
  venue: 'Stadiums, cinemas, theatres — event-driven peaks in crowds and traffic.',
};

function scenarioDelta(today: RiskMemoEntry, future: RiskMemoEntry): string {
  if (today.degraded || future.degraded) {
    return 'No data: the flood dataset could not be retrieved for this location — this is NOT a statement that the site is safe.';
  }
  const a = today.value;
  const b = future.value;
  if (a == null && b == null) return 'No change: the site stays outside the mapped flood zone in 2050.';
  if (a == null && b != null) return `The site enters the mapped flood zone by 2050 — modelled depth ${b} ${future.unit}.`;
  if (a != null && b == null) return `The site leaves the mapped flood zone by 2050 (today: ${a} ${today.unit}).`;
  if (a != null && b != null) {
    const d = b - a;
    if (d === 0) return `No change: modelled depth stays at ${a} ${today.unit}.`;
    if (d > 0) return `Deeper by ${d} ${today.unit} — from ${a} to ${b} ${future.unit}.`;
    return `Shallower by ${Math.abs(d)} ${today.unit} — from ${a} to ${b} ${future.unit}. Climate models can lower flood depth where rainfall declines.`;
  }
  return '—';
}

function valueText(e: RiskMemoEntry): string {
  if (e.value == null) return '—';
  const range = e.range ? ` (${e.range[0]}–${e.range[1]})` : '';
  return `${e.value}${range} ${e.unit}`.trim();
}

function Swatch({ band }: { band: Band }) {
  return (
    <span
      className="memo-swatch inline-block h-3 w-3 flex-none"
      style={{ backgroundColor: BAND_COLOR[band] }}
    />
  );
}

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="memo-sechead mb-4 flex items-baseline gap-3 border-b border-[#16181d] pb-2">
      <span className="font-mono text-[11px] tracking-[0.18em] text-[#8b9099]">{n}</span>
      <h2 className="font-mono text-[12px] uppercase tracking-[0.16em] text-[#16181d]">{title}</h2>
    </div>
  );
}

export default function MemoView({
  memo,
  narrative,
  shareId,
}: {
  memo: RiskMemo;
  narrative: MemoNarrative;
  shareId: string;
}) {
  const date = new Date(memo.generatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const coords = `${memo.center[1].toFixed(5)}, ${memo.center[0].toFixed(5)}`;
  const mapHref = `/s/${shareId}`;
  const ref = shareId.toUpperCase();

  const today = memo.entries.find((e) => e.key === 'q100') ?? null;
  const rated = memo.entries.filter((e) => e.band !== 'unknown');
  const unassessed = memo.entries.length - rated.length;
  const worst: Band = rated.length
    ? rated.reduce<Band>((top, e) => (BAND_RANK[e.band] > BAND_RANK[top] ? e.band : top), 'low')
    : 'unknown';
  const understated = unassessed > 0 && BAND_RANK[worst] <= BAND_RANK.moderate;
  const overall: Band = rated.length && !understated ? worst : 'unknown';
  const overallLabel = !rated.length
    ? 'NOT ASSESSED'
    : understated
      ? `PARTIAL — ${({ low: 'LOW', moderate: 'MODERATE', high: 'HIGH', severe: 'SEVERE', unknown: '—' } as Record<Band, string>)[worst]} ON ASSESSED LAYERS`
      : ({ low: 'LOW', moderate: 'MODERATE', high: 'HIGH', severe: 'SEVERE', unknown: '—' } as Record<Band, string>)[worst];

  const counts = SUMMARY_ORDER.map((b) => ({
    band: b,
    label: { severe: 'severe', high: 'high', moderate: 'moderate', low: 'low', unknown: 'no data' }[b],
    n: memo.entries.filter((e) => e.band === b).length,
  })).filter((c) => c.n > 0);

  return (
    <div className="memo-canvas min-h-screen bg-white">
      <div className="no-print mx-auto flex max-w-[860px] items-center justify-between px-6 pt-5">
        <a
          href={mapHref}
          className="flex items-center gap-2 font-mono text-mono-badge uppercase tracking-widest text-[#5b616b] hover:text-[#16181d]"
        >
          <ArrowLeft size={13} /> Back to map
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 border border-[#16181d] bg-[#16181d] px-3 py-2 font-mono text-mono-badge uppercase tracking-widest text-white hover:bg-[#3f444b]"
        >
          <Printer size={13} /> Print / PDF
        </button>
      </div>

      <div className="mx-auto max-w-[860px] px-6 py-8">
        <article className="memo-sheet bg-white px-12 py-11 text-[#16181d]">
          <header className="flex items-start justify-between border-b border-[#16181d] pb-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#16181d]">
                Geo-Intelligence
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b9099]">
                Property risk report
              </div>
            </div>
            <div className="text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-[#5b616b]">
              <div>REF · {ref}</div>
              <div>{date}</div>
            </div>
          </header>

          <div className="mt-6">
            <h1 className="font-sans text-[26px] leading-tight text-[#16181d]">{memo.place}</h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] tracking-[0.04em] text-[#5b616b]">
              <span>{coords}</span>
              <span>{memo.zone ? 'area: custom outline' : 'area: scan radius'}</span>
              <span>
                layers assessed: {memo.completeness.available}/{memo.completeness.total}
              </span>
            </div>
          </div>

          <div className="memo-block mt-6 flex items-stretch border border-[#16181d]">
            <div
              className="memo-swatch flex-none"
              style={{ backgroundColor: BAND_COLOR[overall], width: 8 }}
            />
            <div className="min-w-0 flex-1 px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b9099]">
                    Conclusion
                  </div>
                  <div className="mt-1 font-sans text-[20px] leading-tight text-[#16181d]">
                    {rated.length && !understated ? `${overallLabel} RISK` : overallLabel}
                  </div>
                  {narrative.degraded && (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                      Deterministic summary — narrative model unavailable
                    </div>
                  )}
                </div>
                {counts.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {counts.map((c) => (
                      <span
                        key={c.band}
                        className="flex items-center gap-1.5 font-mono text-[11px] text-[#5b616b]"
                      >
                        <Swatch band={c.band} />
                        {c.label} · {c.n}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="mt-3 font-sans text-[14px] leading-relaxed text-[#16181d]">
                {narrative.assessment}
              </p>

              {narrative.drivers.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {narrative.drivers.map((d) => (
                    <li
                      key={d}
                      className="flex gap-2 font-sans text-[13px] leading-snug text-[#3f444b]"
                    >
                      <span className="mt-[7px] h-1 w-1 flex-none bg-[#8b9099]" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}

            </div>
          </div>

          {narrative.mitigation && (
            <div className="memo-block mt-4 border border-[#c8cace] border-l-2 border-l-[#15a34a] px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b9099]">
                  Mitigating evidence · external sources
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-[#5b616b]">
                  <span className="flex items-center gap-1.5">
                    modelled
                    <Swatch band={modelledBand(memo, narrative.mitigation.layer)} />
                    <span className="uppercase">
                      {BAND_TEXT[modelledBand(memo, narrative.mitigation.layer)]}
                    </span>
                  </span>
                  <span>→</span>
                  <span className="flex items-center gap-1.5 text-[#16181d]">
                    assessed
                    <Swatch band={narrative.mitigation.adjustedBand} />
                    <span className="uppercase">{BAND_TEXT[narrative.mitigation.adjustedBand]}</span>
                  </span>
                </div>
              </div>
              <p className="mt-2 font-sans text-[13px] leading-relaxed text-[#3f444b]">
                {narrative.mitigation.rationale}
              </p>
              <ul className="mt-2 space-y-0.5">
                {narrative.mitigation.sources.map((s) => (
                  <li key={s.url} className="font-mono text-[10px] leading-snug text-[#5b616b]">
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-[#16181d]">
                      {s.title}
                    </a>{' '}
                    <span className="break-all">{s.url}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[10px] leading-snug text-[#8b9099]">
                Engine values in the table below are unchanged. This adjustment is evidence-based judgement, not a
                measurement.
              </p>
            </div>
          )}

          <section className="mt-9">
            <SectionHead n="01" title="Risk factor assessment" />
            <table className="w-full border-collapse font-sans text-[13px]">
              <thead>
                <tr className="border-b border-[#c8cace] text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                  <th className="w-6 py-2 font-normal">#</th>
                  <th className="py-2 font-normal">Factor</th>
                  <th className="py-2 text-right font-normal">Value</th>
                  <th className="py-2 pl-4 font-normal">Rating</th>
                  <th className="py-2 pl-4 font-normal">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {memo.entries.map((e, i) => (
                  <tr key={e.key} className="border-b border-[#ececee] align-top">
                    <td className="py-3 font-mono text-[11px] text-[#8b9099]">{String(i + 1).padStart(2, '0')}</td>
                    <td className="py-3 pr-3">
                      <div className="text-[#16181d]">{e.label}</div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9aa0a8]">
                        {KIND_TAG[e.kind]}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 text-right font-mono text-[12px] text-[#16181d]">
                      {valueText(e)}
                    </td>
                    <td className="py-3 pl-4">
                      <div className="flex items-center gap-2">
                        <Swatch band={e.band} />
                        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#16181d]">
                          {e.bandLabel}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pl-4 text-[#3f444b]">{e.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {memo.scenario2050 && today && (
            <section className="mt-9">
              <SectionHead n="02" title="Climate scenario · flood depth by 2050 · RCP 8.5" />
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-[1fr_1fr_1.4fr]">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                    Today · 100-year flood
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Swatch band={today.band} />
                    <span className="font-mono text-[14px] text-[#16181d]">
                      {today.degraded ? 'no data' : today.value == null ? 'not in zone' : `${today.value} ${today.unit}`}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                    2050 · RCP 8.5
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Swatch band={memo.scenario2050.band} />
                    <span className="font-mono text-[14px] text-[#16181d]">
                      {memo.scenario2050.degraded
                        ? 'no data'
                        : memo.scenario2050.value == null
                          ? 'not in zone'
                          : `${memo.scenario2050.value} ${memo.scenario2050.unit}`}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                    Change under a pessimistic emissions path
                  </div>
                  <div className="mt-1.5 font-sans text-[13px] leading-snug text-[#16181d]">
                    {scenarioDelta(today, memo.scenario2050)}
                  </div>
                </div>
              </div>
              <p className="mt-3 font-mono text-[10px] leading-snug text-[#8b9099]">
                Modelled flood depth only. A rise does not by itself mean the site floods — engineered defences are not
                part of this model.
              </p>
            </section>
          )}

          {memo.neighbours.length > 0 && (
            <section className="mt-9">
              <SectionHead n={memo.scenario2050 ? '03' : '02'} title="Neighbourhood within the scan radius" />
              <table className="w-full border-collapse font-sans text-[13px]">
                <thead>
                  <tr className="border-b border-[#c8cace] text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                    <th className="py-2 font-normal">Category</th>
                    <th className="w-16 py-2 text-right font-normal">Count</th>
                    <th className="w-24 py-2 pl-4 text-right font-normal">Nearest</th>
                    <th className="py-2 pl-4 font-normal">Closest object</th>
                    <th className="py-2 pl-4 font-normal">Why it matters</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.neighbours.map((nb) => (
                    <tr key={nb.category} className="border-b border-[#ececee] align-top">
                      <td className="py-2.5 pr-3 text-[#16181d]">{nb.label}</td>
                      <td className="py-2.5 text-right font-mono text-[12px] text-[#16181d]">{nb.count}</td>
                      <td className="whitespace-nowrap py-2.5 pl-4 text-right font-mono text-[12px] text-[#16181d]">
                        {nb.nearest} m
                      </td>
                      <td className="py-2.5 pl-4 text-[#3f444b]">
                        {nb.nearestName ? `${nb.nearestName} (${nb.nearestKind})` : nb.nearestKind}
                      </td>
                      <td className="py-2.5 pl-4 text-[#3f444b]">{NEIGHBOUR_MEANING[nb.category]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {memo.licensingFlags.length > 0 && (
            <section className="mt-9 border-l-2 border-[#dc2626] pl-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#dc2626]">
                Licensing restrictions
              </div>
              <ul className="mt-1 font-sans text-[13px] text-[#3f444b]">
                {memo.licensingFlags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-9">
            <SectionHead
              n={`0${memo.scenario2050 ? (memo.neighbours.length ? 4 : 3) : memo.neighbours.length ? 3 : 2}`}
              title="Data sources"
            />
            <table className="w-full border-collapse font-sans text-[12px]">
              <thead>
                <tr className="border-b border-[#c8cace] text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                  <th className="py-2 font-normal">Layer</th>
                  <th className="py-2 pl-4 font-normal">Dataset</th>
                  <th className="py-2 pl-4 font-normal">Type</th>
                  <th className="py-2 pl-4 font-normal">Licence</th>
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.flatMap((kind) =>
                  memo.provenance[kind].map((it) => (
                    <tr key={it.source} className="border-b border-[#ececee] align-top">
                      <td className="py-2.5 pr-3 text-[#16181d]">{it.label}</td>
                      <td className="py-2.5 pl-4 text-[#3f444b]">{it.source}</td>
                      <td className="whitespace-nowrap py-2.5 pl-4 font-mono text-[10px] uppercase tracking-[0.08em] text-[#5b616b]">
                        {KIND_TITLE[kind]}
                      </td>
                      <td className="py-2.5 pl-4 font-mono text-[10px] text-[#5b616b]">{it.license}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </section>

          <footer className="mt-10 border-t border-[#16181d] pt-4">
            <div className="flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#5b616b]">
              <span>Geo-Intelligence · REF {ref}</span>
              <span>{coords}</span>
              <span>snapshot {date}</span>
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}
