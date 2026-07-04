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
