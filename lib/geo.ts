import { fetchData } from './http';
import type { GeocodeResult } from './types';

export interface GeocodeResultFull extends GeocodeResult {
  country: string | null;
  osm: { type: string; id: number };
}

export async function geocode(query: string): Promise<GeocodeResultFull> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=' +
    encodeURIComponent(query);
  const res = await fetchData(url, { headers: { Accept: 'application/json' } });
  if (!Array.isArray(res) || res.length === 0) {
    throw new Error(`Не удалось геокодировать адрес: "${query}"`);
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

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function metresToDegLat(m: number): number {
  return m / 111320;
}

export function metresToDegLon(m: number, lat: number): number {
  return m / (111320 * Math.cos((lat * Math.PI) / 180));
}
