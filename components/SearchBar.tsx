'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface SearchPoint {
  lat: number;
  lon: number;
  label: string;
}

interface Suggestion {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
}

export default function SearchBar({ onSelect }: { onSelect: (point: SearchPoint) => void }) {
  const [value, setValue] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const skipNextFetch = useRef(false);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/suggest?q=' + encodeURIComponent(q));
        if (!res.ok) return;
        const list: Suggestion[] = await res.json();
        setItems(list);
        setOpen(list.length > 0);
      } catch {
        return;
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  async function pick(s: Suggestion) {
    setOpen(false);
    skipNextFetch.current = true;
    setValue(s.label);
    if (s.lat != null && s.lon != null) {
      onSelect({ lat: s.lat, lon: s.lon, label: s.label });
      return;
    }
    const res = await fetch('/api/place?id=' + encodeURIComponent(s.id));
    if (!res.ok) return;
    const p: SearchPoint = await res.json();
    onSelect({ lat: p.lat, lon: p.lon, label: p.label || s.label });
  }

  async function geocodeFallback() {
    const q = value.trim();
    if (!q) return;
    const res = await fetch('/api/geocode?q=' + encodeURIComponent(q));
    if (!res.ok) return;
    const loc = await res.json();
    onSelect({ lat: loc.lat, lon: loc.lon, label: loc.displayName });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && items.length) pick(items[0]);
      else geocodeFallback();
    }
    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative flex-1">
      <Input
        id="search"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Поиск адреса или места…"
        autoComplete="off"
        onKeyDown={handleKeyDown}
        onFocus={() => items.length && setOpen(true)}
        className="h-10 rounded-full py-0"
      />
      {open && (
        <div className="absolute left-2 right-2 top-11 z-30 overflow-hidden border border-graphite bg-void-black">
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className="block w-full truncate px-4 py-2.5 text-left font-sans text-body text-ash hover:bg-charcoal hover:text-stellar-white"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
