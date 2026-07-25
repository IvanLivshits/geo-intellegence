import { localMetres, metresToDegLat, metresToDegLon } from './geo-math';
import { coastalTerrain } from './coastal-terrain';

export const ATTENUATION_CM_PER_KM = 12.5;

const MIN_CELL_M = 90;
const MAX_CELL_M = 400;
const TARGET_CELLS_PER_SIDE = 200;
const MAX_TOTAL_CELLS = 60000;
const MARGIN_FRACTION = 0.25;
const MIN_MARGIN_M = 2000;

export interface SurgeFill {
  originLat: number;
  originLon: number;
  cell: number;
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  attenuation: Float64Array;
  reached: boolean;
  blockedByGaps: boolean;
  coverage: number;
}

interface Heap {
  push: (index: number, cost: number) => void;
  pop: () => number | null;
}

function makeHeap(): Heap {
  const idx: number[] = [];
  const cost: number[] = [];

  const swap = (a: number, b: number): void => {
    [idx[a], idx[b]] = [idx[b], idx[a]];
    [cost[a], cost[b]] = [cost[b], cost[a]];
  };

  return {
    push(index, c) {
      idx.push(index);
      cost.push(c);
      let i = idx.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (cost[parent] <= cost[i]) break;
        swap(parent, i);
        i = parent;
      }
    },
    pop() {
      if (!idx.length) return null;
      const top = idx[0];
      const lastIdx = idx.pop() as number;
      const lastCost = cost.pop() as number;
      if (idx.length) {
        idx[0] = lastIdx;
        cost[0] = lastCost;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let small = i;
          if (l < idx.length && cost[l] < cost[small]) small = l;
          if (r < idx.length && cost[r] < cost[small]) small = r;
          if (small === i) break;
          swap(small, i);
          i = small;
        }
      }
      return top;
    },
  };
}

export async function surgeFill(
  siteLat: number,
  siteLon: number,
  coastLat: number,
  coastLon: number,
  eslCm: number,
  scanRadius: number,
): Promise<SurgeFill> {
  const [coastX, coastY] = localMetres(siteLat, siteLon, coastLat, coastLon);

  const margin = Math.max(MIN_MARGIN_M, Math.hypot(coastX, coastY) * MARGIN_FRACTION, scanRadius * 1.5);
  const minX = Math.min(0, coastX) - margin;
  const maxX = Math.max(0, coastX) + margin;
  const minY = Math.min(0, coastY) - margin;
  const maxY = Math.max(0, coastY) + margin;

  const span = Math.max(maxX - minX, maxY - minY);
  let cell = Math.max(MIN_CELL_M, Math.min(MAX_CELL_M, span / TARGET_CELLS_PER_SIDE));
  let nx = Math.ceil((maxX - minX) / cell);
  let ny = Math.ceil((maxY - minY) / cell);
  while (nx * ny > MAX_TOTAL_CELLS) {
    cell *= 1.25;
    nx = Math.ceil((maxX - minX) / cell);
    ny = Math.ceil((maxY - minY) / cell);
  }

  const points = [];
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const x = minX + cell * (c + 0.5);
      const y = minY + cell * (r + 0.5);
      points.push({
        lat: siteLat + metresToDegLat(y),
        lon: siteLon + metresToDegLon(x, siteLat),
      });
    }
  }

  const terrain = await coastalTerrain(points);
  const elevs = terrain.elev;

  const total = nx * ny;
  const attenuation = new Float64Array(total).fill(Infinity);
  const heap = makeHeap();

  const colOf = (x: number): number => Math.floor((x - minX) / cell);
  const rowOf = (y: number): number => Math.floor((y - minY) / cell);

  const seedCol = Math.max(0, Math.min(nx - 1, colOf(coastX)));
  const seedRow = Math.max(0, Math.min(ny - 1, rowOf(coastY)));
  const seed = seedRow * nx + seedCol;
  attenuation[seed] = 0;
  heap.push(seed, 0);

  let blockedByGaps = false;
  const diag = cell * Math.SQRT2;

  for (;;) {
    const i = heap.pop();
    if (i == null) break;
    const ci = i % nx;
    const ri = (i - ci) / nx;
    const base = attenuation[i];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rj = ri + dr;
        const cj = ci + dc;
        if (rj < 0 || cj < 0 || rj >= ny || cj >= nx) continue;
        const j = rj * nx + cj;

        const elevJ = elevs[j];
        if (elevJ == null) {
          blockedByGaps = true;
          continue;
        }

        const stepM = dr && dc ? diag : cell;
        const added = terrain.water[j] ? 0 : (ATTENUATION_CM_PER_KM * stepM) / 1000;
        const attJ = base + added;
        if (attJ >= attenuation[j]) continue;
        if (eslCm - attJ <= elevJ * 100) continue;

        attenuation[j] = attJ;
        heap.push(j, attJ);
      }
    }
  }

  const siteCol = Math.max(0, Math.min(nx - 1, colOf(0)));
  const siteRow = Math.max(0, Math.min(ny - 1, rowOf(0)));

  return {
    originLat: siteLat,
    originLon: siteLon,
    cell,
    nx,
    ny,
    x0: minX,
    y0: minY,
    attenuation,
    reached: Number.isFinite(attenuation[siteRow * nx + siteCol]),
    blockedByGaps,
    coverage: terrain.coverage,
  };
}

export function attenuationAt(fill: SurgeFill, x: number, y: number): number {
  const c = Math.floor((x - fill.x0) / fill.cell);
  const r = Math.floor((y - fill.y0) / fill.cell);
  if (c < 0 || r < 0 || c >= fill.nx || r >= fill.ny) return Infinity;
  return fill.attenuation[r * fill.nx + c];
}
