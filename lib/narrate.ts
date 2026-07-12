import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { cacheGet, cacheSet } from './cache';
import { llmEnabled, toolCall, defaultModel } from './llm';
import { BAND_RANK } from './constants';
import { reverseGeocode } from './geo';
import type { RiskMemo } from './types';

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const FALLBACK_TTL_MS = 10 * 60 * 1000;
const PARTIAL_TTL_MS = 60 * 60 * 1000;
const NARRATION_DEADLINE_MS = 100000;
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MEMORY_MAX = 200;
const MAX_TOKENS = 1600;
const WEB_SEARCH_RESULTS = 5;
const MAX_LLM_ATTEMPTS = 2;

const CoreSchema = z.strictObject({
  assessment: z
    .string()
    .min(120)
    .max(1000)
    .describe(
      'Overall assessment of the site in a single paragraph of 3-5 sentences, at most 900 characters. What drives the risk, how material it is, what it means for ownership or lending. Cover the material layers only; do not enumerate every layer. Use only the numbers supplied. Write in English.',
    ),
  drivers: z
    .array(
      z
        .string()
        .min(30)
        .max(300)
        .describe('One key driver: what the measurement shows, from which source, and what it means in practice. In English.'),
    )
    .min(1)
    .max(4)
    .describe('One to four key risk drivers, ordered by materiality.'),
});

const MitigationValueSchema = z.strictObject({
  layer: z.enum(['flood', 'pluvial', 'q100']).describe('Which modelled flood layer the evidence bears on.'),
  adjustedBand: z
    .enum(['low', 'moderate', 'high', 'severe'])
    .describe('Band you would assign AFTER accounting for the engineered defences found. May be lower than the modelled band.'),
  rationale: z
    .string()
    .min(80)
    .max(1500)
    .describe('Which flood-defence works protect this location and why they lower (or fail to lower) the modelled hazard. Name the works explicitly. English.'),
  sources: z
    .array(
      z.strictObject({
        title: z.string().min(3).max(160),
        url: z.string().min(10).max(400).describe('Full https URL actually consulted.'),
      }),
    )
    .max(4)
    .describe('Web sources evidencing the defences. Mandatory when found is true.'),
});

const MitigationSchema = MitigationValueSchema.extend({
  found: z
    .boolean()
    .describe('True only if web search produced concrete, citable evidence of flood-defence works protecting this location.'),
});

const NarrativeCacheSchema = CoreSchema.extend({
  mitigation: MitigationValueSchema.nullable(),
  model: z.string().nullable(),
  degraded: z.boolean(),
});

type NarrativeCore = z.infer<typeof CoreSchema>;
type Mitigation = z.infer<typeof MitigationValueSchema>;

export interface MemoNarrative extends NarrativeCore {
  mitigation: Mitigation | null;
  model: string | null;
  degraded: boolean;
}

const CORE_PARAMS = z.toJSONSchema(CoreSchema, { target: 'draft-7' }) as Record<string, unknown>;
const MITIGATION_PARAMS = z.toJSONSchema(MitigationSchema, { target: 'draft-7' }) as Record<string, unknown>;

const SYSTEM = `You are a property risk assessor. Write dry, factual prose, as in a professional report for a bank or an insurer. Always write in English.

IRON RULE: you are NOT a source of numbers. Every figure has already been computed and handed to you in the input. You are FORBIDDEN to:
- invent any number, percentage, monetary amount, probability or date that is not in the input;
- estimate financial damage, property value or insurance premiums — you have no such data;
- add any fact about the property that is not in the input (storeys, age, construction, price).

You may: restate the supplied values, explain what they mean, rank them by materiality, name the source type (official dataset / observation / model), and speak about uncertainty.
Never state a dataset's spatial resolution or any other figure that is not literally present in the input.
Never name a city, region or country that is not present in the input — the address alone does not tell you the city. Refer to "the site" instead.

Structure and length are fixed by the tool schema — follow them strictly: reports must be uniform.
Style: no filler, no marketing, no emoji, no addressing the reader. State the fact, then the consequence. If a layer has no data, say so; do not speculate.`;

const MITIGATION_SYSTEM = `You are a flood-risk analyst verifying a modelled hazard against reality. Always answer in English.

Context: the flood layers in this report are terrain models. They do NOT account for engineered flood defences — diversion channels, levees, dams, storm drainage, pumping stations. A modelled "severe" band can therefore be a false positive for a site that is in fact well protected, which misleads an assessor.

Your job: use web search to establish what flood-defence infrastructure actually protects the site at the given coordinates, and judge whether the modelled band should be revised down.

Rules:
- The authoritative location is the one given to you as VERIFIED LOCATION, derived from the coordinates. The street name is NOT evidence of a city — never infer the city from it, and never search or cite works for any other city.
- Search first, scoping every query to the VERIFIED LOCATION. Base every statement on sources you actually consulted, and return their real URLs.
- Set found = true ONLY with concrete, citable evidence about named works protecting this specific location (e.g. a named diversion channel, a named dam, a documented drainage scheme).
- No evidence, or only generic material → found = false, sources = [], adjustedBand = the modelled band, rationale = one sentence saying no citable defences were found.
- Never invent works. Never cite a URL you did not read. Never lower a band on speculation.
- If the works exist but are known to have failed or to be insufficient, say so and do NOT lower the band.
- Name the works explicitly and state what they are designed to handle.`;

function memoFacts(memo: RiskMemo): string {
  const lines: string[] = [];
  lines.push(`Site: ${memo.place}`);
  lines.push(`Coordinates: ${memo.center[1].toFixed(5)}, ${memo.center[0].toFixed(5)}`);
  lines.push(`Assessed area: ${memo.zone ? 'user-drawn site outline' : 'scan radius around the point'}`);
  lines.push(`Layers assessed: ${memo.completeness.available} of ${memo.completeness.total}`);
  lines.push('');
  lines.push('RISK LAYERS (value | band | source type | source | engine verdict):');
  for (const e of memo.entries) {
    const value =
      e.value == null
        ? 'no value'
        : `${e.value}${e.range ? ` (range ${e.range[0]}–${e.range[1]})` : ''} ${e.unit}`;
    lines.push(
      `- ${e.label}: ${value} | band: ${e.bandLabel} | ${e.kindLabel} | ${e.source} | ${e.verdict}${e.degraded ? ' | DATA UNAVAILABLE' : ''}`,
    );
  }
  if (memo.scenario2050) {
    const s = memo.scenario2050;
    lines.push('');
    lines.push(
      `CLIMATE SCENARIO 2050 (RCP 8.5): ${s.value == null ? 'no value' : `${s.value} ${s.unit}`} | band: ${s.bandLabel} | ${s.source} | ${s.verdict}`,
    );
  }
  if (memo.neighbours.length) {
    lines.push('');
    lines.push('NEIGHBOURHOOD:');
    for (const nb of memo.neighbours) {
      lines.push(`- ${nb.label}: ${nb.count} total, nearest at ${nb.nearest} m`);
    }
  }
  return lines.join('\n');
}

const NUM_RE = /\d+(?:[.,]\d+)?/g;

function numbersIn(text: string): string[] {
  return (text.match(NUM_RE) ?? []).map((n) => n.replace(',', '.'));
}

function allowedNumbers(memo: RiskMemo, facts: string): Set<string> {
  const allowed = new Set<string>(numbersIn(facts));
  for (const n of numbersIn(memo.place)) allowed.add(n);
  return allowed;
}

function inventedNumbers(core: NarrativeCore, allowed: Set<string>): string[] {
  const text = [core.assessment, ...core.drivers].join(' ');
  return numbersIn(text).filter((n) => !allowed.has(n));
}

function fallback(memo: RiskMemo): MemoNarrative {
  const material = memo.entries.filter((e) => e.band === 'severe' || e.band === 'high');
  return {
    assessment: memo.headline,
    drivers: (material.length ? material : memo.entries.slice(0, 3)).map(
      (e) =>
        `${e.label}: ${e.value == null ? '—' : `${e.value} ${e.unit}`} — ${e.verdict} Source: ${e.source} (${e.kindLabel}).`,
    ),
    mitigation: null,
    model: null,
    degraded: true,
  };
}

type MitigationOutcome = { status: 'found'; value: Mitigation } | { status: 'none' } | { status: 'failed' };

async function fetchMitigation(memo: RiskMemo, model: string): Promise<MitigationOutcome> {
  const floodLayers = memo.entries.filter(
    (e) => (e.key === 'flood' || e.key === 'pluvial' || e.key === 'q100') && (e.band === 'high' || e.band === 'severe'),
  );
  if (!floodLayers.length) return { status: 'none' };
  const flagged = new Map(floodLayers.map((e) => [e.key as string, e.band]));

  const modelled = floodLayers
    .map((e) => `- ${e.label} (${e.key}): ${e.value ?? '—'} ${e.unit}, modelled band ${e.bandLabel} — ${e.verdict}`)
    .join('\n');

  try {
    const place = await reverseGeocode(memo.center[1], memo.center[0]);
    if (!place) {
      console.warn('[narrative] mitigation skipped: could not verify the location from coordinates');
      return { status: 'failed' };
    }

    const { result } = await toolCall<unknown>({
      model,
      system: MITIGATION_SYSTEM,
      user: `VERIFIED LOCATION (from coordinates, authoritative): ${place}
Coordinates: ${memo.center[1].toFixed(5)}, ${memo.center[0].toFixed(5)}
Street label (NOT evidence of the city, ignore for locating): ${memo.place}

Modelled flood hazard that ignores engineered defences:
${modelled}

Search the web for the flood-defence infrastructure that protects ${place}, then decide whether the modelled band should be revised down. Do not cite works from any other city.`,
      toolName: 'flood_defence_check',
      toolDescription: 'Verify a modelled flood hazard against real engineered flood defences found on the web.',
      parameters: MITIGATION_PARAMS,
      maxTokens: MAX_TOKENS,
      temperature: 0.1,
      webSearch: WEB_SEARCH_RESULTS,
      label: 'flood-defence',
    });

    const parsed = MitigationSchema.safeParse(result);
    if (!parsed.success) {
      console.warn(
        `[narrative] mitigation rejected by schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
      return { status: 'failed' };
    }
    if (!parsed.data.found) {
      console.log('[narrative] mitigation: no citable flood defences found');
      return { status: 'none' };
    }
    const sources = parsed.data.sources.filter((s) => /^https?:\/\//i.test(s.url.trim()));
    if (!sources.length) {
      console.warn('[narrative] mitigation dropped: no verifiable source URLs');
      return { status: 'failed' };
    }

    const modelledBand = flagged.get(parsed.data.layer);
    if (!modelledBand) {
      console.warn(
        `[narrative] mitigation dropped: layer "${parsed.data.layer}" was never flagged as high/severe`,
      );
      return { status: 'failed' };
    }
    if (BAND_RANK[parsed.data.adjustedBand] > BAND_RANK[modelledBand]) {
      console.warn(
        `[narrative] mitigation dropped: model tried to RAISE ${parsed.data.layer} from ${modelledBand} to ${parsed.data.adjustedBand}`,
      );
      return { status: 'failed' };
    }

    const { found: _found, ...rest } = parsed.data;
    console.log(`[narrative] mitigation: ${rest.layer} ${modelledBand} → ${rest.adjustedBand} (${sources.length} sources)`);
    return { status: 'found', value: { ...rest, sources } };
  } catch (err) {
    console.warn(`[narrative] mitigation unavailable (${err instanceof Error ? err.message : String(err)})`);
    return { status: 'failed' };
  }
}

function cacheKey(memo: RiskMemo, model: string): string {
  const canonical = JSON.stringify({
    v: 7,
    place: memo.place,
    center: memo.center.map((c) => c.toFixed(5)),
    zone: memo.zone,
    entries: memo.entries.map((e) => [e.key, e.value, e.band, e.degraded]),
    s2050: memo.scenario2050?.value ?? null,
    neighbours: memo.neighbours.map((n) => [n.category, n.count, n.nearest]),
    model,
  });
  return 'narrative:' + createHash('sha1').update(canonical).digest('hex');
}

const memoryCache = new Map<string, { value: MemoNarrative; expires: number }>();
const inflight = new Map<string, Promise<MemoNarrative>>();

function validCached(value: unknown): MemoNarrative | null {
  const parsed = NarrativeCacheSchema.safeParse(value);
  if (!parsed.success) {
    console.warn('[narrative] cached entry has an unexpected shape — discarding it');
    return null;
  }
  return parsed.data;
}

function memoryGet(key: string): MemoNarrative | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  memoryCache.delete(key);
  memoryCache.set(key, hit);
  return hit.value;
}

function memorySet(key: string, value: MemoNarrative): void {
  if (memoryCache.size >= MEMORY_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { value, expires: Date.now() + MEMORY_TTL_MS });
}

export function narrateMemo(memo: RiskMemo): Promise<MemoNarrative> {
  if (!llmEnabled()) return Promise.resolve(fallback(memo));

  const model = defaultModel();
  const key = cacheKey(memo, model);

  const local = memoryGet(key);
  if (local) {
    console.log('[narrative] cache hit ✓ memory');
    return Promise.resolve(local);
  }

  const running = inflight.get(key);
  if (running) {
    console.log('[narrative] request already in flight — reusing result');
    return running;
  }

  const task = Promise.race([
    generate(memo, key, model),
    new Promise<MemoNarrative>((resolve) =>
      setTimeout(() => {
        console.warn(`[narrative] overall deadline of ${NARRATION_DEADLINE_MS} ms hit — deterministic fallback`);
        resolve(fallback(memo));
      }, NARRATION_DEADLINE_MS),
    ),
  ]);
  inflight.set(key, task);
  task.finally(() => inflight.delete(key)).catch(() => undefined);
  return task;
}

async function generate(memo: RiskMemo, key: string, model: string): Promise<MemoNarrative> {
  const cachedRaw = await cacheGet<unknown>(key);
  const cached = cachedRaw != null ? validCached(cachedRaw) : null;
  if (cached != null) {
    console.log('[narrative] cache hit ✓ Redis');
    memorySet(key, cached);
    return cached;
  }

  const facts = memoFacts(memo);
  const allowed = allowedNumbers(memo, facts);
  const baseUser = `Write an assessor's conclusion for this site. Use ONLY the data below.\n\n${facts}`;

  const mitigationPromise = fetchMitigation(memo, model);

  let core: NarrativeCore | null = null;
  try {
    let correction = '';
    for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS && !core; attempt++) {
      const { result } = await toolCall<unknown>({
        model,
        system: SYSTEM,
        user: baseUser + correction,
        toolName: 'risk_assessment',
        toolDescription: 'Risk assessor conclusion for a property, based strictly on the supplied measurements.',
        parameters: CORE_PARAMS,
        maxTokens: MAX_TOKENS,
        temperature: 0.2,
        label: attempt === 1 ? 'risk-memo' : 'risk-memo-retry',
      });

      const parsed = CoreSchema.safeParse(result);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ');
        console.warn(`[narrative] attempt ${attempt} rejected by schema: ${issues}`);
        correction = `\n\nYour previous answer was rejected: ${issues}. Fix it exactly.`;
        continue;
      }

      const invented = inventedNumbers(parsed.data, allowed);
      if (invented.length) {
        console.warn(`[narrative] attempt ${attempt} rejected: numbers absent from input (${invented.join(', ')})`);
        correction = `\n\nYour previous answer was rejected: the assessment and drivers contained numbers absent from the input (${invented.join(', ')}). Use ONLY numbers present in the data above. Do not mention dataset resolutions.`;
        continue;
      }

      core = parsed.data;
    }
  } catch (err) {
    console.warn(`[narrative] LLM unavailable (${err instanceof Error ? err.message : String(err)})`);
  }

  const outcome = await mitigationPromise;
  const mitigation = outcome.status === 'found' ? outcome.value : null;

  if (!core) {
    console.warn('[narrative] core rejected — deterministic fallback');
    const degradedNarrative: MemoNarrative = { ...fallback(memo), mitigation };
    memorySet(key, degradedNarrative);
    await cacheSet(key, degradedNarrative, FALLBACK_TTL_MS);
    return degradedNarrative;
  }

  const narrative: MemoNarrative = { ...core, mitigation, model, degraded: false };
  const ttl = outcome.status === 'failed' ? PARTIAL_TTL_MS : CACHE_TTL_MS;
  memorySet(key, narrative);
  await cacheSet(key, narrative, ttl);
  return narrative;
}
