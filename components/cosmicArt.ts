function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

const starfieldCache = new Map<string, string>();

export function starfieldUri(seed: string, w = 480, h = 200): string {
  const key = `${seed}:${w}x${h}`;
  const cached = starfieldCache.get(key);
  if (cached) return cached;

  const rand = mulberry32(seedFromString(seed));
  const n = Math.round((w * h) / 1600);
  let stars = '';
  for (let i = 0; i < n; i++) {
    stars += `<circle cx="${(rand() * w).toFixed(1)}" cy="${(rand() * h).toFixed(1)}" r="${(0.4 + rand() * 1.1).toFixed(1)}" fill="#fff" opacity="${(0.1 + rand() * 0.5).toFixed(2)}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#0c0c0b"/>${stars}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  starfieldCache.set(key, uri);
  return uri;
}
