export type LatLon = [number, number];
export type ZonePolygon = [number, number][];

function orient(a: LatLon, b: LatLon, c: LatLon): number {
  return (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
}

export function properCross(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function edgeCrossesPath(a: LatLon, b: LatLon, path: LatLon[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (properCross(a, b, path[i], path[i + 1])) return true;
  }
  return false;
}

export function pathSelfIntersects(path: LatLon[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = i + 1; j < path.length - 1; j++) {
      if (properCross(path[i], path[i + 1], path[j], path[j + 1])) return true;
    }
  }
  return false;
}

export function ringSelfIntersects(ring: LatLon[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (properCross(a, b, c, d)) return true;
    }
  }
  return false;
}

export function pointInZone(x: number, y: number, zone: ZonePolygon): boolean {
  let inside = false;
  for (let i = 0, j = zone.length - 1; i < zone.length; j = i++) {
    const [xi, yi] = zone[i];
    const [xj, yj] = zone[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function clipToZone(
  values: (number | null)[],
  n: number,
  radius: number,
  zone?: ZonePolygon,
): (number | null)[] {
  if (!zone || zone.length < 3) return values;
  const cellM = (radius * 2) / n;
  return values.map((v, i) => {
    if (v == null) return v;
    const r = Math.floor(i / n);
    const c = i % n;
    const x = -radius + cellM * (c + 0.5);
    const y = radius - cellM * (r + 0.5);
    return pointInZone(x, y, zone) ? v : null;
  });
}
