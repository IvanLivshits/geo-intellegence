import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { geocode } from './lib/geo';
import { computeScan } from './lib/scan';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      lat: { type: 'string' },
      lon: { type: 'string' },
      radius: { type: 'string', default: '500' },
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
    console.log(`[геокод] ${query} → ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  } else {
    console.error(
      'Использование:\n' +
        '  npm run scan -- "адрес" [--radius 500] [--out payload.json]\n' +
        '  npm run scan -- --lat=40.4168 --lon=-3.7038 [--radius 500]',
    );
    process.exit(1);
    return;
  }

  const radius = parseInt(values.radius ?? '500', 10) || 500;
  const t0 = Date.now();
  const payload = await computeScan({ lat, lon, radius, label });
  const m = payload.masks;

  console.log(`\n[скан] ${label} · радиус ${radius} м · ${((Date.now() - t0) / 1000).toFixed(1)}с`);
  console.log(
    `  здания: ${payload.buildings.length} · дороги/ж-д: ${payload.roads.length} · активность: ${payload.activity.length}`,
  );
  console.log(`  шум:          ${m.noise.avg ?? '—'} ${m.noise.unit} (${m.noise.min ?? '—'}–${m.noise.max ?? '—'})`);
  console.log(`  воздух:       ${m.air.avg ?? '—'} ${m.air.unit}`);
  console.log(`  затопляемость: ${m.flood.avg ?? '—'}${m.flood.unit} (${m.flood.min ?? '—'}–${m.flood.max ?? '—'})`);
  console.log(`  · ${m.flood.note}`);

  if (values.out) {
    await writeFile(values.out, JSON.stringify(payload));
    console.log(`\npayload → ${values.out}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
