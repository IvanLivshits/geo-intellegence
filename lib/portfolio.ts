import { type Band, type MaskKey } from './constants';
import type { RiskMemo } from './types';

export interface PortfolioRow {
  ref: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
}

export interface PortfolioResult {
  ref: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  status: 'ok' | 'error';
  error?: string;
  overallBand?: Band;
  assessed?: string;
  bands?: Partial<Record<MaskKey, Band>>;
  values?: Partial<Record<MaskKey, number | null>>;
  headline?: string;
  shareUrl?: string;
}

const DELIMITERS = [',', ';', '\t'] as const;
type Delimiter = (typeof DELIMITERS)[number];

function sniffDelimiter(headerLine: string): Delimiter {
  let best: Delimiter = ',';
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = splitCsvLine(headerLine, d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: Delimiter): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

const HEADER_ALIASES: Record<string, string[]> = {
  ref: ['ref', 'id', 'loan_id', 'loan', 'collateral_id', 'reference', 'account'],
  address: ['address', 'addr', 'location', 'property', 'street', 'site'],
  lat: ['lat', 'latitude', 'y'],
  lon: ['lon', 'lng', 'long', 'longitude', 'x'],
};

function columnIndex(header: string[], field: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[field];
  return header.findIndex((h) => aliases.includes(h.toLowerCase().replace(/\s+/g, '_')));
}

export function parsePortfolioCsv(text: string): PortfolioRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('The portfolio file is empty');

  const delimiter = sniffDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter);
  const iRef = columnIndex(header, 'ref');
  const iAddr = columnIndex(header, 'address');
  const iLat = columnIndex(header, 'lat');
  const iLon = columnIndex(header, 'lon');

  if (iAddr < 0 && (iLat < 0 || iLon < 0)) {
    throw new Error(
      `The portfolio file needs an "address" column, or "lat" and "lon" columns. Found: ${header.join(', ')}`,
    );
  }

  const rows: PortfolioRow[] = [];
  const rejected: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const rawLat = iLat >= 0 ? parseFloat(cells[iLat]) : NaN;
    const rawLon = iLon >= 0 ? parseFloat(cells[iLon]) : NaN;
    const hasCoords = Number.isFinite(rawLat) && Number.isFinite(rawLon);
    const validCoords = hasCoords && Math.abs(rawLat) <= 90 && Math.abs(rawLon) <= 180;
    const address = iAddr >= 0 ? cells[iAddr] || null : null;

    if (hasCoords && !validCoords) {
      rejected.push(
        `row ${i + 1}: coordinates out of range (lat ${cells[iLat]}, lon ${cells[iLon]}) — WGS84 degrees expected, not a projected CRS`,
      );
      continue;
    }
    if (!address && !validCoords) continue;

    rows.push({
      ref: (iRef >= 0 && cells[iRef]) || String(i),
      address,
      lat: validCoords ? rawLat : null,
      lon: validCoords ? rawLon : null,
    });
  }
  if (!rows.length) {
    throw new Error(
      rejected.length
        ? `The portfolio file has no usable rows. ${rejected.slice(0, 3).join('; ')}`
        : 'The portfolio file has no usable rows',
    );
  }

  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  for (const r of rows) {
    const prev = seen.get(r.ref);
    if (prev != null) duplicates.push(r.ref);
    else seen.set(r.ref, 1);
  }
  if (duplicates.length) {
    const unique = [...new Set(duplicates)];
    throw new Error(
      `Duplicate ref values: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '…' : ''}. Each row must carry a unique id so results can be matched back to your book.`,
    );
  }

  if (rejected.length) {
    console.warn(`[portfolio] ${rejected.length} row(s) rejected: ${rejected.slice(0, 3).join('; ')}`);
  }

  return rows;
}

export function summariseMemo(memo: RiskMemo): {
  overallBand: Band;
  partial: boolean;
  assessed: string;
  bands: Partial<Record<MaskKey, Band>>;
  values: Partial<Record<MaskKey, number | null>>;
  headline: string;
} {
  const rated = memo.entries.filter((e) => e.band !== 'unknown');
  const unassessed = memo.entries.length - rated.length;

  const bands: Partial<Record<MaskKey, Band>> = {};
  const values: Partial<Record<MaskKey, number | null>> = {};
  for (const e of memo.entries) {
    bands[e.key] = e.band;
    values[e.key] = e.value;
  }

  return {
    overallBand: memo.overall,
    partial: unassessed > 0,
    assessed: `${rated.length}/${memo.entries.length}`,
    bands,
    values,
    headline: memo.headline,
  };
}

export function portfolioToCsv(results: PortfolioResult[], maskKeys: MaskKey[]): string {
  const header = [
    'ref',
    'address',
    'lat',
    'lon',
    'status',
    'overall_band',
    'layers_assessed',
    ...maskKeys.flatMap((k) => [`${k}_value`, `${k}_band`]),
    'headline',
    'error',
  ];
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of results) {
    lines.push(
      [
        r.ref,
        r.address ?? '',
        r.lat ?? '',
        r.lon ?? '',
        r.status,
        r.overallBand ?? '',
        r.assessed ?? '',
        ...maskKeys.flatMap((k) => [r.values?.[k] ?? '', r.bands?.[k] ?? '']),
        r.headline ?? '',
        r.error ?? '',
      ]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\n');
}
