'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from './ui/button';

const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
];

export default function GenerateReportButton({ shareId }: { shareId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="nav"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Generate report
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-48 border border-graphite bg-void-black">
          <div className="border-b border-graphite px-4 py-2.5 font-mono text-mono-badge uppercase tracking-widest text-smoke">
            Report language
          </div>
          {LANGS.map((l) => (
            <Link
              key={l.code}
              href={`/s/${shareId}/memo?lang=${l.code}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:bg-charcoal hover:text-stellar-white"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
