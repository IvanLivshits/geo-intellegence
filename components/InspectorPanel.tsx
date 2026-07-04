'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ScanPayload } from '@/lib/types';
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  MASK_META,
  type MaskKey,
  rampCss,
} from '@/lib/constants';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type BaseLayerKey = 'buildings' | 'roads' | 'power';

export interface InspectorProps {
  payload: ScanPayload;
  maskOn: Record<MaskKey, boolean>;
  onToggleMask: (mask: MaskKey) => void;
  scenario2050: boolean;
  onToggleScenario: () => void;
  layerOn: Record<BaseLayerKey, boolean>;
  onToggleLayer: (key: BaseLayerKey) => void;
  catOn: Record<ActivityCategory, boolean>;
  onToggleCat: (cat: ActivityCategory) => void;
  onToggleActivityAll: () => void;
  topView: boolean;
  onToggleTopView: () => void;
}

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const MASK_ORDER = (Object.keys(MASK_META) as MaskKey[]).filter((k) => !MASK_META[k].hidden);

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-graphite px-5 py-5 first:border-t-0">
      <div className="mb-3 font-mono text-mono-badge uppercase text-ash">[ {label} ]</div>
      {children}
    </section>
  );
}

function Row({
  indicator,
  label,
  meta,
  checked,
  onCheckedChange,
  inset,
}: {
  indicator: React.ReactNode;
  label: string;
  meta?: string;
  checked: boolean;
  onCheckedChange: () => void;
  inset?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between py-2', inset && 'pl-6')}>
      <div className="flex min-w-0 items-center gap-2.5">
        {indicator}
        <span className="truncate font-sans text-body text-stellar-white">{label}</span>
        {meta && <span className="font-mono text-mono-badge text-ash">{meta}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

const chip = 'h-3 w-3 shrink-0 rounded-none border border-graphite';
const dot = 'h-2.5 w-2.5 shrink-0 rounded-full';

function maskSharePct(mask?: { n: number; rgba: number[] }): number | null {
  if (!mask) return null;
  const total = mask.n * mask.n;
  let visible = 0;
  for (let i = 3; i < mask.rgba.length; i += 4) {
    if (mask.rgba[i] > 0) visible++;
  }
  return Math.round((visible / total) * 100);
}

function Fact({ value, unit, label }: { value: string | number | null; unit?: string; label: string }) {
  return (
    <div className="border border-graphite p-3">
      <div className="font-sans text-body-lg leading-tight text-stellar-white">
        {value ?? '—'}
        {unit && value != null ? <span className="ml-1 font-mono text-mono-badge text-ash">{unit}</span> : null}
      </div>
      <div className="mt-1 font-mono text-[10px] leading-tight tracking-wider text-ash">{label}</div>
    </div>
  );
}

export default function InspectorPanel({
  payload,
  maskOn,
  onToggleMask,
  scenario2050,
  onToggleScenario,
  layerOn,
  onToggleLayer,
  catOn,
  onToggleCat,
  onToggleActivityAll,
  topView,
  onToggleTopView,
}: InspectorProps) {
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const a of payload.activity) by[a.category] = (by[a.category] || 0) + 1;
    return by;
  }, [payload.activity]);

  const cats = Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[];
  const activityAll = cats.every((c) => catOn[c]);

  return (
    <aside className="flex h-full w-[320px] flex-none flex-col overflow-y-auto border border-graphite bg-void-black">
      <div className="border-b border-graphite px-5 py-4">
        <div className="font-mono text-mono-badge uppercase text-ash">[ ИНСПЕКТОР ]</div>
        <div className="mt-1 truncate font-sans text-body-lg text-stellar-white">
          {payload.label || `${payload.center[1].toFixed(4)}, ${payload.center[0].toFixed(4)}`}
        </div>
        <div className="mt-0.5 font-mono text-mono-badge text-ash">радиус {payload.radius} м</div>
      </div>

      <Section label="Что показать">
        <div className="flex flex-col">
          {MASK_ORDER.map((key) => {
            const effKey = key === 'q100' && scenario2050 ? 'q100f' : key;
            const meta = MASK_META[key];
            const mask = payload.masks[effKey];
            const on = maskOn[key];
            return (
              <div key={key}>
                <div className="flex items-center justify-between py-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-1.5 w-6 shrink-0 rounded-none"
                      style={{ backgroundImage: rampCss(meta.ramp), opacity: on ? 1 : 0.45 }}
                    />
                    <span className={cn('truncate font-sans text-body', on ? 'text-stellar-white' : 'text-ash')}>
                      {meta.label}
                    </span>
                  </span>
                  <Switch checked={on} onCheckedChange={() => onToggleMask(key)} />
                </div>
                {on && mask && (
                  <div className="mb-2 pl-8">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 flex-1 rounded-none"
                        style={{ backgroundImage: rampCss(meta.ramp) }}
                      />
                      <div className="group relative">
                        <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-smoke font-mono text-[10px] leading-none text-ash">
                          ?
                        </span>
                        <div className="pointer-events-none absolute right-0 top-5 z-20 hidden w-72 border border-graphite bg-void-black p-3 font-mono text-[10px] leading-relaxed text-ash group-hover:block">
                          {mask.note}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[10px] leading-tight tracking-wider text-ash">
                      <span>{meta.lowLabel}</span>
                      <span>{meta.highLabel}</span>
                    </div>
                    {key === 'q100' && (
                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className={cn(
                            'font-mono text-[10px] tracking-wider',
                            scenario2050 ? 'text-stellar-white' : 'text-ash',
                          )}
                        >
                          Сценарий 2050 · клим. RCP 8.5
                        </span>
                        <Switch checked={scenario2050} onCheckedChange={onToggleScenario} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 font-mono text-[10px] leading-tight tracking-wider text-ash">
          прозрачно — всё хорошо
        </div>
      </Section>

      <Section label="Слои">
        <Row
          indicator={<span className={chip} style={{ background: 'rgb(150,162,188)' }} />}
          label="Здания"
          meta={`${payload.buildings.length}`}
          checked={layerOn.buildings}
          onCheckedChange={() => onToggleLayer('buildings')}
        />
        <Row
          indicator={<span className={chip} style={{ background: 'rgb(196,206,230)' }} />}
          label="Дороги · ж/д"
          meta={`${payload.roads.length}`}
          checked={layerOn.roads}
          onCheckedChange={() => onToggleLayer('roads')}
        />
        {payload.powerLines.length > 0 && (
          <Row
            indicator={<span className={chip} style={{ background: 'rgb(248,113,113)' }} />}
            label="ЛЭП"
            meta={`${payload.powerLines.length}`}
            checked={layerOn.power}
            onCheckedChange={() => onToggleLayer('power')}
          />
        )}

        <div className="flex items-center justify-between py-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 items-center gap-1.5 text-left"
          >
            <ChevronRight
              size={13}
              className={cn('shrink-0 text-ash transition-transform', expanded && 'rotate-90')}
            />
            <span className="font-sans text-body text-stellar-white">Активность</span>
            <span className="font-mono text-mono-badge text-ash">{payload.activity.length}</span>
          </button>
          <Switch checked={activityAll} onCheckedChange={onToggleActivityAll} />
        </div>

        {expanded &&
          cats.map((c) => (
            <Row
              key={c}
              inset
              indicator={<span className={dot} style={{ background: rgb(ACTIVITY_CATEGORIES[c].color) }} />}
              label={ACTIVITY_CATEGORIES[c].label}
              meta={counts[c] ? `${counts[c]}` : '0'}
              checked={catOn[c]}
              onCheckedChange={() => onToggleCat(c)}
            />
          ))}
      </Section>

      <Section label="Вид">
        <Row
          indicator={<span className={chip} style={{ background: 'transparent' }} />}
          label="Сверху · 2D"
          checked={topView}
          onCheckedChange={onToggleTopView}
        />
        <div className="mt-1 font-mono text-mono-badge leading-relaxed text-ash">
          {topView
            ? 'ЛКМ — сдвинуть · колесо — зум · вращение выкл. в 2D'
            : 'Колёсико — вращать · ЛКМ — сдвинуть · колесо — зум'}
        </div>
      </Section>

      {MASK_ORDER.some((key) => maskOn[key] && payload.masks[key]) && (
        <Section label="Статистика">
          <dl className="flex flex-col gap-2 font-sans text-body">
            {MASK_ORDER.filter((key) => maskOn[key]).map((key) => {
              const effKey = key === 'q100' && scenario2050 ? 'q100f' : key;
              const mask = payload.masks[effKey];
              if (!mask) return null;
              return (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="truncate text-ash">{MASK_META[effKey].label}</dt>
                  <dd className="shrink-0 text-stellar-white">
                    {mask.avg ?? '—'}
                    {mask.min != null && mask.max != null ? ` (${mask.min}–${mask.max})` : ''} {mask.unit}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Section>
      )}

      <Section label="Факты">
        <div className="grid grid-cols-2 gap-2">
          <Fact value={payload.facts.elevationM} unit="м" label="над уровнем моря" />
          <Fact value={payload.buildings.length} label="зданий рядом" />
          <Fact value={payload.facts.buildingHeightAvgM} unit="м" label="средняя высота зданий" />
          <Fact value={payload.facts.roadsKm} unit="км" label="дорожной сети" />
          <Fact value={maskSharePct(payload.masks.q100)} unit="%" label="площади в зоне паводка" />
          <Fact value={maskSharePct(payload.masks.pluvial)} unit="%" label="застоя при ливне" />
          <Fact value={payload.masks.seismic?.avg ?? null} unit="%g" label="сейсмика · PGA" />
          <Fact value={payload.masks.air?.avg ?? null} unit="EAQI" label="воздух сейчас" />
        </div>
      </Section>
    </aside>
  );
}
