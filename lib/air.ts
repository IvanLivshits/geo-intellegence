import { fetchData } from '@/lib/http';
import { makeField, type FieldSpec, type MaskField } from '@/lib/mask-field';
import { AIR_RAMP } from '@/lib/constants';
import type { MaskContext } from '@/lib/masks';

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

export async function computeAirMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon } = ctx;
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone&timezone=auto`;

  const data = (await fetchData(url, { json: true, ttlMs: 3600 * 1000 })) as OpenMeteoResponse;
  const current = data?.current ?? null;
  const aqi = current?.european_aqi;

  const n = 2;
  const spec: Omit<FieldSpec, 'note'> = {
    ramp: AIR_RAMP,
    lo: 0,
    hi: 100,
    alphaMin: 40,
    alphaMax: 190,
    unit: 'EAQI',
    label: 'Воздух · European AQI',
  };

  if (current == null || aqi == null || Number.isNaN(aqi)) {
    return makeField(new Array(n * n).fill(null), n, {
      ...spec,
      note: 'Данные Open-Meteo Air Quality (CAMS) недоступны — значение не показано.',
    });
  }

  const pm25 = roundOr(current.pm2_5, '—');
  const no2 = roundOr(current.nitrogen_dioxide, '—');

  return makeField(new Array(n * n).fill(aqi), n, {
    ...spec,
    note: `Ambient по CAMS (~11 км) — на масштабе района ~однороден. PM2.5 ${pm25} мкг/м³ · NO₂ ${no2} мкг/м³.`,
  });
}
