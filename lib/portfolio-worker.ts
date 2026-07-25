import 'server-only';
import { computeScan } from './scan';
import { buildMemo } from './memo';
import { narrateMemo } from './narrate';
import { geocode } from './geo';
import { summariseMemo } from './portfolio';
import { computeShareId, metaKey, payloadKey } from './share';
import { storagePut } from './storage';
import { markItemError, markItemReady } from './portfolio-store';
import type { PendingItem } from './portfolio-types';
import type { ScanInput } from './scan';
import type { ShareMeta } from './types';

async function snapshot(
  input: ScanInput,
  payload: Awaited<ReturnType<typeof computeScan>>,
): Promise<{ id: string; createdAt: string } | null> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const id = computeShareId(input, input.label ?? null, day);
    const createdAt = new Date().toISOString();

    const meta: ShareMeta = {
      id,
      input: { lat: input.lat, lon: input.lon, radius: input.radius, label: input.label ?? null },
      ui: null,
      label: input.label ?? payload.label,
      center: payload.center,
      radius: payload.radius,
      zone: payload.zone ?? null,
      createdAt,
      stats: {
        noise: payload.masks.noise.avg,
        q100: payload.masks.q100.avg,
        pluvial: payload.masks.pluvial.avg,
      },
    };
    await storagePut(payloadKey(id), Buffer.from(JSON.stringify(payload)), 'application/json');
    await storagePut(metaKey(id), Buffer.from(JSON.stringify(meta)), 'application/json');
    return { id, createdAt };
  } catch (err) {
    console.warn(`[portfolio] snapshot failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function processItem(item: PendingItem): Promise<void> {
  try {
    let lat = item.lat;
    let lon = item.lon;
    if (lat == null || lon == null) {
      if (!item.address) throw new Error('row has neither coordinates nor an address');
      const loc = await geocode(item.address);
      lat = loc.lat;
      lon = loc.lon;
    }

    const label = item.address ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    const input: ScanInput = { lat, lon, radius: item.radius, label };
    const payload = await computeScan(input);
    const shot = await snapshot(input, payload);
    const memo = buildMemo(payload, shot ? { now: shot.createdAt } : undefined);
    const summary = summariseMemo(memo);
    const shareId = shot?.id ?? null;

    const narrative = await narrateMemo(memo).catch((err) => {
      console.warn(`[portfolio] ${item.ref} memo narration failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });

    await markItemReady(item.id, {
      lat,
      lon,
      shareId,
      overallBand: summary.overallBand,
      assessed: summary.assessed,
      bands: summary.bands,
      vals: summary.values,
      headline: summary.headline,
    });
    const memoState = narrative == null ? 'memo failed' : narrative.degraded ? 'memo (template)' : 'memo ready';
    console.log(
      `[portfolio] ${item.ref} · ${summary.overallBand}${summary.partial ? ' (partial)' : ''} · ${summary.assessed} layers · ${memoState}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markItemError(item.id, message);
    console.warn(`[portfolio] ${item.ref} failed: ${message}`);
  }
}
