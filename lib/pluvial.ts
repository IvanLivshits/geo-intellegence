import { gridCells } from './geo-math';
import { sampleElevations } from './dem';
import { makeField, type MaskField } from './mask-field';
import { clipToZone } from './polygon';
import { PLUVIAL_RAMP } from './constants';
import type { MaskContext } from './masks';

const GRID_N = 48;
const POND_MAX_CM = 100;
const ARTIFACT_CM = 300;

const NOTE =
  'Модель застоя ливневых вод: заполнение локальных понижений рельефа (Copernicus DEM GLO-30). Показывает, где встанет вода при сильном ливне, БЕЗ учёта ливневой канализации. Понижения глубже 3 м отброшены как артефакты застройки (DSM). НЕ официальная карта.';

function fillDepressions(elevs: (number | null)[], n: number): number[] {
  const filled = new Array<number>(n * n);
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const border = r === 0 || c === 0 || r === n - 1 || c === n - 1;
    const e = elevs[i];
    filled[i] = border || e == null ? (e ?? -Infinity) : Infinity;
  }

  let changed = true;
  let passes = 0;
  while (changed && passes < 500) {
    changed = false;
    passes++;
    const order = passes % 2 === 1;
    for (let k = 0; k < n * n; k++) {
      const i = order ? k : n * n - 1 - k;
      const e = elevs[i];
      if (e == null) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      if (r === 0 || c === 0 || r === n - 1 || c === n - 1) continue;
      let minNb = Infinity;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nb = filled[(r + dr) * n + (c + dc)];
          if (nb < minNb) minNb = nb;
        }
      }
      const cand = Math.max(e, minNb);
      if (cand < filled[i]) {
        filled[i] = cand;
        changed = true;
      }
    }
  }
  return filled;
}

export async function computePluvialMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = GRID_N;

  const cells = gridCells(lat, lon, radius, n);
  const elevs = await sampleElevations(cells);
  const filled = fillDepressions(elevs, n);

  const values: (number | null)[] = new Array(n * n).fill(null);
  for (let i = 0; i < n * n; i++) {
    const e = elevs[i];
    if (e == null || !Number.isFinite(filled[i])) continue;
    const pondCm = (filled[i] - e) * 100;
    if (pondCm <= 1 || pondCm > ARTIFACT_CM) continue;
    values[i] = Math.min(pondCm, POND_MAX_CM);
  }

  return makeField(clipToZone(values, n, radius, ctx.zone), n, {
    ramp: PLUVIAL_RAMP,
    lo: 0,
    hi: POND_MAX_CM,
    alphaMin: 90,
    alphaMax: 220,
    unit: 'см',
    label: 'Ливневое подтопление (модель)',
    note: NOTE,
  });
}
