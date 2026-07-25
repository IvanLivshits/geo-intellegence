import { kindLabelOf } from './activity-sources';
import {
  MASK_META,
  ACTIVITY_CATEGORIES,
  AMENITY_KEYS,
  BAND_LABEL,
  BAND_RANK,
  KIND_LABEL,
  classifyBand,
  type Band,
  type MaskKey,
  type MaskKind,
  type ActivityCategory,
} from './constants';
import type {
  RiskMemo,
  RiskMemoEntry,
  RiskMemoNeighbour,
  RiskMemoProvenanceItem,
  ScanPayload,
} from './types';

const VISIBLE: MaskKey[] = (Object.keys(MASK_META) as MaskKey[]).filter((k) => !MASK_META[k].hidden);

function entryFor(key: MaskKey, payload: ScanPayload): RiskMemoEntry {
  const meta = MASK_META[key];
  const field = payload.masks[key];
  const degraded = !field || Boolean(field.degraded);
  const value = field ? (field.site !== undefined ? field.site : (field.avg ?? null)) : null;
  const { band, verdict } = classifyBand(meta, value, degraded);
  const range =
    field && field.min != null && field.max != null && field.min !== field.max
      ? ([field.min, field.max] as [number, number])
      : null;
  return {
    key,
    label: meta.label,
    value,
    range,
    unit: meta.unit,
    band,
    bandLabel: BAND_LABEL[band],
    verdict,
    source: meta.source,
    license: meta.license,
    commercialOk: meta.commercialOk,
    kind: meta.kind,
    kindLabel: KIND_LABEL[meta.kind],
    degraded,
    note: field?.siteNote ?? '',
  };
}

function buildHeadline(entries: RiskMemoEntry[]): string {
  const material = entries.filter((e) => e.band === 'severe' || e.band === 'high');
  const unknown = entries.filter((e) => e.band === 'unknown').length;
  if (unknown === entries.length) {
    return 'Site could not be assessed — no layer returned data';
  }
  let head =
    material.length > 0
      ? material.map((e) => `${e.label} — ${e.bandLabel}`).join('; ')
      : 'No material risks identified in the layers that were assessed';
  if (unknown > 0) head += ` · ${unknown} layer(s) without data`;
  return head;
}

function buildNeighbours(payload: ScanPayload): RiskMemoNeighbour[] {
  const byCat = new Map<ActivityCategory, { count: number; nearest: number; kind: string; name: string | null }>();
  for (const a of payload.activity) {
    const cur = byCat.get(a.category);
    const name = a.name && a.name !== a.kindLabel ? a.name : null;
    if (!cur) {
      byCat.set(a.category, { count: 1, nearest: a.dist, kind: kindLabelOf(a.kind), name });
      continue;
    }
    cur.count += 1;
    if (a.dist < cur.nearest) {
      cur.nearest = a.dist;
      cur.kind = kindLabelOf(a.kind);
      cur.name = name;
    }
  }
  return [...byCat.entries()]
    .map(([category, v]) => ({
      category,
      label: ACTIVITY_CATEGORIES[category].label,
      count: v.count,
      nearest: Math.round(v.nearest),
      nearestKind: v.kind,
      nearestName: v.name,
    }))
    .sort((a, b) => a.nearest - b.nearest);
}

function overallBand(entries: RiskMemoEntry[]): Band {
  const rated = entries.filter((e) => e.band !== 'unknown');
  if (!rated.length) return 'unknown';
  let top: Band = 'low';
  for (const e of rated) {
    const isAmenity = AMENITY_KEYS.includes(e.key);
    const counts = isAmenity ? BAND_RANK[e.band] >= BAND_RANK.high : true;
    if (counts && BAND_RANK[e.band] > BAND_RANK[top]) top = e.band;
  }
  const hazardUnassessed = entries.some(
    (e) => e.band === 'unknown' && !AMENITY_KEYS.includes(e.key),
  );
  if (hazardUnassessed && BAND_RANK[top] <= BAND_RANK.moderate) return 'unknown';
  return top;
}

export function buildMemo(payload: ScanPayload, opts?: { now?: string }): RiskMemo {
  const entries = VISIBLE.map((k) => entryFor(k, payload));

  const provenance: Record<MaskKind, RiskMemoProvenanceItem[]> = {
    measured: [],
    official: [],
    modeled: [],
  };
  const seen = new Set<string>();
  for (const e of entries) {
    const dedup = `${e.kind}:${e.source}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    provenance[e.kind].push({
      label: e.label,
      source: e.source,
      license: e.license,
      commercialOk: e.commercialOk,
    });
  }

  const licensingFlags = entries
    .filter((e) => !e.commercialOk)
    .map((e) => `${e.label}: ${e.license}`);

  const available = entries.filter((e) => !e.degraded).length;

  return {
    place: payload.label || `${payload.center[1].toFixed(4)}, ${payload.center[0].toFixed(4)}`,
    center: payload.center,
    zone: Boolean(payload.zone),
    generatedAt: opts?.now ?? new Date().toISOString(),
    headline: buildHeadline(entries),
    entries,
    neighbours: buildNeighbours(payload),
    provenance,
    licensingFlags,
    completeness: { available, total: entries.length },
    overall: overallBand(entries),
  };
}
