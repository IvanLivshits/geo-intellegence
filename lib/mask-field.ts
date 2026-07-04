import { rampColourOf, type RampStop } from './constants';

export interface MaskField {
  n: number;
  rgba: number[];
  avg: number | null;
  min: number | null;
  max: number | null;
  unit: string;
  label: string;
  note: string;
}

interface FieldStats {
  rgba: number[];
  avg: number | null;
  min: number | null;
  max: number | null;
}

export function fieldFromValues(
  values: (number | null)[],
  n: number,
  ramp: RampStop[],
  lo: number,
  hi: number,
  alphaMin = 55,
  alphaMax = 220,
): FieldStats {
  const rgba = new Array(n * n * 4).fill(0);
  const [qr, qg, qb] = ramp[0][1];
  const nums: number[] = [];

  for (let i = 0; i < n * n; i++) {
    const v = values[i];
    const o = i * 4;
    if (v == null || Number.isNaN(v)) {
      rgba[o] = qr;
      rgba[o + 1] = qg;
      rgba[o + 2] = qb;
      rgba[o + 3] = 0;
      continue;
    }
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
    const [r, g, b] = rampColourOf(ramp, t);
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = Math.round(alphaMin + (alphaMax - alphaMin) * t);
    nums.push(v);
  }

  return {
    rgba,
    avg: nums.length ? Math.round(nums.reduce((s, x) => s + x, 0) / nums.length) : null,
    min: nums.length ? Math.round(Math.min(...nums)) : null,
    max: nums.length ? Math.round(Math.max(...nums)) : null,
  };
}

export interface FieldSpec {
  ramp: RampStop[];
  lo: number;
  hi: number;
  alphaMin: number;
  alphaMax: number;
  unit: string;
  label: string;
  note: string;
}

export function makeField(values: (number | null)[], n: number, spec: FieldSpec): MaskField {
  const stats = fieldFromValues(values, n, spec.ramp, spec.lo, spec.hi, spec.alphaMin, spec.alphaMax);
  return {
    n,
    rgba: stats.rgba,
    avg: stats.avg,
    min: stats.min,
    max: stats.max,
    unit: spec.unit,
    label: spec.label,
    note: spec.note,
  };
}
