import type { ActivityCategory, MaskKey } from './constants';
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
