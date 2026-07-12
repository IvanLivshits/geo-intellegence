import { NextResponse } from 'next/server';
import { fetchData } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();
  if (!id) return new NextResponse('The id parameter is required', { status: 400 });

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return new NextResponse('Google API key is not configured', { status: 500 });

  try {
    const data = await fetchData(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`,
      {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'location,formattedAddress,displayName',
        },
        ttlMs: 30 * 24 * 3600 * 1000,
      },
    );
    const lat = data?.location?.latitude;
    const lon = data?.location?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return new NextResponse('The place has no coordinates', { status: 404 });
    }
    return NextResponse.json({
      lat,
      lon,
      label: data?.displayName?.text || data?.formattedAddress || '',
    });
  } catch (err) {
    return new NextResponse(`Error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}
