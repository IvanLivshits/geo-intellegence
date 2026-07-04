import type { OsmElement } from './noise-model';
import type { MaskField } from './mask-field';
import { MASK_META, type MaskKey } from './constants';
import { computeNoiseMask } from './noise-mask';
import { computeAirMask } from './air';
import { computeFloodMask } from './flood';
import { computeOfficialFloodMask, computeOfficialFloodFutureMask } from './official-flood';
import { computePluvialMask } from './pluvial';
import { computeSeismicMask } from './seismic';
import { computeLandslideMask } from './landslide';

export interface MaskContext {
  lat: number;
  lon: number;
  radius: number;
  osmElements?: OsmElement[];
  zone?: [number, number][];
  zoneTag?: string;
}

type MaskCompute = (ctx: MaskContext) => Promise<MaskField>;

const MASK_PROVIDERS: Record<MaskKey, MaskCompute> = {
  noise: computeNoiseMask,
  air: computeAirMask,
  flood: computeFloodMask,
  q100: computeOfficialFloodMask,
  q100f: computeOfficialFloodFutureMask,
  pluvial: computePluvialMask,
  seismic: computeSeismicMask,
  landslide: computeLandslideMask,
};

function emptyMask(key: MaskKey): MaskField {
  return {
    n: 2,
    rgba: new Array(16).fill(0),
    avg: null,
    min: null,
    max: null,
    unit: '',
    label: MASK_META[key].label,
    note: 'Данные временно недоступны.',
  };
}

export async function computeAllMasks(ctx: MaskContext): Promise<Record<MaskKey, MaskField>> {
  const keys = Object.keys(MASK_PROVIDERS) as MaskKey[];
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        return [key, await MASK_PROVIDERS[key](ctx)] as const;
      } catch (err) {
        console.warn(`[маска:${key}] недоступна: ${err instanceof Error ? err.message : String(err)}`);
        return [key, emptyMask(key)] as const;
      }
    }),
  );
  return Object.fromEntries(results) as Record<MaskKey, MaskField>;
}
