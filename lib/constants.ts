export const RADIUS = 400;
export const RADIUS_MIN = 200;
export const RADIUS_MAX = 1000;
export const ZONE_HALF_MAX = 1200;

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

export const LANDSLIDE_RAMP: RampStop[] = [
  [0.0, [254, 240, 138]],
  [0.5, [217, 119, 6]],
  [1.0, [120, 53, 15]],
];

export type MaskKey = 'noise' | 'air' | 'flood' | 'q100' | 'q100f' | 'pluvial' | 'landslide';

export type Band = 'low' | 'moderate' | 'high' | 'severe' | 'unknown';

export type MaskKind = 'measured' | 'official' | 'modeled';

export const BAND_RANK: Record<Band, number> = { unknown: -1, low: 0, moderate: 1, high: 2, severe: 3 };

export const BAND_LABEL: Record<Band, string> = {
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  severe: 'severe',
  unknown: 'no data',
};

export const KIND_LABEL: Record<MaskKind, string> = {
  measured: 'observation',
  official: 'official dataset',
  modeled: 'our model',
};

export interface BandStop {
  max: number;
  band: Band;
  verdict: string;
}

export interface MaskMeta {
  key: MaskKey;
  label: string;
  unit: string;
  fallbackNote: string;
  ramp: RampStop[];
  lowLabel: string;
  highLabel: string;
  hidden?: boolean;
  source: string;
  license: string;
  commercialOk: boolean;
  kind: MaskKind;
  bands: BandStop[];
  noValue: { band: Band; verdict: string };
}

export function displayNote(key: MaskKey, note: string | undefined): string {
  if (note && !/[\u0400-\u04FF]/.test(note)) return note;
  return MASK_META[key].fallbackNote;
}

export function displayUnit(key: MaskKey): string {
  return MASK_META[key].unit;
}

export function classifyBand(meta: MaskMeta, avg: number | null, degraded: boolean): { band: Band; verdict: string } {
  if (degraded) return { band: 'unknown', verdict: 'Data temporarily unavailable — layer not assessed.' };
  if (avg == null) return meta.noValue;
  for (const stop of meta.bands) {
    if (avg <= stop.max) return { band: stop.band, verdict: stop.verdict };
  }
  const last = meta.bands[meta.bands.length - 1];
  return { band: last.band, verdict: last.verdict };
}

const Q100_BANDS: BandStop[] = [
  { max: 50, band: 'moderate', verdict: 'Within the 100-year flood zone, depth up to ~0.5 m.' },
  { max: 150, band: 'high', verdict: 'Within the 100-year flood zone, depth 0.5–1.5 m.' },
  { max: Infinity, band: 'severe', verdict: 'Within the 100-year flood zone, depth above 1.5 m.' },
];
const Q100_NOVALUE = {
  band: 'low' as Band,
  verdict: 'Outside the mapped 100-year flood zone (WRI Aqueduct).',
};

export const MASK_META: Record<MaskKey, MaskMeta> = {
  noise: {
    key: 'noise', label: 'Noise', unit: 'dB',
    fallbackNote: 'Model based on OSM road classes (not a measurement). Lden proxy from traffic-weighted road proximity.', ramp: RAMP, lowLabel: 'quiet', highLabel: 'loud',
    source: 'OpenStreetMap · road classes', license: 'ODbL', commercialOk: true, kind: 'modeled',
    bands: [
      { max: 50, band: 'low', verdict: 'Quiet — residential background level.' },
      { max: 60, band: 'moderate', verdict: 'Moderate noise — traffic is audible.' },
      { max: 68, band: 'high', verdict: 'Noisy — above the EU Lden comfort threshold.' },
      { max: Infinity, band: 'severe', verdict: 'Very noisy — constant traffic roar.' },
    ],
    noValue: { band: 'low', verdict: 'No significant noise sources nearby.' },
  },
  air: {
    key: 'air', label: 'Air quality', unit: 'EAQI',
    fallbackNote: 'Ambient CAMS data (~11 km grid) — roughly uniform at district scale.', ramp: AIR_RAMP, lowLabel: 'clean air', highLabel: 'polluted air',
    source: 'Open-Meteo Air Quality (CAMS)', license: 'CC BY 4.0 · free for non-commercial, paid commercial tier', commercialOk: true, kind: 'measured',
    bands: [
      { max: 20, band: 'low', verdict: 'Clean air (EAQI "good").' },
      { max: 40, band: 'moderate', verdict: 'Acceptable air (EAQI "fair").' },
      { max: 60, band: 'high', verdict: 'Polluted air (EAQI "poor").' },
      { max: Infinity, band: 'severe', verdict: 'Heavy pollution (EAQI "very poor").' },
    ],
    noValue: { band: 'unknown', verdict: 'Air quality data unavailable for this location.' },
  },
  flood: {
    key: 'flood', label: 'River flood risk', unit: '%',
    fallbackNote: 'HAND-lite model: height above the nearest significant water (OSM rivers, canals, large water bodies), terrain from Copernicus DEM GLO-30. NOT an official hazard map; engineered defences are only partially accounted for.', ramp: FLOOD_RAMP, lowLabel: 'low risk', highLabel: 'high risk',
    source: 'Copernicus DEM GLO-30 + OSM water (HAND-lite model)', license: 'Copernicus open + ODbL', commercialOk: true, kind: 'modeled',
    bands: [
      { max: 15, band: 'low', verdict: 'Low terrain exposure to river flooding.' },
      { max: 40, band: 'moderate', verdict: 'Moderate proximity to the floodplain.' },
      { max: 70, band: 'high', verdict: 'High risk — the site sits low above the water.' },
      { max: Infinity, band: 'severe', verdict: 'Very high risk — effectively within the flood zone.' },
    ],
    noValue: { band: 'low', verdict: 'No significant water nearby — terrain exposure is minimal.' },
  },
  q100: {
    key: 'q100', label: 'Flood forecast', unit: 'cm',
    fallbackNote: 'WRI Aqueduct (GLOFRIS): depth of the 1-in-100-year flood, max of riverine and coastal. ~1 km resolution, WITHOUT local engineered defences.', ramp: Q100_RAMP, lowLabel: 'shallow water', highLabel: 'deep water',
    source: 'WRI Aqueduct (GLOFRIS) · RP100', license: 'CC BY 4.0', commercialOk: true, kind: 'official',
    bands: Q100_BANDS, noValue: Q100_NOVALUE,
  },
  q100f: {
    key: 'q100f', label: 'Flood forecast · 2050', unit: 'cm',
    fallbackNote: 'WRI Aqueduct climate scenario for 2050 (RCP 8.5): depth of the 1-in-100-year flood on a pessimistic emissions path. Values may be higher OR lower than today — climate shifts rainfall both ways.', ramp: Q100_RAMP, lowLabel: 'shallow water', highLabel: 'deep water', hidden: true,
    source: 'WRI Aqueduct (GLOFRIS) · RP100 · RCP 8.5 · 2050', license: 'CC BY 4.0', commercialOk: true, kind: 'official',
    bands: Q100_BANDS, noValue: Q100_NOVALUE,
  },
  pluvial: {
    key: 'pluvial', label: 'Pluvial flooding', unit: 'cm',
    fallbackNote: 'Model of stormwater ponding: filling of local terrain depressions (Copernicus DEM GLO-30). Shows where water would stand in heavy rain, WITHOUT storm drainage. NOT an official hazard map.', ramp: PLUVIAL_RAMP, lowLabel: 'water drains', highLabel: 'water pools',
    source: 'Copernicus DEM GLO-30 (ponding in depressions)', license: 'Copernicus open', commercialOk: true, kind: 'modeled',
    bands: [
      { max: 15, band: 'low', verdict: 'Shallow ponding — puddle depth, drains off.' },
      { max: 40, band: 'moderate', verdict: 'Minor ponding in local depressions during heavy rain.' },
      { max: 70, band: 'high', verdict: 'Noticeable water accumulation — ground-floor access affected.' },
      { max: Infinity, band: 'severe', verdict: 'Deep ponding — water stands well above street level.' },
    ],
    noValue: { band: 'low', verdict: 'No local depressions for water to pool in.' },
  },
  landslide: {
    key: 'landslide', label: 'Landslides', unit: '%',
    fallbackNote: 'NASA LHASA: slope susceptibility to landslides (slope, geology, faults, roads, deforestation), ~1 km. Susceptibility is not an event forecast.', ramp: LANDSLIDE_RAMP, lowLabel: 'flat ground', highLabel: 'unstable slope',
    source: 'NASA LHASA · global susceptibility', license: 'open (US Gov)', commercialOk: true, kind: 'official',
    bands: [
      { max: 25, band: 'low', verdict: 'Low slope susceptibility to landslides.' },
      { max: 50, band: 'moderate', verdict: 'Moderate landslide susceptibility.' },
      { max: 75, band: 'high', verdict: 'High slope susceptibility.' },
      { max: Infinity, band: 'severe', verdict: 'Very high landslide susceptibility.' },
    ],
    noValue: { band: 'low', verdict: 'Flat / stable terrain.' },
  },
};

export type ActivityCategory = 'nightlife' | 'retail' | 'venue' | 'hub' | 'hazard';

export const ACTIVITY_CATEGORIES: Record<ActivityCategory, { color: [number, number, number]; label: string }> = {
  nightlife: { color: [168, 85, 247], label: 'nightlife' },
  retail: { color: [124, 110, 230], label: 'large retail' },
  venue: { color: [236, 72, 153], label: 'venues & leisure' },
  hub: { color: [110, 130, 210], label: 'hubs & construction' },
  hazard: { color: [248, 113, 113], label: 'hazardous neighbours' },
};
