'use client';

import { Printer, ArrowLeft } from 'lucide-react';
import type { Band } from '@/lib/constants';
import { Locale } from '@/lib/locale';
import {
  MEMO_STRINGS,
  MASK_LABEL_I18N,
  BAND_WORD,
  KIND_TITLE_I18N,
  KIND_TAG_I18N,
  NEIGHBOUR_LABEL_I18N,
  NEIGHBOUR_MEANING_I18N,
  DATE_LOCALE,
  tVerdict,
  tMaskLabelEn,
  tKind,
} from '@/lib/memo-i18n';
import type { MemoNarrative } from '@/lib/narrate';
import type { Brand, RiskMemo, RiskMemoEntry } from '@/lib/types';

const BAND_COLOR: Record<Band, string> = {
  low: '#15a34a',
  moderate: '#d97706',
  high: '#ea580c',
  severe: '#dc2626',
  unknown: '#9aa0a8',
};

const KIND_ORDER: RiskMemoEntry['kind'][] = ['official', 'measured', 'modeled'];
const SUMMARY_ORDER: Band[] = ['severe', 'high', 'moderate', 'low', 'unknown'];

function modelledBand(memo: RiskMemo, key: string): Band {
  return memo.entries.find((e) => e.key === key)?.band ?? 'unknown';
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

function BrandHead({ brand, poweredLine }: { brand: Brand; poweredLine: string }) {
  return (
    <div className="flex items-center gap-3">
      {brand.logo && (
        <img src={brand.logo} alt={brand.name} className="h-11 w-11 flex-none object-contain" />
      )}
      <div>
        <div className="font-sans text-[16px] leading-tight text-[#16181d]">{brand.name}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] tracking-[0.06em] text-[#5b616b]">
          {brand.phone && <span>{brand.phone}</span>}
          {brand.email && <span>{brand.email}</span>}
          {brand.website && <span>{brand.website}</span>}
        </div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#9aa0a8]">
          {poweredLine}
        </div>
      </div>
    </div>
  );
}

export default function MemoView({
  memo,
  narrative,
  shareId,
  brand,
  schematic,
  locale,
}: {
  memo: RiskMemo;
  narrative: MemoNarrative;
  shareId: string;
  brand: Brand | null;
  schematic?: string;
  locale: Locale;
}) {
  const t = MEMO_STRINGS[locale];
  const date = new Date(memo.generatedAt).toLocaleDateString(DATE_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const coords = `${memo.center[1].toFixed(5)}, ${memo.center[0].toFixed(5)}`;
  const mapHref = `/s/${shareId}`;
  const ref = shareId.toUpperCase();

  const overall = memo.overall;

  const counts = SUMMARY_ORDER.map((b) => ({
    band: b,
    label: BAND_WORD[locale][b],
    n: memo.entries.filter((e) => e.band === b).length,
  })).filter((c) => c.n > 0);

  return (
    <div className="memo-canvas min-h-screen bg-white">
      <div className="no-print mx-auto flex max-w-[860px] items-center justify-between px-6 pt-5">
        <a
          href={mapHref}
          className="flex items-center gap-2 font-mono text-mono-badge uppercase tracking-widest text-[#5b616b] hover:text-[#16181d]"
        >
          <ArrowLeft size={13} /> {t.backToMap}
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 border border-[#16181d] bg-[#16181d] px-3 py-2 font-mono text-mono-badge uppercase tracking-widest text-white hover:bg-[#3f444b]"
        >
          <Printer size={13} /> {t.print}
        </button>
      </div>

      <div className="mx-auto max-w-[860px] px-6 py-8">
        <article className="memo-sheet bg-white px-12 py-11 text-[#16181d]">
          <header className="flex items-start justify-between border-b border-[#16181d] pb-4">
            {brand ? (
              <BrandHead brand={brand} poweredLine={`${t.poweredBy} · ${t.reportTitle}`} />
            ) : (
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#16181d]">
                  Geo-Intelligence
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b9099]">
                  {t.reportTitle}
                </div>
              </div>
            )}
            <div className="text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-[#5b616b]">
              <div>REF · {ref}</div>
              <div>{date}</div>
            </div>
          </header>

          <div className="mt-6">
            <h1 className="font-sans text-[26px] leading-tight text-[#16181d]">{memo.place}</h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] tracking-[0.04em] text-[#5b616b]">
              <span>{coords}</span>
              <span>{memo.zone ? t.areaCustom : t.areaRadius}</span>
              <span>
                {t.layersAssessed}: {memo.completeness.available}/{memo.completeness.total}
              </span>
            </div>
          </div>

          {schematic && (
            <figure className="memo-block mt-6 overflow-hidden border border-[#c8cace]">
              <div
                className="[&>svg]:block [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: schematic }}
              />
              <figcaption className="border-t border-[#e6e7ea] bg-[#f4f5f7] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b9099]">
                {memo.zone ? t.schematicCustom : t.schematicRadius}
              </figcaption>
            </figure>
          )}

          <div className="memo-block mt-6 flex items-stretch border border-[#16181d]">
            <div
              className="memo-swatch flex-none"
              style={{ backgroundColor: BAND_COLOR[overall], width: 8 }}
            />
            <div className="min-w-0 flex-1 px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b9099]">
                  {t.conclusion}
                </div>
                {counts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#9aa0a8]">
                      {t.risksChecked.replace('{n}', String(memo.completeness.total))}
                    </span>
                    {counts.map((c) => (
                      <span
                        key={c.band}
                        className="flex items-center gap-1.5 font-mono text-[11px] text-[#5b616b]"
                      >
                        <Swatch band={c.band} />
                        {c.n} {c.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="mt-2 font-sans text-[19px] leading-snug text-[#16181d]">
                {narrative.verdict}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <span
                  className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                  style={{ borderColor: BAND_COLOR[overall], color: BAND_COLOR[overall] }}
                >
                  <Swatch band={overall} /> {BAND_WORD[locale][overall]} {t.overallSuffix}
                </span>
                {narrative.degraded && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                    {t.plainSummary}
                  </span>
                )}
              </div>

              <p className="mt-3 font-sans text-[14px] leading-relaxed text-[#3f444b]">
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

              {narrative.implication && (
                <div className="mt-3 border-t border-[#ececee] pt-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b9099]">
                    {t.forLending}
                  </div>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-[#3f444b]">
                    {narrative.implication}
                  </p>
                </div>
              )}

            </div>
          </div>

          {narrative.mitigation && (
            <div className="memo-block mt-4 border border-[#c8cace] border-l-2 border-l-[#15a34a] px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b9099]">
                  {t.mitigationTitle}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-[#5b616b]">
                  <span className="flex items-center gap-1.5">
                    {t.modelled}
                    <Swatch band={modelledBand(memo, narrative.mitigation.layer)} />
                    <span className="uppercase">
                      {BAND_WORD[locale][modelledBand(memo, narrative.mitigation.layer)]}
                    </span>
                  </span>
                  <span>→</span>
                  <span className="flex items-center gap-1.5 text-[#16181d]">
                    {t.assessed}
                    <Swatch band={narrative.mitigation.adjustedBand} />
                    <span className="uppercase">{BAND_WORD[locale][narrative.mitigation.adjustedBand]}</span>
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
                {t.mitigationNote}
              </p>
            </div>
          )}

          <section className="mt-9">
            <SectionHead n="01" title={t.secRisk} />
            <table className="w-full border-collapse font-sans text-[13px]">
              <thead>
                <tr className="border-b border-[#c8cace] text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                  <th className="w-6 py-2 font-normal">{t.thNum}</th>
                  <th className="py-2 font-normal">{t.thFactor}</th>
                  <th className="py-2 text-right font-normal">{t.thValue}</th>
                  <th className="py-2 pl-4 font-normal">{t.thRating}</th>
                  <th className="py-2 pl-4 font-normal">{t.thVerdict}</th>
                </tr>
              </thead>
              <tbody>
                {memo.entries.map((e, i) => (
                  <tr key={e.key} className="border-b border-[#ececee] align-top">
                    <td className="py-3 font-mono text-[11px] text-[#8b9099]">{String(i + 1).padStart(2, '0')}</td>
                    <td className="py-3 pr-3">
                      <div className="text-[#16181d]">{MASK_LABEL_I18N[locale][e.key]}</div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9aa0a8]">
                        {KIND_TAG_I18N[locale][e.kind]}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 text-right font-mono text-[12px] text-[#16181d]">
                      {valueText(e)}
                    </td>
                    <td className="py-3 pl-4">
                      <div className="flex items-center gap-2">
                        <Swatch band={e.band} />
                        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#16181d]">
                          {BAND_WORD[locale][e.band]}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pl-4 text-[#3f444b]">{tVerdict(locale, e.verdict)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {memo.neighbours.length > 0 && (
            <section className="mt-9">
              <SectionHead n="02" title={t.secNeighbourhood} />
              <table className="w-full border-collapse font-sans text-[13px]">
                <thead>
                  <tr className="border-b border-[#c8cace] text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                    <th className="py-2 font-normal">{t.thCategory}</th>
                    <th className="w-16 py-2 text-right font-normal">{t.thCount}</th>
                    <th className="w-24 py-2 pl-4 text-right font-normal">{t.thNearest}</th>
                    <th className="py-2 pl-4 font-normal">{t.thClosest}</th>
                    <th className="py-2 pl-4 font-normal">{t.thWhy}</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.neighbours.map((nb) => (
                    <tr key={nb.category} className="border-b border-[#ececee] align-top">
                      <td className="py-2.5 pr-3 text-[#16181d]">{NEIGHBOUR_LABEL_I18N[locale][nb.category]}</td>
                      <td className="py-2.5 text-right font-mono text-[12px] text-[#16181d]">{nb.count}</td>
                      <td className="whitespace-nowrap py-2.5 pl-4 text-right font-mono text-[12px] text-[#16181d]">
                        {nb.nearest} m
                      </td>
                      <td className="py-2.5 pl-4 text-[#3f444b]">
                        {nb.nearestName
                          ? `${nb.nearestName} (${tKind(locale, nb.nearestKind)})`
                          : tKind(locale, nb.nearestKind)}
                      </td>
                      <td className="py-2.5 pl-4 text-[#3f444b]">{NEIGHBOUR_MEANING_I18N[locale][nb.category]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {memo.licensingFlags.length > 0 && (
            <section className="mt-9 border-l-2 border-[#dc2626] pl-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#dc2626]">
                {t.licensing}
              </div>
              <ul className="mt-1 font-sans text-[13px] text-[#3f444b]">
                {memo.licensingFlags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-9">
            <SectionHead n="03" title={t.secSources} />
            <table className="w-full border-collapse font-sans text-[12px]">
              <thead>
                <tr className="border-b border-[#c8cace] text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b9099]">
                  <th className="py-2 font-normal">{t.thLayer}</th>
                  <th className="py-2 pl-4 font-normal">{t.thDataset}</th>
                  <th className="py-2 pl-4 font-normal">{t.thType}</th>
                  <th className="py-2 pl-4 font-normal">{t.thLicence}</th>
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.flatMap((kind) =>
                  memo.provenance[kind].map((it) => (
                    <tr key={it.source} className="border-b border-[#ececee] align-top">
                      <td className="py-2.5 pr-3 text-[#16181d]">{tMaskLabelEn(locale, it.label)}</td>
                      <td className="py-2.5 pl-4 text-[#3f444b]">{it.source}</td>
                      <td className="whitespace-nowrap py-2.5 pl-4 font-mono text-[10px] uppercase tracking-[0.08em] text-[#5b616b]">
                        {KIND_TITLE_I18N[locale][kind]}
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
              <span>
                {brand ? `${brand.name} · ${t.poweredBy} · REF ${ref}` : `Geo-Intelligence · REF ${ref}`}
              </span>
              <span>{coords}</span>
              <span>
                {t.snapshot} {date}
              </span>
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}
