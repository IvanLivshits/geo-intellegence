export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function metresToDegLat(m: number): number {
  return m / 111320;
}

export function metresToDegLon(m: number, lat: number): number {
  return m / (111320 * Math.cos((lat * Math.PI) / 180));
}

export function localMetres(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  const cos = Math.cos((lat0 * Math.PI) / 180);
  return [(lon - lon0) * 111320 * cos, (lat - lat0) * 111320];
}

export interface GridCell {
  lat: number;
  lon: number;
  x: number;
  y: number;
}

export function gridCells(lat: number, lon: number, radius: number, n: number): GridCell[] {
  const cellM = (radius * 2) / n;
  const cells: GridCell[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = -radius + cellM * (c + 0.5);
      const y = radius - cellM * (r + 0.5);
      cells.push({ lat: lat + metresToDegLat(y), lon: lon + metresToDegLon(x, lat), x, y });
    }
  }
  return cells;
}
