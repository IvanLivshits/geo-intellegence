import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { geocode } from './lib/geo';
import { computeScan } from './lib/scan';
import { RADIUS } from './lib/constants';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      lat: { type: 'string' },
      lon: { type: 'string' },
      radius: { type: 'string', default: String(RADIUS) },
      out: { type: 'string' },
    },
  });

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
    console.error(
      'Usage:\n' +
        `  npm run scan -- "address" [--radius ${RADIUS}] [--out payload.json]\n` +
        `  npm run scan -- --lat=40.4168 --lon=-3.7038 [--radius ${RADIUS}]`,
    );
    process.exit(1);
    return;
  }

  const radius = parseInt(values.radius ?? '', 10) || RADIUS;
  const t0 = Date.now();
  const payload = await computeScan({ lat, lon, radius, label });
  const m = payload.masks;

  console.log(`\n[scan] ${label} · radius ${radius} m · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(
    `  buildings: ${payload.buildings.length} · roads/rail: ${payload.roads.length} · activity: ${payload.activity.length}`,
  );
  console.log(`  noise:      ${m.noise.avg ?? '—'} ${m.noise.unit} (${m.noise.min ?? '—'}–${m.noise.max ?? '—'})`);
  console.log(`  air:        ${m.air.avg ?? '—'} ${m.air.unit}`);
  console.log(`  flood risk: ${m.flood.avg ?? '—'}${m.flood.unit} (${m.flood.min ?? '—'}–${m.flood.max ?? '—'})`);
  console.log(`  · ${m.flood.note}`);

  if (values.out) {
    await writeFile(values.out, JSON.stringify(payload));
    console.log(`\npayload → ${values.out}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
