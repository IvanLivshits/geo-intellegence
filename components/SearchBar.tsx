'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Input } from '@/components/ui/input';

declare global {
  interface Window {
    google?: any;
  }
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export interface SearchPoint {
  lat: number;
  lon: number;
  label: string;
}

export default function SearchBar({ onSelect }: { onSelect: (point: SearchPoint) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const hasKey = Boolean(KEY);

  useEffect(() => {
    if (!hasKey || autocompleteRef.current) return;

    const tryInit = (): boolean => {
      if (autocompleteRef.current) return true;
      const places = window.google?.maps?.places;
      if (!places || !inputRef.current) return false;
      const ac = new places.Autocomplete(inputRef.current, {
        fields: ['geometry', 'name', 'formatted_address'],
      });
      autocompleteRef.current = ac;
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry || !place.geometry.location) return;
        onSelect({
          lat: place.geometry.location.lat(),
          lon: place.geometry.location.lng(),
          label: place.name || place.formatted_address || '',
        });
      });
      return true;
    };

    if (tryInit()) return;
    const id = setInterval(() => {
      if (tryInit()) clearInterval(id);
    }, 300);
    return () => clearInterval(id);
  }, [hasKey, ready, onSelect]);

  async function geocodeQuery() {
    const query = inputRef.current?.value.trim();
    if (!query) return;
    const res = await fetch('/api/geocode?q=' + encodeURIComponent(query));
    if (!res.ok) return;
    const loc = await res.json();
    onSelect({ lat: loc.lat, lon: loc.lon, label: loc.displayName });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      geocodeQuery();
    }
  }

  return (
    <div className="relative flex-1">
      {hasKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setReady(true)}
        />
      )}
      <Input
        id="search"
        ref={inputRef}
        type="text"
        placeholder="Поиск адреса или места…"
        autoComplete="off"
        onKeyDown={handleKeyDown}
        className="h-10 rounded-full py-0"
      />
    </div>
  );
}
