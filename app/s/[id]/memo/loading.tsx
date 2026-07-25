'use client';

import { useEffect, useState } from 'react';

const STAGES = [
  'Reading your computed risk layers',
  'Ranking hazards by materiality',
  'Composing the written assessment',
  'Verifying every figure against the data',
  'Laying out the report',
];

export default function MemoLoading() {
  const [progress, setProgress] = useState(6);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const bar = setInterval(() => {
      setProgress((p) => (p >= 92 ? p : p + (92 - p) * 0.045));
    }, 180);
    const steps = setInterval(() => {
      setStage((s) => (s >= STAGES.length - 1 ? s : s + 1));
    }, 2600);
    return () => {
      clearInterval(bar);
      clearInterval(steps);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-void-black px-6">
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-graphite border-t-stellar-white" />

        <h1 className="mt-8 font-sans text-body-lg leading-tight text-stellar-white">
          Generating your risk memo
        </h1>
        <p className="mt-3 text-center font-mono text-mono-badge leading-relaxed text-ash">
          Reading the computed hazard layers and writing an auditable,
          print-ready property risk report. This usually takes under a minute.
        </p>

        <div className="mt-9 w-full">
          <div className="h-px w-full overflow-hidden bg-graphite">
            <div
              className="h-full bg-stellar-white transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between font-mono text-mono-badge uppercase tracking-widest text-smoke">
            <span className="text-ash">{STAGES[stage]}…</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        <div className="mt-10 w-full border-t border-graphite pt-5">
          <div className="font-mono text-mono-badge uppercase tracking-widest text-smoke">
            You&apos;ll get
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 font-mono text-mono-badge leading-relaxed text-ash">
            <li>· Per-hazard risk bands with their drivers</li>
            <li>· A plain-language assessment and summary</li>
            <li>· Every figure traced to its source dataset</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
