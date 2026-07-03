import { fetchData } from '@/lib/http';
import { fieldFromValues, type MaskField } from '@/lib/mask-field';
import { AIR_RAMP } from '@/lib/constants';

interface AirInput {
  lat: number;
  lon: number;
  radius?: number;
  gridN?: number;
}

interface OpenMeteoCurrent {
  european_aqi?: number | null;
  pm2_5?: number | null;
  pm10?: number | null;
  nitrogen_dioxide?: number | null;
  ozone?: number | null;
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent | null;
}

function roundOr(v: number | null | undefined, fallback: string): string {
  return v == null || Number.isNaN(v) ? fallback : String(Math.round(v));
}

export async function computeAirMask(input: AirInput): Promise<MaskField> {
  const { lat, lon } = input;
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone&timezone=auto`;

  const data = (await fetchData(url, { json: true, ttlMs: 3600 * 1000 })) as OpenMeteoResponse;
  const current = data?.current ?? null;
  const aqi = current?.european_aqi;

  const n = 2;

  if (current == null || aqi == null || Number.isNaN(aqi)) {
    const stats = fieldFromValues(new Array(n * n).fill(null), n, AIR_RAMP, 0, 100, 40, 190);
    return {
      n,
      rgba: stats.rgba,
      avg: stats.avg,
      min: stats.min,
      max: stats.max,
      unit: 'EAQI',
      label: 'Воздух · European AQI',
      note: 'Данные Open-Meteo Air Quality (CAMS) недоступны — значение не показано.',
    };
  }

  const pm25 = roundOr(current.pm2_5, '—');
  const no2 = roundOr(current.nitrogen_dioxide, '—');

  const values = new Array(n * n).fill(aqi);
  const stats = fieldFromValues(values, n, AIR_RAMP, 0, 100, 40, 190);

  return {
    n,
    rgba: stats.rgba,
    avg: stats.avg,
    min: stats.min,
    max: stats.max,
    unit: 'EAQI',
    label: 'Воздух · European AQI',
    note: `Ambient по CAMS (~11 км) — на масштабе района ~однороден. PM2.5 ${pm25} мкг/м³ · NO₂ ${no2} мкг/м³.`,
  };
}
