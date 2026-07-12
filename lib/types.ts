import type { ActivityCategory, Band, MaskKey, MaskKind } from './constants';
import type { MaskField } from './mask-field';

export interface Building {
  polygon: [number, number][];
  height: number;
}

export interface Road {
  path: [number, number, number][];
  width: number;
  rail: boolean;
}

export interface ActivitySource {
  lat: number;
  lon: number;
  category: ActivityCategory;
  color: [number, number, number];
  kind: string;
  kindLabel: string;
  name: string;
  radius: number;
  dist: number;
}

export interface ScanPayload {
  center: [number, number];
  radius: number;
  zone?: [number, number][];
  label: string | null;
  buildings: Building[];
  roads: Road[];
  powerLines: Road[];
  activity: ActivitySource[];
  masks: Record<MaskKey, MaskField>;
}

export interface ShareUiState {
  activeMask?: MaskKey | null;
  topView?: boolean;
  scenario2050?: boolean;
}

export interface ShareInput {
  lat?: number;
  lon?: number;
  radius?: number;
  label?: string | null;
  polygon?: [number, number][];
}

export interface ShareMeta {
  id: string;
  input: ShareInput;
  label: string | null;
  center: [number, number];
  radius: number;
  zone: [number, number][] | null;
  createdAt: string;
  ui: ShareUiState | null;
  stats: { noise: number | null; q100: number | null; pluvial: number | null };
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

export interface RiskMemoEntry {
  key: MaskKey;
  label: string;
  value: number | null;
  range: [number, number] | null;
  unit: string;
  band: Band;
  bandLabel: string;
  verdict: string;
  source: string;
  license: string;
  commercialOk: boolean;
  kind: MaskKind;
  kindLabel: string;
  degraded: boolean;
  note: string;
}

export interface RiskMemoNeighbour {
  category: ActivityCategory;
  label: string;
  count: number;
  nearest: number;
  nearestKind: string;
  nearestName: string | null;
}

export interface RiskMemoProvenanceItem {
  label: string;
  source: string;
  license: string;
  commercialOk: boolean;
}

export interface RiskMemo {
  place: string;
  center: [number, number];
  zone: boolean;
  generatedAt: string;
  headline: string;
  entries: RiskMemoEntry[];
  scenario2050: RiskMemoEntry | null;
  neighbours: RiskMemoNeighbour[];
  provenance: Record<MaskKind, RiskMemoProvenanceItem[]>;
  licensingFlags: string[];
  completeness: { available: number; total: number };
}
