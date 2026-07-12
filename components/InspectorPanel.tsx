'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ScanPayload } from '@/lib/types';
import { MASK_META, displayNote, type MaskKey, rampCss } from '@/lib/constants';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface InspectorProps {
  payload: ScanPayload;
  activeMask: MaskKey | null;
  onSelectMask: (mask: MaskKey) => void;
  scenario2050: boolean;
  onToggleScenario: () => void;
}

const MASK_ORDER = (Object.keys(MASK_META) as MaskKey[]).filter((k) => !MASK_META[k].hidden);

export default function InspectorPanel({
  payload,
  activeMask,
  onSelectMask,
  scenario2050,
  onToggleScenario,
}: InspectorProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex h-full w-10 flex-none flex-col items-center gap-2 border border-graphite bg-void-black py-4 text-ash hover:text-stellar-white"
      >
        <ChevronLeft size={14} className="shrink-0" />
        <span className="font-mono text-mono-badge uppercase tracking-widest [writing-mode:vertical-rl]">
          Inspector
        </span>
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[340px] flex-none flex-col overflow-y-auto border border-graphite bg-void-black">
      <div className="flex items-start justify-between border-b border-graphite px-5 py-4">
        <div className="min-w-0">
          <div className="font-mono text-mono-badge uppercase text-ash">[ INSPECTOR ]</div>
          <div className="mt-1 truncate font-sans text-body-lg text-stellar-white">
            {payload.label || `${payload.center[1].toFixed(4)}, ${payload.center[0].toFixed(4)}`}
          </div>
          <div className="mt-0.5 font-mono text-mono-badge text-ash">
            {payload.zone ? 'custom zone' : `zone ±${payload.radius} m`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse inspector"
          className="mt-0.5 shrink-0 text-ash hover:text-stellar-white"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="px-3 py-3">
        {MASK_ORDER.map((key) => {
          const active = activeMask === key;
          const effKey = key === 'q100' && scenario2050 ? 'q100f' : key;
          const meta = MASK_META[key];
          const mask = payload.masks[active ? effKey : key];
          const value =
            mask && mask.avg != null
              ? active && mask.min != null && mask.max != null
                ? `${mask.avg} (${mask.min}–${mask.max}) ${MASK_META[effKey].unit}`
                : `${mask.avg} ${MASK_META[effKey].unit}`
              : '—';
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => onSelectMask(key)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-2 py-2 text-left transition-colors',
                  active ? 'bg-charcoal text-stellar-white' : 'text-ash hover:text-stellar-white',
                )}
              >
                <span className="truncate font-sans text-body">{meta.label}</span>
                <span className="shrink-0 font-mono text-mono-badge">{value}</span>
              </button>
              {active && mask && (
                <div className="px-2 pb-3 pt-2">
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
                        {displayNote(effKey, mask.note)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-0.5 flex justify-between font-mono text-[10px] leading-tight tracking-wider text-ash">
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
                        Scenario 2050 · clim. RCP 8.5
                      </span>
                      <Switch checked={scenario2050} onCheckedChange={onToggleScenario} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="mt-2 px-2 font-mono text-[10px] leading-tight tracking-wider text-ash">
          {activeMask ? 'transparent — all clear · click the layer to turn it off' : 'click a layer to show it on the map'}
        </div>
      </div>
    </aside>
  );
}
