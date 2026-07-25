import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { geocode } from './lib/geo';
import { computeScan } from './lib/scan';
import { buildMemo } from './lib/memo';
import { RADIUS } from './lib/constants';

function usage(): void {
  console.error(
    'Usage:\n' +
      `  npm run scan -- "address" [--radius ${RADIUS}] [--memo] [--out payload.json]\n` +
      `  npm run scan -- --lat=40.4168 --lon=-3.7038 [--radius ${RADIUS}] [--memo]`,
  );
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      lat: { type: 'string' },
      lon: { type: 'string' },
      radius: { type: 'string', default: String(RADIUS) },
      out: { type: 'string' },
      memo: { type: 'boolean', default: false },
    },
  });

  const radius = parseInt(values.radius ?? '', 10) || RADIUS;

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
    const body = JSON.stringify(values.memo ? { payload, memo } : payload);
    await writeFile(values.out, body);
    console.log(`\noutput → ${values.out}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
