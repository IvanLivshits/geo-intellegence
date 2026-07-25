import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { geocode } from './lib/geo';
import { computeScan } from './lib/scan';
import { buildMemo } from './lib/memo';
import { parsePortfolioCsv, portfolioToCsv, summariseMemo, type PortfolioResult } from './lib/portfolio';
import { MASK_META, RADIUS, type MaskKey } from './lib/constants';

const VISIBLE_MASKS = (Object.keys(MASK_META) as MaskKey[]).filter((k) => !MASK_META[k].hidden);

function usage(): void {
  console.error(
    'Usage:\n' +
      `  npm run scan -- "address" [--radius ${RADIUS}] [--memo] [--out payload.json]\n` +
      `  npm run scan -- --lat=40.4168 --lon=-3.7038 [--radius ${RADIUS}] [--memo]\n` +
      `  npm run scan -- --batch portfolio.csv [--radius ${RADIUS}] [--out results.csv] [--concurrency 2]\n\n` +
      '  --batch expects a CSV with an "address" column, or "lat" and "lon" columns.\n' +
      '  An optional "ref" (or "id") column is carried through to the output.',
  );
}

async function runBatch(file: string, radius: number, out: string | undefined, concurrency: number) {
  const rows = parsePortfolioCsv(await readFile(file, 'utf8'));
  console.log(`[portfolio] ${rows.length} rows · radius ${radius} m · concurrency ${concurrency}`);

  const results: PortfolioResult[] = new Array(rows.length);
  let cursor = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= rows.length) return;
      const row = rows[i];
      try {
        let { lat, lon } = row;
        if (lat == null || lon == null) {
          if (!row.address) throw new Error('no address and no coordinates');
          const loc = await geocode(row.address);
          lat = loc.lat;
          lon = loc.lon;
        }
        const payload = await computeScan({ lat, lon, radius, label: row.address ?? `${lat}, ${lon}` });
        const memo = buildMemo(payload);
        const summary = summariseMemo(memo);
        results[i] = { ...row, lat, lon, status: 'ok', ...summary };
        done++;
        console.log(
          `[portfolio] ${done}/${rows.length} · ${row.ref} · ${summary.overallBand.toUpperCase()} · ${summary.headline}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results[i] = { ...row, status: 'error', error: message };
        done++;
        console.warn(`[portfolio] ${done}/${rows.length} · ${row.ref} · FAILED · ${message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const ok = results.filter((r) => r.status === 'ok');
  const failed = results.length - ok.length;
  const byBand = new Map<string, number>();
  for (const r of ok) byBand.set(r.overallBand ?? '—', (byBand.get(r.overallBand ?? '—') ?? 0) + 1);

  console.log(`\n[portfolio] done: ${ok.length} assessed, ${failed} failed`);
  for (const [band, n] of [...byBand.entries()].sort()) console.log(`  ${band.padEnd(9)} ${n}`);

  if (out) {
    const body = out.endsWith('.json')
      ? JSON.stringify(results, null, 2)
      : portfolioToCsv(results, VISIBLE_MASKS);
    await writeFile(out, body);
    console.log(`\nresults → ${out}`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      lat: { type: 'string' },
      lon: { type: 'string' },
      radius: { type: 'string', default: String(RADIUS) },
      out: { type: 'string' },
      batch: { type: 'string' },
      memo: { type: 'boolean', default: false },
      concurrency: { type: 'string', default: '2' },
    },
  });

  const radius = parseInt(values.radius ?? '', 10) || RADIUS;

  if (values.batch) {
    await runBatch(values.batch, radius, values.out, parseInt(values.concurrency ?? '2', 10) || 2);
    process.exit(0);
    return;
  }

  let lat: number;
  let lon: number;
  let label: string;

  if (values.lat && values.lon) {
    lat = parseFloat(values.lat);
    lon = parseFloat(values.lon);
    label = `${lat}, ${lon}`;
  } else if (positionals.length) {
    const query = positionals.join(' ');
    const loc = await geocode(query);
    lat = loc.lat;
    lon = loc.lon;
    label = loc.displayName;
    console.log(`[geocode] ${query} → ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  } else {
    usage();
    process.exit(1);
    return;
  }

  const t0 = Date.now();
  const payload = await computeScan({ lat, lon, radius, label });
  const memo = buildMemo(payload);

  console.log(`\n[scan] ${label} · radius ${radius} m · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(
    `  buildings: ${payload.buildings.length} · roads/rail: ${payload.roads.length} · activity: ${payload.activity.length}`,
  );
  for (const e of memo.entries) {
    const value = e.value == null ? '—' : `${e.value} ${e.unit}`;
    console.log(`  ${e.label.padEnd(18)} ${value.padEnd(12)} ${e.bandLabel.toUpperCase()}`);
  }
  console.log(`\n  ${memo.headline}`);

  if (values.memo) {
    console.log('\n--- risk memo ---');
    for (const e of memo.entries) {
      console.log(`${e.label}: ${e.verdict}`);
      console.log(`  source: ${e.source} (${e.kindLabel}, ${e.license})`);
    }
  }

  if (values.out) {
    const body = values.out.endsWith('.csv')
      ? portfolioToCsv([{ ref: '1', address: label, lat, lon, status: 'ok', ...summariseMemo(memo) }], VISIBLE_MASKS)
      : JSON.stringify(values.memo ? { payload, memo } : payload);
    await writeFile(values.out, body);
    console.log(`\noutput → ${values.out}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
