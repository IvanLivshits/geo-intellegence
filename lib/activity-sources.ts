import { haversine } from './geo';
import { ACTIVITY_CATEGORIES, type ActivityCategory } from './constants';
import type { ActivitySource } from './types';
import type { OsmElement } from './noise-model';

interface KindSpec {
  category: ActivityCategory;
  label: string;
  radius: number;
}

const KIND: Record<string, KindSpec> = {
  nightclub: { category: 'nightlife', label: 'ночной клуб', radius: 150 },
  bar: { category: 'nightlife', label: 'бар', radius: 80 },
  pub: { category: 'nightlife', label: 'паб', radius: 90 },
  mall: { category: 'retail', label: 'ТЦ', radius: 200 },
  retail: { category: 'retail', label: 'ритейл', radius: 130 },
  marketplace: { category: 'retail', label: 'рынок', radius: 110 },
  stadium: { category: 'venue', label: 'стадион', radius: 350 },
  events_venue: { category: 'venue', label: 'площадка событий', radius: 200 },
  cinema: { category: 'venue', label: 'кинотеатр', radius: 150 },
  theatre: { category: 'venue', label: 'театр', radius: 150 },
  bus_station: { category: 'hub', label: 'автовокзал', radius: 150 },
  station: { category: 'hub', label: 'станция', radius: 130 },
  subway_entrance: { category: 'hub', label: 'вход в метро', radius: 90 },
  tram_stop: { category: 'hub', label: 'трамвай', radius: 80 },
  construction: { category: 'hub', label: 'стройка', radius: 200 },
  industrial: { category: 'hub', label: 'промзона', radius: 220 },
  fuel: { category: 'hazard', label: 'АЗС', radius: 100 },
  storage_tank: { category: 'hazard', label: 'резервуар топлива/газа', radius: 200 },
  aerodrome: { category: 'hazard', label: 'аэродром', radius: 1000 },
  substation: { category: 'hazard', label: 'электроподстанция', radius: 120 },
};

function kindOf(tags: Record<string, string> = {}): string | null {
  const a = tags.amenity;
  if (
    a &&
    KIND[a] &&
    ['nightclub', 'bar', 'pub', 'marketplace', 'cinema', 'theatre', 'events_venue', 'bus_station', 'fuel'].includes(a)
  )
    return a;
  if (tags.shop === 'mall') return 'mall';
  if (tags.building === 'retail') return 'retail';
  if (tags.leisure === 'stadium') return 'stadium';
  if (tags.man_made === 'storage_tank') return 'storage_tank';
  if (tags.aeroway === 'aerodrome') return 'aerodrome';
  if (tags.power === 'substation') return 'substation';
  const rw = tags.railway;
  if (rw === 'station' || rw === 'subway_entrance' || rw === 'tram_stop') return rw;
  const lu = tags.landuse;
  if (lu === 'construction' || lu === 'industrial') return lu;
  return null;
}

function pointOf(el: OsmElement): OsmGeometryLike | null {
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  if (el.lat != null) return { lat: el.lat, lon: el.lon as number };
  const g = el.geometry;
  if (Array.isArray(g) && g.length) {
    const s = g.reduce((acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }), { lat: 0, lon: 0 });
    return { lat: s.lat / g.length, lon: s.lon / g.length };
  }
  return null;
}

interface OsmGeometryLike {
  lat: number;
  lon: number;
}

export function extractActivity(
  elements: OsmElement[],
  lat: number,
  lon: number,
  radius: number,
): ActivitySource[] {
  const seen = new Set<string>();
  const out: ActivitySource[] = [];
  for (const el of elements) {
    const kind = kindOf(el.tags || {});
    if (!kind) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    const pt = pointOf(el);
    if (!pt) continue;
    seen.add(id);
    const dist = haversine(lat, lon, pt.lat, pt.lon);
    if (dist > radius) continue;
    const spec = KIND[kind];
    out.push({
      lat: pt.lat,
      lon: pt.lon,
      category: spec.category,
      color: ACTIVITY_CATEGORIES[spec.category].color,
      kind,
      kindLabel: spec.label,
      name: (el.tags && el.tags.name) || spec.label,
      radius: spec.radius,
      dist: Math.round(dist),
    });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

export function activitySummary(activity: ActivitySource[]): Record<string, number> {
  const by: Record<string, number> = {};
  for (const a of activity) by[a.category] = (by[a.category] || 0) + 1;
  return by;
}
