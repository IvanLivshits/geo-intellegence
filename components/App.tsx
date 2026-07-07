'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScanPayload, ShareInput, ShareUiState } from '@/lib/types';
import { RADIUS, RADIUS_MAX, RADIUS_MIN, ZONE_HALF_MAX } from '@/lib/constants';
import { localMetres } from '@/lib/geo-math';
import { edgeCrossesPath, pathSelfIntersects, ringSelfIntersects } from '@/lib/polygon';
import SearchBar, { SearchPoint } from './SearchBar';
import MapView from './MapView';
import PickerMap, { type PickerPoint } from './PickerMap';
import UserMenu, { type SessionUser } from './UserMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PickMode = 'point' | 'zone';

const round6 = (v: number) => Number(v.toFixed(6));

export default function App({ user }: { user: SessionUser | null }) {
  const [mode, setMode] = useState<PickMode>('point');
  const [point, setPoint] = useState<PickerPoint | null>(null);
  const [pointLabel, setPointLabel] = useState<string | null>(null);
  const [zoneSize, setZoneSize] = useState(RADIUS);
  const [verts, setVerts] = useState<[number, number][]>([]);
  const [closed, setClosed] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<ScanPayload | null>(null);
  const [scanInput, setScanInput] = useState<ShareInput | null>(null);
  const [scanTitle, setScanTitle] = useState('');
  const [status, setStatus] = useState<React.ReactNode>('');
  const [toast, setToast] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiRef = useRef<ShareUiState>({});

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [loading]);

  const startScan = useCallback(
    async (url: string, title: string, input: ShareInput) => {
      setScanInput(input);
      setScanTitle(title);
      setSaveState('idle');
      setLoading(true);
      setPayload(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const data: ScanPayload = await res.json();
        setPayload(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(message.startsWith('Ошибка') ? message : `Не удалось построить карту: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  function handleSelect(sp: SearchPoint) {
    setFocus({ lat: sp.lat, lon: sp.lon });
    if (payload) setPayload(null);
    if (mode === 'point') {
      setPoint({ lat: sp.lat, lon: sp.lon });
      setPointLabel(sp.label);
      setStatus(
        <>
          Выбрано: <span className="text-stellar-white">{sp.label}</span> — уточните точку кликом
          или нажмите «Построить».
        </>,
      );
    } else {
      setStatus(<>Карта наведена на «{sp.label}» — обведите свою зону кликами.</>);
    }
  }

  function handlePickPoint(lat: number, lon: number) {
    setPoint({ lat, lon });
    setPointLabel(null);
    setStatus(
      <>
        Точка:{' '}
        <span className="text-stellar-white">
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </span>{' '}
        · зона ±{zoneSize} м — нажмите «Построить».
      </>,
    );
  }

  function handleAddVert(lat: number, lon: number) {
    if (verts.length >= 2 && edgeCrossesPath(verts[verts.length - 1], [lat, lon], verts)) {
      showToast('Линии зоны не должны пересекаться — поставьте точку в другом месте.');
      return;
    }
    setVerts((prev) => [...prev, [lat, lon]]);
  }

  function handleMovePoint(lat: number, lon: number) {
    setPoint({ lat, lon });
    setPointLabel(null);
    setStatus(
      <>
        Точка:{' '}
        <span className="text-stellar-white">
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </span>{' '}
        · зона ±{zoneSize} м — нажмите «Построить».
      </>,
    );
  }

  function handleMoveVert(index: number, lat: number, lon: number) {
    setVerts((prev) => {
      const next = prev.map((v, i): [number, number] => (i === index ? [lat, lon] : v));
      const broken = closed ? ringSelfIntersects(next) : pathSelfIntersects(next);
      return broken ? prev : next;
    });
  }

  function handleCloseZone() {
    if (ringSelfIntersects(verts)) {
      showToast('Контур пересекает сам себя — уберите пересечение («Сбросить») и обведите заново.');
      return;
    }
    setClosed(true);
    setStatus('Зона замкнута — нажмите «Построить».');
  }

  function resetZone() {
    setVerts([]);
    setClosed(false);
  }

  function switchMode(next: PickMode) {
    setMode(next);
    setPayload(null);
  }

  const zoneDims = useMemo(() => {
    if (verts.length < 2) return null;
    const lats = verts.map((v) => v[0]);
    const lons = verts.map((v) => v[1]);
    const latC = (Math.min(...lats) + Math.max(...lats)) / 2;
    const lonC = (Math.min(...lons) + Math.max(...lons)) / 2;
    const [halfW, halfH] = localMetres(latC, lonC, Math.max(...lats), Math.max(...lons));
    const maxSideM = Math.max(halfW, halfH) * 2;
    let areaM2 = 0;
    if (verts.length >= 3) {
      const pts = verts.map(([la, lo]) => localMetres(latC, lonC, la, lo));
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        areaM2 += x1 * y2 - x2 * y1;
      }
      areaM2 = Math.abs(areaM2) / 2;
    }
    return { w: Math.round(halfW * 2), h: Math.round(halfH * 2), maxSideM, areaM2 };
  }, [verts]);

  const zoneTooBig = zoneDims != null && zoneDims.maxSideM > ZONE_HALF_MAX * 2 - 1;

  const canBuild = mode === 'point' ? point != null : verts.length >= 3 && !zoneTooBig;

  function build() {
    if (!canBuild) {
      setStatus(
        mode === 'point' ? 'Сначала выберите точку на карте.' : 'Обведите зону: нужно минимум 3 точки.',
      );
      return;
    }
    if (mode === 'zone' && ringSelfIntersects(verts)) {
      showToast('Контур зоны пересекает сам себя — нажмите «Сбросить» и обведите заново.');
      return;
    }
    let url: string;
    let title: string;
    let input: ShareInput;
    if (mode === 'point' && point) {
      const lat = round6(point.lat);
      const lon = round6(point.lon);
      title = pointLabel || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      input = { lat, lon, radius: zoneSize, label: title };
      url =
        '/api/scan?lat=' +
        lat +
        '&lon=' +
        lon +
        '&radius=' +
        zoneSize +
        '&label=' +
        encodeURIComponent(title);
      setStatus(
        <>
          <span className="text-stellar-white">{title}</span> · зона ±
          <span className="text-stellar-white">{zoneSize}</span> м
        </>,
      );
    } else {
      title = pointLabel ? `Зона · ${pointLabel}` : 'Своя зона';
      const verts6 = verts.map(([la, lo]): [number, number] => [round6(la), round6(lo)]);
      input = { polygon: verts6, label: title };
      const poly = verts6.map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join(';');
      url = '/api/scan?polygon=' + encodeURIComponent(poly) + '&label=' + encodeURIComponent(title);
      setStatus(
        <>
          <span className="text-stellar-white">{title}</span> ·{' '}
          <span className="text-stellar-white">{verts.length}</span> точек
        </>,
      );
    }
    startScan(url, title, input);
  }

  const handleUiChange = useCallback((ui: ShareUiState) => {
    uiRef.current = ui;
  }, []);
  const handleBack = useCallback(() => setPayload(null), []);

  async function handleSave() {
    if (!scanInput || saveState !== 'idle') return;
    setSaveState('busy');
    try {
      const res = await fetch('/api/me/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: scanInput }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      setSaveState('done');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      setSaveState('idle');
    }
  }

  async function handleShare() {
    if (!scanInput || shareState === 'busy') return;
    setShareState('busy');

    const urlPromise = (async () => {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: scanInput, ui: uiRef.current }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const { url } = await res.json();
      return window.location.origin + url;
    })();

    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          'text/plain': urlPromise.then((u) => new Blob([u], { type: 'text/plain' })),
        });
        await navigator.clipboard.write([item]).catch(async () => {
          await navigator.clipboard.writeText(await urlPromise);
        });
        await urlPromise;
      } else {
        await navigator.clipboard.writeText(await urlPromise);
      }
      setShareState('done');
      setTimeout(() => setShareState('idle'), 2500);
    } catch (err) {
      const created = await urlPromise.then(
        (u) => u,
        () => null,
      );
      const message = err instanceof Error ? err.message : String(err);
      showToast(
        created
          ? `Ссылка создана, но буфер обмена недоступен — скопируйте вручную: ${created}`
          : message.replace(/^Ошибка:\s*/, ''),
      );
      setShareState('idle');
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void-black">
      <header className="flex h-16 flex-none items-center justify-between border-b border-graphite px-5">
        <div className="font-mono text-mono-badge uppercase tracking-widest text-stellar-white">
          [ GEO-INTELLIGENCE ]
        </div>
        <div className="flex items-center gap-4">
          {user && scanInput && (payload || loading) && (
            <Button variant="nav" onClick={handleSave} disabled={saveState !== 'idle'}>
              {saveState === 'busy'
                ? 'Сохраняю…'
                : saveState === 'done'
                  ? 'В кабинете ✓'
                  : 'Сохранить'}
            </Button>
          )}
          {payload && !loading && (
            <Button variant="nav" onClick={handleShare} disabled={shareState === 'busy'}>
              {shareState === 'busy'
                ? 'Создаю…'
                : shareState === 'done'
                  ? 'Ссылка скопирована ✓'
                  : 'Поделиться ↗'}
            </Button>
          )}
          <UserMenu user={user} />
        </div>
      </header>

      <div className="relative flex min-h-0 w-full flex-1">
        {payload && !loading && (
          <MapView payload={payload} onBack={handleBack} onUiChange={handleUiChange} />
        )}
        {!payload && !loading && (
          <>
            <PickerMap
              mode={mode}
              point={point}
              zoneSize={zoneSize}
              verts={verts}
              closed={closed}
              focus={focus}
              onPickPoint={handlePickPoint}
              onAddVert={handleAddVert}
              onCloseZone={handleCloseZone}
              onMovePoint={handleMovePoint}
              onMoveVert={handleMoveVert}
            />
            <div className="absolute left-4 top-4 z-10 w-80 bg-void-black/80 p-3 backdrop-blur-sm">
              <SearchBar onSelect={handleSelect} />
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => switchMode('point')}
                  className={cn(
                    'h-8 flex-1 rounded-full font-mono text-mono-label uppercase tracking-wider transition-colors',
                    mode === 'point'
                      ? 'bg-charcoal text-stellar-white'
                      : 'text-ash hover:text-stellar-white',
                  )}
                >
                  Точка
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('zone')}
                  className={cn(
                    'h-8 flex-1 rounded-full font-mono text-mono-label uppercase tracking-wider transition-colors',
                    mode === 'zone'
                      ? 'bg-charcoal text-stellar-white'
                      : 'text-ash hover:text-stellar-white',
                  )}
                >
                  Своя зона
                </button>
              </div>
              {mode === 'point' ? (
                <div className="px-1 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-mono-badge uppercase tracking-wider text-ash">
                      Зона расчёта
                    </span>
                    <span className="whitespace-nowrap font-mono text-mono-label text-stellar-white">
                      ±{zoneSize} м
                    </span>
                  </div>
                  <input
                    type="range"
                    min={RADIUS_MIN}
                    max={RADIUS_MAX}
                    step={50}
                    value={zoneSize}
                    onChange={(e) => setZoneSize(parseInt(e.target.value, 10))}
                    className="mt-3 w-full accent-signal-blue"
                    aria-label="Размер зоны, м"
                  />
                  <div className="mt-3 font-sans text-body text-ash">
                    Кликните точку на карте или найдите адрес — расчёт пройдёт в квадрате вокруг
                    неё.
                  </div>
                </div>
              ) : (
                <div className="px-1 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-mono-badge uppercase tracking-wider text-ash">
                      Точек: {verts.length}
                    </span>
                    <button
                      type="button"
                      onClick={resetZone}
                      disabled={!verts.length}
                      className="font-mono text-mono-label text-ash enabled:hover:text-stellar-white disabled:opacity-40"
                    >
                      Сбросить ✕
                    </button>
                  </div>
                  {zoneDims && (
                    <div className="mt-2 font-mono text-mono-badge text-ash">
                      <span className={zoneTooBig ? 'text-alert-red' : 'text-stellar-white'}>
                        {zoneDims.w} × {zoneDims.h} м
                      </span>
                      {zoneDims.areaM2 > 0 && (
                        <>
                          {' · '}
                          {zoneDims.areaM2 >= 10000
                            ? `${(zoneDims.areaM2 / 1e6).toFixed(2)} км²`
                            : `${Math.round(zoneDims.areaM2)} м²`}
                        </>
                      )}
                      {zoneTooBig && (
                        <div className="mt-1 text-alert-red">
                          больше лимита {(ZONE_HALF_MAX * 2) / 1000} × {(ZONE_HALF_MAX * 2) / 1000} км —
                          уменьшите зону
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 font-sans text-body text-ash">
                    {closed
                      ? 'Зона замкнута — нажмите «Построить». Точки можно двигать мышью.'
                      : 'Обводите участок кликами по карте (минимум 3 точки). Замкните кликом по первой — белой — точке. Точки можно двигать.'}
                  </div>
                </div>
              )}
              {status && (
                <div className="border-t border-graphite px-1 py-2.5 font-mono text-mono-badge leading-relaxed text-ash">
                  {status}
                </div>
              )}
              <Button variant="nav" onClick={build} disabled={loading || !canBuild} className="mt-1 w-full">
                Построить ↗
              </Button>
            </div>
          </>
        )}
        {toast && (
          <button
            type="button"
            onClick={() => setToast(null)}
            className="absolute bottom-6 left-1/2 z-30 max-w-[80%] -translate-x-1/2 border border-alert-red/70 bg-void-black/95 px-5 py-3 text-left font-mono text-mono-badge leading-relaxed text-stellar-white backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2"
          >
            {toast}
          </button>
        )}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-void-black px-6 text-center text-ash">
            <div className="h-9 w-9 animate-spin rounded-full border border-graphite border-t-stellar-white" />
            <div className="font-sans text-body font-normal text-ash">
              Считаю карту для: <span className="text-stellar-white">{scanTitle}</span> …
            </div>
            <div className="font-mono text-mono-badge font-normal text-ash">
              Идёт полный анализ · {elapsed.toFixed(1)} с
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
