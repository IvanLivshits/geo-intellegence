import { fetchData } from '@/lib/http';
import { makeField, type FieldSpec, type MaskField } from '@/lib/mask-field';
import { AIR_RAMP } from '@/lib/constants';
import type { MaskContext } from '@/lib/masks';

const ENDPOINT = 'https://airquality.googleapis.com/v1/currentConditions:lookup';

interface AqIndex {
  code: string;
  aqi?: number | null;
  category?: string;
}
interface AqPollutant {
  code: string;
  concentration?: { value: number; units: string } | null;
}
interface AqResponse {
  indexes?: AqIndex[] | null;
  pollutants?: AqPollutant[] | null;
}

function apiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

function conc(pollutants: AqPollutant[] | null | undefined, code: string): string {
  const v = pollutants?.find((p) => p.code === code)?.concentration?.value;
  return v == null || Number.isNaN(v) ? '—' : String(Math.round(v * 10) / 10);
}

export async function computeAirMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon } = ctx;
  const n = 2;
  const spec: Omit<FieldSpec, 'note'> = {
    ramp: AIR_RAMP,
    lo: 100,
    hi: 0,
    alphaMin: 40,
    alphaMax: 190,
    unit: 'UAQI',
    label: 'Air · Universal AQI',
  };

  const degrade = (note: string): MaskField => {
    const field = makeField(new Array(n * n).fill(null), n, { ...spec, note });
    field.degraded = true;
    return field;
  };

  const key = apiKey();
  if (!key) {
    return degrade('Google Air Quality API key not configured — air quality was not assessed.');
  }

  let data: AqResponse | null = null;
  try {
    data = (await fetchData(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: { latitude: lat, longitude: lon },
        extraComputations: ['POLLUTANT_CONCENTRATION'],
        languageCode: 'en',
      }),
      json: true,
      ttlMs: 3600 * 1000,
      cacheKeyUrl: `${ENDPOINT}#${lat.toFixed(3)},${lon.toFixed(3)}`,
    })) as AqResponse;
  } catch (err) {
    return degrade(
      `Google Air Quality API unavailable (${err instanceof Error ? err.message : String(err)}) — air quality not assessed.`,
    );
  }

  const uaqi = data?.indexes?.find((i) => i.code === 'uaqi');
  const aqi = uaqi?.aqi;
  if (aqi == null || Number.isNaN(aqi)) {
    return degrade('No Universal AQI returned for this location — air quality not assessed.');
  }

  const category = uaqi?.category ?? 'Air quality';
  const pm25 = conc(data?.pollutants, 'pm25');
  const no2 = conc(data?.pollutants, 'no2');

  return makeField(new Array(n * n).fill(aqi), n, {
    ...spec,
    note: `${category} · Universal AQI ${aqi}/100 (higher is better). PM2.5 ${pm25} µg/m³ · NO₂ ${no2} ppb. Source: Google Air Quality API.`,
  });
}
