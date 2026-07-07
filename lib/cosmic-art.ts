import { localMetres } from './geo-math';
import type { ScanPayload, ShareMeta } from './types';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ISO_X = 0.866;
const ISO_Y = 0.5;
const Z_EXAGGERATE = 1.25;

function isoCity(payload: ScanPayload, meta: ShareMeta, cx: number, cy: number, r: number): string {
  const [clon, clat] = payload.center;
  const all = payload.buildings.map((b) => ({
    pts: b.polygon.map(([lo, la]) => localMetres(clat, clon, la, lo)),
    height: b.height,
  }));
  const inBox = (pts: [number, number][], box: number) =>
    pts.some(([x, y]) => Math.abs(x) <= box && Math.abs(y) <= box);

  let half: number;
  if (meta.zone) {
    half = Math.min(
      payload.radius,
      Math.max(
        ...meta.zone.map(([lo, la]) => {
          const [x, y] = localMetres(clat, clon, la, lo);
          return Math.max(Math.abs(x), Math.abs(y));
        }),
      ) + 40,
    );
  } else {
    half = Math.min(payload.radius, 330);
    for (const trial of [330, 500, 700, payload.radius]) {
      half = Math.min(payload.radius, trial);
      if (all.filter((a) => inBox(a.pts, half)).length >= 80) break;
    }
  }

  interface IsoBuilding {
    ground: [number, number][];
    depth: number;
    h: number;
  }
  const footprintArea = (pts: [number, number][]) => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  };

  const items: IsoBuilding[] = [];
  for (const b of all) {
    if (!inBox(b.pts, half)) continue;
    items.push({
      ground: b.pts,
      depth: Math.max(...b.pts.map(([x, y]) => x - y)),
      h: Math.min(b.height, 70) * Z_EXAGGERATE,
    });
  }
  const buildings =
    items.length > 420
      ? [...items].sort((a, b) => footprintArea(b.ground) - footprintArea(a.ground)).slice(0, 420)
      : items;
  buildings.sort((a, b) => a.depth - b.depth);

  const proj = ([x, y]: [number, number], z: number): [number, number] => [
    (x - y) * ISO_X,
    (x + y) * ISO_Y - z,
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = (p: [number, number], z: number) => {
    const [px, py] = proj(p, z);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  for (const it of buildings) {
    for (const p of it.ground) {
      extend(p, 0);
      extend(p, it.h);
    }
  }
  if (meta.zone) {
    for (const [lo, la] of meta.zone) extend(localMetres(clat, clon, la, lo), 0);
  }
  if (!Number.isFinite(minX)) return '';

  const boxW = r * 1.5;
  const boxH = r * 1.3;
  const scale = Math.min(boxW / (maxX - minX || 1), boxH / (maxY - minY || 1));
  const toScreen = (p: [number, number], z: number): [number, number] => {
    const [px, py] = proj(p, z);
    return [cx + (px - (minX + maxX) / 2) * scale, cy + 10 + (py - (minY + maxY) / 2) * scale];
  };
  const fmt = (pts: [number, number][]) =>
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const parts: string[] = [];

  if (meta.zone) {
    const zonePts = meta.zone.map(([lo, la]) => toScreen(localMetres(clat, clon, la, lo), 0));
    parts.push(
      `<polygon points="${fmt(zonePts)}" fill="none" stroke="#3b82f6" stroke-width="6" stroke-linejoin="round" filter="url(#soft)" opacity="0.85"/>`,
      `<polygon points="${fmt(zonePts)}" fill="rgba(37,99,235,0.12)" stroke="#7db4ff" stroke-width="1.5" stroke-linejoin="round"/>`,
    );
  }

  for (const it of buildings) {
    const g = it.ground.map((p) => toScreen(p, 0));
    const t = it.ground.map((p) => toScreen(p, it.h));
    const faces: { d: number; svg: string }[] = [];
    for (let i = 0; i < it.ground.length; i++) {
      const j = (i + 1) % it.ground.length;
      const [ax, ay] = it.ground[i];
      const [bx, by] = it.ground[j];
      const nx = by - ay;
      const ny = ax - bx;
      const lit = nx * -0.55 + ny * 0.84 > 0;
      const quad = [g[i], g[j], t[j], t[i]];
      faces.push({
        d: Math.max(ax - ay, bx - by),
        svg: `<polygon points="${fmt(quad)}" fill="${lit ? '#707c96' : '#555d70'}"/>`,
      });
    }
    faces.sort((a, b) => a.d - b.d);
    parts.push(...faces.map((f) => f.svg));
    parts.push(
      `<polygon points="${fmt(t)}" fill="#9aa6c2" stroke="rgba(16,18,24,0.85)" stroke-width="0.5" stroke-linejoin="round"/>`,
    );
  }

  if (!meta.zone) {
    const [px, py] = toScreen([0, 0], 0);
    parts.push(
      `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" fill="#e5654b" filter="url(#soft)" opacity="0.9"/>`,
      `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="#e5654b" stroke="#ffffff" stroke-width="1.8"/>`,
    );
  }

  return `<g clip-path="url(#bubbleClip)">${parts.join('')}</g>`;
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  const x2 = cx + r * Math.cos(rad(a2));
  const y2 = cy + r * Math.sin(rad(a2));
  const large = (a2 - a1 + 360) % 360 > 180 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function bubble(cx: number, cy: number, r: number, rand: () => number, inner: string): string {
  const rim = [
    { a1: 150, a2: 260, grad: 'rimPink', w: 5, blur: 'soft' },
    { a1: 300, a2: 40, grad: 'rimCyan', w: 4, blur: 'soft' },
    { a1: 60, a2: 130, grad: 'rimViolet', w: 5, blur: 'soft' },
    { a1: 190, a2: 250, grad: 'rimWhite', w: 2.5, blur: 'tight' },
  ]
    .map(
      (s) =>
        `<path d="${arcPath(cx, cy, r - 2, s.a1, s.a2)}" stroke="url(#${s.grad})" stroke-width="${s.w}" fill="none" filter="url(#${s.blur})" stroke-linecap="round"/>`,
    )
    .join('');

  const sparks: string[] = [];
  const colors = ['#ffffff', '#ffffff', '#ff6b6b', '#4ade80', '#60a5fa', '#e879f9'];
  for (let i = 0; i < 70; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = r * (0.55 + rand() * 0.42);
    const x = cx + rr * Math.cos(ang);
    const y = cy + rr * Math.sin(ang);
    const c = colors[Math.floor(rand() * colors.length)];
    const s = c === '#ffffff' ? 0.7 + rand() * 1.6 : 0.9 + rand() * 1.2;
    sparks.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(1)}" fill="${c}" opacity="${(0.35 + rand() * 0.6).toFixed(2)}"/>`,
    );
  }

  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sphere)"/>
    <ellipse cx="${cx - r * 0.35}" cy="${cy - r * 0.3}" rx="${r * 0.55}" ry="${r * 0.4}" fill="url(#nebulaPink)" filter="url(#heavy)" opacity="0.5"/>
    <ellipse cx="${cx + r * 0.3}" cy="${cy + r * 0.35}" rx="${r * 0.5}" ry="${r * 0.35}" fill="url(#nebulaBlue)" filter="url(#heavy)" opacity="0.5"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
    ${rim}
    <path d="${arcPath(cx, cy, r * 0.86, 200, 245)}" stroke="rgba(255,255,255,0.5)" stroke-width="7" fill="none" filter="url(#soft)" stroke-linecap="round"/>
    ${sparks}
    ${inner}
  `;
}

function defs(clipCx: number, clipCy: number, clipR: number): string {
  return `<defs>
    <radialGradient id="sphere" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#1a1c2e" stop-opacity="0.9"/>
      <stop offset="45%" stop-color="#0e0f18" stop-opacity="0.95"/>
      <stop offset="85%" stop-color="#05050a" stop-opacity="1"/>
      <stop offset="100%" stop-color="#101018" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="nebulaPink" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c2497f" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#c2497f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nebulaBlue" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3f5bc9" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#3f5bc9" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rimPink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff8a5c" stop-opacity="0"/>
      <stop offset="45%" stop-color="#ff5f8f" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#c86bff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rimCyan" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4ad0ff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#7de8ff" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#5c7cff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rimViolet" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#8f6bff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#b47dff" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ff6bd5" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rimWhite" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="tight" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="heavy" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="26"/></filter>
    <clipPath id="bubbleClip"><circle cx="${clipCx}" cy="${clipCy}" r="${clipR}"/></clipPath>
  </defs>`;
}

export function buildArt(meta: ShareMeta | null, payload: ScanPayload | null, seedHex: string): string {
  const W = 1200;
  const H = 630;
  const rand = mulberry32(parseInt(seedHex, 16));

  const stars: string[] = [];
  for (let i = 0; i < 130; i++) {
    stars.push(
      `<circle cx="${(rand() * W).toFixed(1)}" cy="${(rand() * H).toFixed(1)}" r="${(0.6 + rand() * 1.4).toFixed(1)}" fill="#ffffff" opacity="${(0.12 + rand() * 0.6).toFixed(2)}"/>`,
    );
  }

  const CX = 860;
  const CY = 315;
  const R = 225;
  const inner = meta && payload ? isoCity(payload, meta, CX, CY, R) : '';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${defs(CX, CY, R - 4)}
    <rect width="${W}" height="${H}" fill="#0c0c0b"/>
    ${stars.join('')}
    ${bubble(CX, CY, R, rand, inner)}
  </svg>`;
}

export function buildOrbArt(
  meta: ShareMeta,
  payload: ScanPayload,
  seedHex: string,
  size = 256,
): string {
  const rand = mulberry32(parseInt(seedHex, 16));
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const inner = isoCity(payload, meta, cx, cy, r);

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${defs(cx, cy, r - 4)}
    ${bubble(cx, cy, r, rand, inner)}
  </svg>`;
}
