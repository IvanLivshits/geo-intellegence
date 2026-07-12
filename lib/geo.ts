import { fetchData } from './http';
import type { GeocodeResult } from './types';

export interface GeocodeResultFull extends GeocodeResult {
  country: string | null;
  osm: { type: string; id: number };
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&addressdetails=1&lat=${lat}&lon=${lon}`;
  try {
    const res = (await fetchData(url, {
      headers: { Accept: 'application/json' },
      ttlMs: 30 * 24 * 3600 * 1000,
    })) as { address?: Record<string, string> };
    const a = res?.address;
    if (!a) return null;
    const city = a.city || a.town || a.village || a.municipality || a.county || null;
    const region = a.state || a.region || null;
    const country = a.country || null;
    const parts = [city, region, country].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  } catch (err) {
    console.warn(`[geocode] reverse lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function geocode(query: string): Promise<GeocodeResultFull> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=' +
    encodeURIComponent(query);
  const res = await fetchData(url, { headers: { Accept: 'application/json' } });
  if (!Array.isArray(res) || res.length === 0) {
    throw new Error(`Failed to geocode the address: "${query}"`);
  }
  const r = res[0];
  return {
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    displayName: r.display_name,
    country: r.address?.country_code?.toUpperCase() || null,
    osm: { type: r.osm_type, id: r.osm_id },
  };
}
