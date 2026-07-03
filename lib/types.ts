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
  label: string | null;
  buildings: Building[];
  roads: Road[];
  activity: ActivitySource[];
  masks: Record<MaskKey, MaskField>;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}
