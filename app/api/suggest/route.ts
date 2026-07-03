import { NextResponse } from 'next/server';
import { fetchData } from '@/lib/http';

export const dynamic = 'force-dynamic';

interface Suggestion {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 3) return NextResponse.json([]);

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

  if (key) {
    try {
      const data = await fetchData('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        body: JSON.stringify({ input: q, languageCode: 'ru' }),
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        ttlMs: 24 * 3600 * 1000,
      });
      const list: Suggestion[] = (data?.suggestions || [])
        .map((s: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => ({
          id: s.placePrediction?.placeId || '',
          label: s.placePrediction?.text?.text || '',
        }))
        .filter((s: Suggestion) => s.id && s.label)
        .slice(0, 5);
      if (list.length) return NextResponse.json(list);
    } catch (err) {
      console.warn(`[suggest] Places API недоступен, фолбэк на Nominatim: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const res = await fetchData(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' + encodeURIComponent(q),
      { ttlMs: 24 * 3600 * 1000 },
    );
    const list: Suggestion[] = (Array.isArray(res) ? res : []).map(
      (r: { display_name: string; lat: string; lon: string }, i: number) => ({
        id: `osm-${i}`,
        label: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      }),
    );
    return NextResponse.json(list);
  } catch {
    return NextResponse.json([]);
  }
}
