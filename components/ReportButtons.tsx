'use client';

import Link from 'next/link';
import { Button } from './ui/button';

const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'es', label: 'ES' },
];

export default function ReportButtons({ shareId }: { shareId: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden font-mono text-mono-badge uppercase tracking-widest text-smoke sm:inline">
        report
      </span>
      {LANGS.map((l) => (
        <Button key={l.code} asChild variant="nav" size="sm">
          <Link href={`/s/${shareId}/memo?lang=${l.code}`}>{l.label}</Link>
        </Button>
      ))}
    </div>
  );
}
