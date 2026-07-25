import { sampleDeltaDtm } from './deltadtm';
import { sampleElevations, type DemPoint } from './dem';

export const DTM_CLIP_M = 10;
const SEA_MAX_M = 2;

export interface CoastalTerrain {
  elev: (number | null)[];
  water: boolean[];
  coverage: number;
}

export async function coastalTerrain(points: DemPoint[]): Promise<CoastalTerrain> {
  const dtm = await sampleDeltaDtm(points);

  const elev: (number | null)[] = new Array(points.length).fill(null);
  const water: boolean[] = new Array(points.length).fill(false);
  let known = 0;

  const gaps: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const d = dtm[i];
    if (d != null) {
      elev[i] = d;
      known++;
    } else {
      gaps.push(i);
    }
  }

  if (gaps.length) {
    const dsm = await sampleElevations(gaps.map((i) => points[i]));
    gaps.forEach((i, k) => {
      const s = dsm[k];
      if (s == null) return;
      if (s <= SEA_MAX_M) {
        elev[i] = 0;
        water[i] = true;
      } else {
        elev[i] = DTM_CLIP_M;
      }
      known++;
    });
  }

  return { elev, water, coverage: points.length ? known / points.length : 0 };
}
