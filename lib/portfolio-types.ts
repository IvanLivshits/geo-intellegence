import type { Band, MaskKey } from './constants';

export const STUCK_AFTER_MINUTES = 20;

export enum ItemStatus {
  Pending = 'pending',
  Processing = 'processing',
  Ready = 'ready',
  Error = 'error',
}

export enum PortfolioStatus {
  Processing = 'processing',
  Ready = 'ready',
}

export interface DbPortfolio {
  id: string;
  name: string;
  radius: number;
  total: number;
  status: PortfolioStatus;
  created_at: string;
  finished_at: string | null;
}

export interface DbPortfolioItem {
  id: string;
  position: number;
  ref: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  status: ItemStatus;
  error: string | null;
  share_id: string | null;
  overall_band: Band | null;
  assessed: string | null;
  bands: Partial<Record<MaskKey, Band>> | null;
  vals: Partial<Record<MaskKey, number | null>> | null;
  headline: string | null;
}

export interface PendingItem extends DbPortfolioItem {
  portfolio_id: string;
  radius: number;
}
