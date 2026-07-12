'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ScanPayload } from '@/lib/types';
import { ACTIVITY_CATEGORIES, type ActivityCategory } from '@/lib/constants';
import { cn } from '@/lib/utils';

export type BaseLayerKey = 'buildings' | 'roads' | 'power';

export interface LayersPanelProps {
  payload: ScanPayload;
  layerOn: Record<BaseLayerKey, boolean>;
  onToggleLayer: (key: BaseLayerKey) => void;
  catOn: Record<ActivityCategory, boolean>;
  onToggleCat: (cat: ActivityCategory) => void;
  onToggleActivityAll: () => void;
  onBack: () => void;
  backLabel?: string;
}

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

function Chip({
  on,
  label,
  title,
  onClick,
  dotColor,
}: {
  on: boolean;
  label: string;
  title?: string;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full px-3 font-mono text-mono-badge transition-colors',
        on ? 'bg-charcoal text-stellar-white' : 'text-ash hover:text-stellar-white',
      )}
    >
      {dotColor && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: dotColor, opacity: on ? 1 : 0.5 }}
        />
      )}
      {label}
    </button>
  );
}

export default function LayersPanel({
  payload,
  layerOn,
  onToggleLayer,
  catOn,
  onToggleCat,
  onToggleActivityAll,
  onBack,
  backLabel,
}: LayersPanelProps) {
  const [open, setOpen] = useState(true);
  const [catsOpen, setCatsOpen] = useState(false);

  const cats = Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[];
  const anyCat = cats.some((c) => catOn[c]);

  return (
    <div
      data-overlay
      className="absolute left-3 top-3 z-10 max-w-[360px] bg-void-black/80 p-2 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 items-center px-2 font-mono text-mono-badge uppercase tracking-wider text-ash hover:text-stellar-white"
        >
          {backLabel ?? '← Zone picker'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse layers' : 'Expand layers'}
          className="flex h-7 items-center gap-1 px-2 font-mono text-mono-badge uppercase tracking-wider text-ash hover:text-stellar-white"
        >
          Layers
          <ChevronDown size={13} className={cn('transition-transform', !open && '-rotate-90')} />
        </button>
      </div>

      {open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Chip
            on={layerOn.buildings}
            label="Buildings"
            title={`${payload.buildings.length} buildings`}
            onClick={() => onToggleLayer('buildings')}
          />
          <Chip
            on={layerOn.roads}
            label="Roads"
            title={`${payload.roads.length} road and rail segments`}
            onClick={() => onToggleLayer('roads')}
          />
          {payload.powerLines.length > 0 && (
            <Chip
              on={layerOn.power}
              label="Power lines"
              title={`${payload.powerLines.length} lines`}
              onClick={() => onToggleLayer('power')}
            />
          )}
          <Chip
            on={anyCat}
            label="Activity"
            title={`${payload.activity.length} sources`}
            onClick={onToggleActivityAll}
          />
          <button
            type="button"
            onClick={() => setCatsOpen((v) => !v)}
            aria-label="Activity categories"
            className="flex h-7 w-6 items-center justify-center text-ash hover:text-stellar-white"
          >
            <ChevronRight size={13} className={cn('transition-transform', catsOpen && 'rotate-90')} />
          </button>
        </div>
      )}

      {open && catsOpen && (
        <div className="mt-1 flex flex-wrap gap-1">
          {cats.map((c) => (
            <Chip
              key={c}
              on={catOn[c]}
              label={ACTIVITY_CATEGORIES[c].label}
              dotColor={rgb(ACTIVITY_CATEGORIES[c].color)}
              onClick={() => onToggleCat(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
