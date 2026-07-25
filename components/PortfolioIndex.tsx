'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import type { DbPortfolio } from '@/lib/portfolio-types';
import { PortfolioList, PortfolioUpload } from '@/components/PortfolioView';
import UserMenu, { type SessionUser } from './UserMenu';

export default function PortfolioIndex({
  portfolios,
  user,
}: {
  portfolios: DbPortfolio[];
  user: SessionUser | null;
}) {
  const router = useRouter();

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
          <div className="font-mono text-mono-badge uppercase tracking-widest text-stellar-white">
            [ PORTFOLIOS ]
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PortfolioUpload onCreated={(id) => router.push(`/portfolio/${id}`)} />
          <UserMenu user={user} />
        </div>
      </header>

      <div className="mx-auto max-w-page px-6 py-8">
        <PortfolioList portfolios={portfolios} />

        <section className="mt-10 border border-graphite p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-mono text-mono-badge uppercase tracking-widest text-ash">
                Expected CSV format
              </h2>
              <p className="mt-2 max-w-2xl font-sans text-body text-ash">
                A header row plus either an{' '}
                <span className="text-stellar-white">address</span> column, or{' '}
                <span className="text-stellar-white">lat</span> and{' '}
                <span className="text-stellar-white">lon</span> columns. Coordinates skip geocoding and scan
                faster. An optional <span className="text-stellar-white">ref</span> column (loan or collateral
                id) is carried through to the export, so results map back to your book.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const sample =
                  'ref,address\n' +
                  'L-001,"Carrer de la Borrasca 5, Valencia"\n' +
                  'L-002,"Nevsky Prospekt 28, Saint Petersburg"\n' +
                  'L-003,"Dam Square, Amsterdam"\n';
                const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'portfolio-template.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex flex-none items-center gap-2 border border-graphite px-3 py-2 font-mono text-mono-badge uppercase tracking-widest text-ash transition-colors hover:border-smoke hover:text-stellar-white"
            >
              <Download size={13} /> Template
            </button>
          </div>

          <pre className="mt-4 overflow-x-auto border border-charcoal bg-charcoal/40 p-4 font-mono text-[12px] leading-relaxed text-ash">
{`ref,address
L-001,"Carrer de la Borrasca 5, Valencia"
L-002,"Nevsky Prospekt 28, Saint Petersburg"

ref,lat,lon
L-001,39.45459,-0.39873`}
          </pre>

          <dl className="mt-4 grid gap-x-8 gap-y-2 font-mono text-[11px] text-ash sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-smoke">address</dt>
              <dd>address · addr · location · property · street · site</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-smoke">lat / lon</dt>
              <dd>lat · latitude · y — lon · lng · long · longitude · x</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-smoke">ref</dt>
              <dd>ref · id · loan_id · collateral_id · reference · account</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-smoke">limits</dt>
              <dd>2000 rows · 2 MB · comma, semicolon or tab</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
