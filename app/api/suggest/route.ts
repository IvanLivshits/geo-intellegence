import { NextResponse } from 'next/server';
import { fetchData } from '@/lib/http';

export const dynamic = 'force-dynamic';

interface Suggestion {
  id: string;
  label: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 3) return NextResponse.json([]);

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return new NextResponse('Google API key is not configured', { status: 500 });

  try {
    const data = await fetchData('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      body: JSON.stringify({ input: q, languageCode: 'en' }),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      ttlMs: 24 * 3600 * 1000,
      retries: 0,
    });
    const list: Suggestion[] = (data?.suggestions || [])
      .map((s: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => ({
        id: s.placePrediction?.placeId || '',
        label: s.placePrediction?.text?.text || '',
      }))
      .filter((s: Suggestion) => s.id && s.label)
      .slice(0, 5);
    return NextResponse.json(list);
  } catch (err) {
    console.warn(
      `[suggest] Places API (New): ${err instanceof Error ? err.message : String(err)} — check that the API is enabled and allowed for the key`,
    );
    return NextResponse.json([]);
  }
}
