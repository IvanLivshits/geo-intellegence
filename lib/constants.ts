export const RADIUS = 500;

export const DB_LOW = 45;
export const DB_HIGH = 75;

export type RampStop = [number, [number, number, number]];

export const RAMP: RampStop[] = [
  [0.0, [74, 222, 128]],
  [0.45, [250, 204, 21]],
  [0.78, [249, 115, 22]],
  [1.0, [239, 68, 68]],
];

export function rampColourOf(ramp: RampStop[], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  let a = ramp[0];
  let b = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (x >= ramp[i][0] && x <= ramp[i + 1][0]) {
      a = ramp[i];
      b = ramp[i + 1];
      break;
    }
  }
  const f = (x - a[0]) / (b[0] - a[0] || 1);
  return [0, 1, 2].map((i) => Math.round(a[1][i] + (b[1][i] - a[1][i]) * f)) as [number, number, number];
}

export function rampColour(t: number): [number, number, number] {
  return rampColourOf(RAMP, t);
}

export function rampCss(ramp: RampStop[]): string {
  const stops = ramp.map((s) => `rgb(${s[1][0]},${s[1][1]},${s[1][2]}) ${Math.round(s[0] * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export const AIR_RAMP: RampStop[] = [
  [0.0, [52, 211, 153]],
  [0.5, [251, 191, 36]],
  [1.0, [168, 85, 247]],
];

export const FLOOD_RAMP: RampStop[] = [
  [0.0, [30, 64, 120]],
  [0.5, [59, 130, 246]],
  [1.0, [103, 232, 249]],
];

export const Q100_RAMP: RampStop[] = [
  [0.0, [99, 102, 241]],
  [0.5, [168, 85, 247]],
  [1.0, [240, 171, 252]],
];

export const PLUVIAL_RAMP: RampStop[] = [
  [0.0, [13, 148, 136]],
  [0.5, [45, 212, 191]],
  [1.0, [153, 246, 228]],
];

export const SEISMIC_RAMP: RampStop[] = [
  [0.0, [134, 239, 172]],
  [0.5, [251, 146, 60]],
  [1.0, [190, 18, 60]],
];

export const LANDSLIDE_RAMP: RampStop[] = [
  [0.0, [254, 240, 138]],
  [0.5, [217, 119, 6]],
  [1.0, [120, 53, 15]],
];

export type MaskKey = 'noise' | 'air' | 'flood' | 'q100' | 'q100f' | 'pluvial' | 'seismic' | 'landslide';

export interface MaskMeta {
  key: MaskKey;
  label: string;
  ramp: RampStop[];
  lowLabel: string;
  highLabel: string;
  hidden?: boolean;
}

export const MASK_META: Record<MaskKey, MaskMeta> = {
  noise: { key: 'noise', label: 'Шум', ramp: RAMP, lowLabel: 'тихо', highLabel: 'громко' },
  air: { key: 'air', label: 'Качество воздуха', ramp: AIR_RAMP, lowLabel: 'чистый', highLabel: 'грязный' },
  flood: { key: 'flood', label: 'Риск разлива рек', ramp: FLOOD_RAMP, lowLabel: 'сухо', highLabel: 'зальёт' },
  q100: { key: 'q100', label: 'Прогноз наводнений', ramp: Q100_RAMP, lowLabel: 'мелко', highLabel: 'глубоко' },
  q100f: { key: 'q100f', label: 'Прогноз наводнений · 2050', ramp: Q100_RAMP, lowLabel: 'мелко', highLabel: 'глубоко', hidden: true },
  pluvial: { key: 'pluvial', label: 'Ливневое подтопление', ramp: PLUVIAL_RAMP, lowLabel: 'стечёт', highLabel: 'застой' },
  seismic: { key: 'seismic', label: 'Сейсмика', ramp: SEISMIC_RAMP, lowLabel: 'спокойно', highLabel: 'сильные толчки' },
  landslide: { key: 'landslide', label: 'Оползни', ramp: LANDSLIDE_RAMP, lowLabel: 'ровно', highLabel: 'опасный склон' },
};

export type ActivityCategory = 'nightlife' | 'retail' | 'venue' | 'hub' | 'hazard';

export const ACTIVITY_CATEGORIES: Record<ActivityCategory, { color: [number, number, number]; label: string }> = {
  nightlife: { color: [168, 85, 247], label: 'ночная жизнь' },
  retail: { color: [124, 110, 230], label: 'крупный ритейл' },
  venue: { color: [236, 72, 153], label: 'площадки и досуг' },
  hub: { color: [110, 130, 210], label: 'хабы и стройка' },
  hazard: { color: [248, 113, 113], label: 'опасные соседи' },
};
