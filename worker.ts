import {
  claimNextItem,
  finishCompletedPortfolios,
  requeueItems,
  resetStuckItems,
  touchItem,
} from './lib/portfolio-store';
import { processItem } from './lib/portfolio-worker';

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '2', 10) || 2;
const IDLE_POLL_MS = parseInt(process.env.WORKER_POLL_MS ?? '5000', 10) || 5000;
const STUCK_SWEEP_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const SHUTDOWN_GRACE_MS = 60 * 1000;

let stopping = false;
let active = 0;
const inFlight = new Set<string>();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function lane(id: number): Promise<void> {
  while (!stopping) {
    let item;
    try {
      item = await claimNextItem();
    } catch (err) {
      console.warn(`[worker:${id}] could not claim an item: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(IDLE_POLL_MS);
      continue;
    }

    if (!item) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    active++;
    inFlight.add(item.id);
    const beat = setInterval(() => {
      void touchItem(item.id).catch(() => undefined);
    }, HEARTBEAT_MS);
    try {
      await processItem(item);
    } catch (err) {
      console.warn(`[worker:${id}] item crashed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearInterval(beat);
      inFlight.delete(item.id);
      active--;
    }

    try {
      await finishCompletedPortfolios();
    } catch {
      void 0;
    }
  }
}

async function sweeper(): Promise<void> {
  while (!stopping) {
    try {
      const revived = await resetStuckItems();
      if (revived > 0) console.log(`[worker] requeued ${revived} stuck item(s)`);
      await finishCompletedPortfolios();
    } catch (err) {
      console.warn(`[worker] sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(STUCK_SWEEP_MS);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal} received — finishing ${active} in-flight item(s), then exiting`);

  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (active > 0 && Date.now() < deadline) await sleep(500);

  if (inFlight.size) {
    const abandoned = [...inFlight];
    console.warn(`[worker] requeuing ${abandoned.length} unfinished item(s) so another worker picks them up`);
    await requeueItems(abandoned).catch((err) =>
      console.error(`[worker] could not requeue: ${err instanceof Error ? err.message : String(err)}`),
    );
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function main(): Promise<void> {
  console.log(`[worker] started · concurrency ${CONCURRENCY} · poll ${IDLE_POLL_MS} ms`);
  void sweeper();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => lane(i + 1)));
}

main().catch((err) => {
  console.error(`[worker] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
