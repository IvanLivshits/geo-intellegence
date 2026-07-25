import { MASK_META, type MaskKey } from './constants';
import type { MaskField } from './mask-field';
import type { ScanPayload } from './types';

export const PAYLOAD_VERSION = 2;

type Migration = (payload: Record<string, unknown>) => Record<string, unknown>;

function placeholderMask(key: MaskKey): MaskField {
  const meta = MASK_META[key];
  return {
    n: 2,
    rgba: new Array(16).fill(0),
    avg: null,
    min: null,
    max: null,
    unit: meta.unit,
    label: meta.label,
    note: 'This layer did not exist when the snapshot was taken.',
    degraded: true,
  };
}

function migrateV0toV1(payload: Record<string, unknown>): Record<string, unknown> {
  const rawMasks = (payload.masks ?? {}) as Record<string, MaskField | undefined>;
  const masks: Record<string, MaskField> = {};

  for (const key of Object.keys(MASK_META) as MaskKey[]) {
    const field = rawMasks[key];
    masks[key] = field
      ? { ...field, unit: MASK_META[key].unit, label: MASK_META[key].label }
      : placeholderMask(key);
  }

  const dropped = Object.keys(rawMasks).filter((k) => !(k in MASK_META));
  if (dropped.length) {
    console.log(`[schema] v0 → v1: dropping retired mask(s): ${dropped.join(', ')}`);
  }

  return { ...payload, masks, version: 1 };
}

function migrateV1toV2(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, version: 2 };
}

const MIGRATIONS: Record<number, Migration> = {
  0: migrateV0toV1,
  1: migrateV1toV2,
};

export function migratePayload(raw: unknown): ScanPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Snapshot payload is not an object');
  }

  let payload = raw as Record<string, unknown>;
  let version = typeof payload.version === 'number' ? payload.version : 0;

  if (version > PAYLOAD_VERSION) {
    throw new Error(
      `Snapshot was written by a newer version of the engine (payload v${version}, this build understands v${PAYLOAD_VERSION})`,
    );
  }

  while (version < PAYLOAD_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new Error(`No migration from payload v${version} to v${version + 1}`);
    }
    payload = migrate(payload);
    version = typeof payload.version === 'number' ? payload.version : version + 1;
  }

  return payload as unknown as ScanPayload;
}
