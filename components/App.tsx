'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScanPayload } from '@/lib/types';
import SearchBar, { SearchPoint } from './SearchBar';
import MapView from './MapView';
import { Button } from '@/components/ui/button';

const RADIUS_OPTIONS = [300, 500, 800, 1000];

interface Selection {
  lat: number;
  lon: number;
  label: string;
}

export default function App() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [radius, setRadius] = useState(500);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<ScanPayload | null>(null);
  const [status, setStatus] = useState<React.ReactNode>('');
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!loading) return;
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [loading]);

  function handleSelect(point: SearchPoint) {
    setSelection(point);
    setStatus(
      <>
        Выбрано: <span className="text-stellar-white">{point.label}</span> ·{' '}
        <span className="text-stellar-white">
          {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
        </span>{' '}
        — нажмите «Построить».
      </>,
    );
  }

  function handleRadiusChange(next: number) {
    setRadius(next);
    if (selection) setStatus('Радиус изменён — нажмите «Построить», чтобы пересчитать.');
  }

  async function build() {
    if (!selection) {
      setStatus('Сначала выберите место.');
      return;
    }
    setLoading(true);
    setPayload(null);
    setStatus(
      <>
        <span className="text-stellar-white">
          {selection.lat.toFixed(5)}, {selection.lon.toFixed(5)}
        </span>{' '}
        · радиус <span className="text-stellar-white">{radius}</span> м ·{' '}
        <span className="text-stellar-white">{selection.label}</span>
      </>,
    );
    try {
      const url =
        '/api/scan?lat=' +
        selection.lat +
        '&lon=' +
        selection.lon +
        '&radius=' +
        radius +
        '&label=' +
        encodeURIComponent(selection.label);
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data: ScanPayload = await res.json();
      setPayload(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(<>Не удалось построить карту: {message}</>);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void-black">
      <header className="flex h-16 flex-none items-center gap-4 border-b border-graphite px-5">
        <div className="flex-none font-mono text-mono-badge uppercase tracking-widest text-stellar-white">
          [ GEO-INTELLIGENCE ]
        </div>
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <SearchBar onSelect={handleSelect} />
          <select
            aria-label="Радиус, м"
            className="h-10 flex-none appearance-none rounded-full border border-graphite bg-void-black px-4 font-mono text-mono-label font-normal text-stellar-white focus:border-signal-blue focus:outline-none"
            value={radius}
            onChange={(event) => handleRadiusChange(parseInt(event.target.value, 10))}
          >
            {RADIUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} м
              </option>
            ))}
          </select>
          <Button variant="nav" onClick={build} className="flex-none">
            Построить ↗
          </Button>
        </div>
      </header>

      {status && (
        <div className="flex-none border-b border-graphite px-5 py-2 font-mono text-mono-badge font-normal text-ash">
          {status}
        </div>
      )}

      <div className="relative flex min-h-0 w-full flex-1">
        {payload && !loading && <MapView payload={payload} />}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-void-black px-6 text-center text-ash">
            <div className="h-9 w-9 animate-spin rounded-full border border-graphite border-t-stellar-white" />
            <div className="font-sans text-body font-normal text-ash">
              Считаю карту для: <span className="text-stellar-white">{selection?.label}</span> …
            </div>
            <div className="font-mono text-mono-badge font-normal text-ash">
              Идёт полный анализ · {elapsed.toFixed(1)}
            </div>
          </div>
        )}
        {!payload && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-void-black px-6 text-center">
            <div className="font-mono text-mono-badge uppercase tracking-widest text-ash">
              [ 3D-СКАНЕР РИСКОВ РАЙОНА ]
            </div>
            <div className="max-w-[48ch] font-sans text-heading font-normal leading-tight text-stellar-white">
              Найдите адрес — и получите 3D-разбор района по слоям
            </div>
            <div className="max-w-[54ch] font-sans text-body font-normal text-ash">
              Шум, качество воздуха и затопляемость — картами-масками; здания, дороги и источники
              активности рядом. По открытым данным (OSM, CAMS, рельеф). Начните с поиска в строке
              сверху.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
