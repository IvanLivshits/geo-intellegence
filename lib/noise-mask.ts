import { metresToDegLat, metresToDegLon } from './geo';
import { overpass } from './http';
import { ldenAt, type OsmElement } from './noise-model';
import { DB_LOW, DB_HIGH, RAMP, rampColour, MASK_META } from './constants';
import type { MaskField } from './mask-field';
import type { MaskContext } from './masks';

function isRoadSource(el: OsmElement): boolean {
  const t = el.tags || {};
  return el.type === 'way' && Boolean(t.highway || t.railway === 'rail');
}

async function fetchRoadElements(lat: number, lon: number, radius: number): Promise<OsmElement[]> {
  const ymin = lat - metresToDegLat(radius);
  const ymax = lat + metresToDegLat(radius);
  const xmin = lon - metresToDegLon(radius, lat);
  const xmax = lon + metresToDegLon(radius, lat);
  const bbox = `${ymin},${xmin},${ymax},${xmax}`;
  const q = `[out:json][timeout:60];
      ( way(${bbox})[highway];
        way(${bbox})[railway=rail]; );
      out geom;`;
  const res = await overpass(q);
  return ((res as { elements?: OsmElement[] }).elements || []).filter(isRoadSource);
}

const NOISE_GRID_N = 96;

export async function computeNoiseMask(ctx: MaskContext): Promise<MaskField> {
  const { lat, lon, radius } = ctx;
  const n = NOISE_GRID_N;
  const sourceEls = ctx.osmElements
    ? ctx.osmElements.filter(isRoadSource)
    : await fetchRoadElements(lat, lon, radius);

  const cellM = (radius * 2) / n;
  const rgba = new Array<number>(n * n * 4).fill(0);
  const dbs: number[] = [];
  const [qr, qg, qb] = RAMP[0][1];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const dy = -radius + cellM * (r + 0.5);
      const dx = -radius + cellM * (c + 0.5);
      const clat = lat - metresToDegLat(dy);
      const clon = lon + metresToDegLon(dx, lat);
      const { lden } = ldenAt(clat, clon, sourceEls);
      const i = (r * n + c) * 4;
      if (lden == null) {
        rgba[i] = qr;
        rgba[i + 1] = qg;
        rgba[i + 2] = qb;
        rgba[i + 3] = 0;
        continue;
      }
      const t = Math.max(0, Math.min(1, (lden - DB_LOW) / (DB_HIGH - DB_LOW)));
      const [r0, g0, b0] = rampColour(t);
      rgba[i] = r0;
      rgba[i + 1] = g0;
      rgba[i + 2] = b0;
      rgba[i + 3] = Math.round(18 + 237 * Math.pow(t, 1.6));
      dbs.push(lden);
    }
  }

  console.log(`[шум] поле ${n}×${n} готово · ячеек со звуком: ${dbs.length}`);

  return {
    n,
    rgba,
    avg: dbs.length ? Math.round(dbs.reduce((s, v) => s + v, 0) / dbs.length) : null,
    min: dbs.length ? Math.min(...dbs) : null,
    max: dbs.length ? Math.max(...dbs) : null,
    unit: 'дБ',
    label: MASK_META.noise.label,
    note: 'Модель по классам дорог OSM (не замер).',
  };
}
