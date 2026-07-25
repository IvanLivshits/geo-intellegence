import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { cacheGet, cacheSet } from './cache';
import { llmEnabled, toolCall, defaultModel } from './llm';
import { BAND_RANK } from './constants';
import { reverseGeocode } from './geo';
import { Locale, parseLocale } from './locale';
import type { RiskMemo } from './types';

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const FALLBACK_TTL_MS = 10 * 60 * 1000;
const PARTIAL_TTL_MS = 60 * 60 * 1000;
const NARRATION_DEADLINE_MS = parseInt(process.env.NARRATION_DEADLINE_MS ?? '', 10) || 100000;
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MEMORY_MAX = 200;
const MAX_TOKENS = 1600;
const WEB_SEARCH_RESULTS = 5;
const MAX_LLM_ATTEMPTS = 2;

export async function resolveReportLocale(
  lat: number,
  lon: number,
  langParam: string | null | undefined,
): Promise<{ locale: Locale; place: string | null }> {
  const place = await reverseGeocode(lat, lon);
  return { locale: parseLocale(langParam) ?? localeFor(place), place };
}

function langLabel(locale: Locale): string {
  if (locale === Locale.Es) return 'Spanish (es-ES)';
  if (locale === Locale.Ru) return 'Russian';
  return 'English';
}

function buildCoreSchema(locale: Locale) {
  const lang = langLabel(locale);
  return z.strictObject({
    verdict: z
      .string()
      .min(40)
      .max(240)
      .describe(
        `The single bottom-line conclusion in ONE plain sentence that a non-expert — even a child — grasps at a glance: is this an ordinary, safe place or is there something to worry about, and the gist of why. Must agree with the OVERALL RISK level supplied in the input. No jargon, no dataset names, no numbers. Write in ${lang}.`,
      ),
    assessment: z
      .string()
      .min(120)
      .max(1000)
      .describe(
        `Overall assessment of the site in a single paragraph of 3-5 sentences, at most 900 characters. State how material the risk is and what drives it. Match tone to evidence: when the assessed layers are only low or moderate, state plainly that the site carries no material environmental risk in the layers assessed — do NOT manufacture concern, hedge, or imply hidden danger. Cover the material layers only; do not enumerate every layer. Use only the numbers supplied. Write in ${lang}.`,
      ),
    drivers: z
      .array(
        z
          .string()
          .min(30)
          .max(300)
          .describe(
            `A single plain sentence (a STRING, never an object): what the measurement shows, from which source, and what it means in practice. In ${lang}.`,
          ),
      )
      .min(1)
      .max(4)
      .describe(
        'One to four key risk drivers, ordered by materiality. If no material risks exist, give the one or two most relevant layers and why they are not a concern.',
      ),
    implication: z
      .string()
      .min(40)
      .max(280)
      .describe(
        `A single sentence on what the assessment means for a lender or insurer, in QUALITATIVE terms only — e.g. routine, warrants closer underwriting review, may affect insurability. NEVER state or estimate a premium, loan amount, percentage or property value. When the risk is low, say the site poses no unusual concern for lending or insurance. In ${lang}.`,
      ),
  });
}

function buildMitigationValueSchema(locale: Locale) {
  const lang = langLabel(locale);
  return z.strictObject({
    layer: z
      .enum(['flood', 'pluvial', 'q100', 'coastal'])
      .describe('Which modelled flood layer the evidence bears on.'),
    adjustedBand: z
      .enum(['low', 'moderate', 'high', 'severe'])
      .describe('Band you would assign AFTER accounting for the engineered defences found. May be lower than the modelled band.'),
    rationale: z
      .string()
      .min(80)
      .max(1500)
      .describe(`Which flood-defence works protect this location and why they lower (or fail to lower) the modelled hazard. Name the works explicitly. ${lang}.`),
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
}

function buildMitigationSchema(locale: Locale) {
  return buildMitigationValueSchema(locale).extend({
    found: z
      .boolean()
      .describe('True only if web search produced concrete, citable evidence of flood-defence works protecting this location.'),
  });
}

const CoreSchema = buildCoreSchema(Locale.En);
const MitigationValueSchema = buildMitigationValueSchema(Locale.En);
const MitigationSchema = buildMitigationSchema(Locale.En);

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

const CORE_PARAMS: Record<Locale, Record<string, unknown>> = {
  [Locale.En]: z.toJSONSchema(CoreSchema, { target: 'draft-7' }) as Record<string, unknown>,
  [Locale.Es]: z.toJSONSchema(buildCoreSchema(Locale.Es), { target: 'draft-7' }) as Record<string, unknown>,
  [Locale.Ru]: z.toJSONSchema(buildCoreSchema(Locale.Ru), { target: 'draft-7' }) as Record<string, unknown>,
};
const MITIGATION_PARAMS: Record<Locale, Record<string, unknown>> = {
  [Locale.En]: z.toJSONSchema(MitigationSchema, { target: 'draft-7' }) as Record<string, unknown>,
  [Locale.Es]: z.toJSONSchema(buildMitigationSchema(Locale.Es), { target: 'draft-7' }) as Record<string, unknown>,
  [Locale.Ru]: z.toJSONSchema(buildMitigationSchema(Locale.Ru), { target: 'draft-7' }) as Record<string, unknown>,
};

const SYSTEM_EN = `You are a property risk assessor. Write dry, factual prose, as in a professional report for a bank or an insurer. Always write in English.

IRON RULE: you are NOT a source of numbers. Every figure has already been computed and handed to you in the input. You are FORBIDDEN to:
- invent any number, percentage, monetary amount, probability or date that is not in the input;
- estimate financial damage, property value or insurance premiums — you have no such data;
- add any fact about the property that is not in the input (storeys, age, construction).

PROPORTIONALITY — do not be alarmist. Your tone must match the evidence, never default to caution. When the assessed layers are low or moderate, state plainly that the site carries no material environmental risk in the layers assessed; do not manufacture concern, hedge, or imply hidden danger. Reserve cautionary language for layers actually banded high or severe. A "moderate" band is ordinary urban background, not a warning. A layer marked DATA UNAVAILABLE is simply not assessed — never present it as if it were a risk.

VERDICT: the 'verdict' field is the headline a layperson reads first — one plain sentence, no numbers or dataset names, and it must match the OVERALL RISK level supplied. Everything else explains and backs it up.

You may: restate the supplied values, explain what they mean, rank them by materiality, name the source type (official dataset / observation / model), and speak about uncertainty.
Never state a dataset's spatial resolution or any other figure that is not literally present in the input.
LOCATION: the street label in the input is NOT evidence of the city — a street name repeats across many towns. Never name, infer or imply any city, region or country that is not explicitly present in the input. Refer to "the site" instead.
Lending/insurance: keep any such implication qualitative (routine / warrants closer review / may affect insurability). Never state or estimate a premium, loan amount or value.

Structure and length are fixed by the tool schema — follow them strictly: reports must be uniform.
Style: no filler, no marketing, no emoji, no addressing the reader. State the fact, then the consequence. If a layer has no data, say so; do not speculate.`;

const SYSTEM_ES = `Eres un tasador de riesgos inmobiliarios. Redacta en prosa sobria y factual, como en un informe profesional para un banco o una aseguradora. Escribe siempre en español (es-ES).

REGLA DE HIERRO: no eres una fuente de números. Cada cifra ya ha sido calculada y se te ha entregado en la entrada. Tienes PROHIBIDO:
- inventar cualquier número, porcentaje, importe monetario, probabilidad o fecha que no figure en la entrada;
- estimar daños económicos, valor del inmueble o primas de seguro — no dispones de tales datos;
- añadir cualquier dato sobre el inmueble que no figure en la entrada (número de plantas, antigüedad, construcción).

PROPORCIONALIDAD — no seas alarmista. Tu tono debe ajustarse a la evidencia, nunca por defecto a la cautela. Cuando las capas evaluadas son bajas o moderadas, indica con claridad que el emplazamiento no presenta riesgo ambiental material en las capas evaluadas; no generes preocupación, no titubees ni insinúes un peligro oculto. Reserva el lenguaje de advertencia para las capas realmente clasificadas como alta o severa. Una banda "moderada" es fondo urbano ordinario, no una advertencia. Una capa marcada DATA UNAVAILABLE simplemente no se ha evaluado — nunca la presentes como si fuera un riesgo.

VEREDICTO: el campo 'verdict' es el titular que lee primero un no experto — una sola frase clara, sin cifras ni nombres de conjuntos de datos, y debe coincidir con el NIVEL DE RIESGO GENERAL aportado. El resto lo explica y lo respalda.

Puedes: reformular los valores aportados, explicar qué significan, ordenarlos por materialidad, nombrar el tipo de fuente (conjunto de datos oficial / observación / modelo) y hablar de la incertidumbre.
Nunca indiques la resolución espacial de un conjunto de datos ni ninguna otra cifra que no esté literalmente presente en la entrada.
UBICACIÓN: la etiqueta de la calle en la entrada NO es prueba de la ciudad — un nombre de calle se repite en muchas localidades. Nunca nombres, infieras ni insinúes una ciudad, región o país que no esté explícitamente presente en la entrada. Refiérete a "el emplazamiento" en su lugar.
Préstamo/seguro: mantén cualquier implicación de este tipo en términos cualitativos (rutinario / requiere revisión más detallada / puede afectar a la asegurabilidad). Nunca indiques ni estimes una prima, importe de préstamo o valor.

La estructura y la extensión están fijadas por el esquema de la herramienta — respétalas estrictamente: los informes deben ser uniformes.
Estilo: sin relleno, sin marketing, sin emojis, sin dirigirte al lector. Enuncia el hecho y luego la consecuencia. Si una capa no tiene datos, dilo; no especules.`;

const SYSTEM_RU = `Ты оценщик рисков недвижимости. Пиши сухой фактологической прозой, как в профессиональном отчёте для банка или страховой компании. Всегда пиши на русском языке.

ЖЕЛЕЗНОЕ ПРАВИЛО: ты НЕ источник чисел. Каждая цифра уже вычислена и передана тебе во входных данных. Тебе ЗАПРЕЩЕНО:
- выдумывать любое число, процент, денежную сумму, вероятность или дату, которых нет во входных данных;
- оценивать финансовый ущерб, стоимость объекта или страховые премии — у тебя нет таких данных;
- добавлять любой факт об объекте, которого нет во входных данных (этажность, возраст, конструкция).

СОРАЗМЕРНОСТЬ — не нагнетай. Тон должен соответствовать доказательствам, а не по умолчанию склоняться к осторожности. Когда оценённые слои низкие или умеренные, прямо укажи, что площадка не несёт материального экологического риска в оценённых слоях; не создавай беспокойства, не увиливай и не намекай на скрытую опасность. Предостерегающие формулировки оставь для слоёв, реально отнесённых к высоким или тяжёлым. Полоса «умеренно» — это обычный городской фон, а не предупреждение. Слой, помеченный DATA UNAVAILABLE, просто не оценивался — никогда не подавай его как риск.

ВЕРДИКТ: поле 'verdict' — это заголовок, который неспециалист читает первым: одна простая фраза, без цифр и названий наборов данных, и она должна соответствовать переданному ОБЩЕМУ УРОВНЮ РИСКА. Всё остальное поясняет и подкрепляет её.

Ты можешь: пересказывать переданные значения, объяснять, что они означают, ранжировать их по существенности, называть тип источника (официальный набор данных / наблюдение / модель) и говорить о неопределённости.
Никогда не указывай пространственное разрешение набора данных или любую другую цифру, которой буквально нет во входных данных.
МЕСТОПОЛОЖЕНИЕ: название улицы во входных данных НЕ является доказательством города — название улицы повторяется во многих населённых пунктах. Никогда не называй, не выводи и не подразумевай город, регион или страну, которых явно нет во входных данных. Вместо этого говори «площадка».
Кредит/страхование: любую такую импликацию держи качественной (рутинно / требует более детальной проверки / может повлиять на страхуемость). Никогда не указывай и не оценивай премию, сумму кредита или стоимость.

Структура и объём заданы схемой инструмента — строго соблюдай их: отчёты должны быть единообразными.
Стиль: без воды, без маркетинга, без эмодзи, без обращения к читателю. Сначала факт, затем следствие. Если у слоя нет данных, так и скажи; не домысливай.`;

const SYSTEM: Record<Locale, string> = {
  [Locale.En]: SYSTEM_EN,
  [Locale.Es]: SYSTEM_ES,
  [Locale.Ru]: SYSTEM_RU,
};

const MITIGATION_SYSTEM_EN = `You are a flood-risk analyst verifying a modelled hazard against reality. Always answer in English.

Context: the flood layers in this report are terrain models. They do NOT account for engineered flood defences — diversion channels, levees, dams, storm drainage, pumping stations, sea walls and storm-surge barriers. A modelled "severe" band can therefore be a false positive for a site that is in fact well protected, which misleads an assessor.

Your job: use web search to establish what flood-defence infrastructure actually protects the site at the given coordinates, and judge whether the modelled band should be revised down.

Rules:
- The authoritative location is the one given to you as VERIFIED LOCATION, derived from the coordinates. The street name is NOT evidence of a city — never infer the city from it, and never search or cite works for any other city.
- Search first, scoping every query to the VERIFIED LOCATION. Base every statement on sources you actually consulted, and return their real URLs.
- Set found = true ONLY with concrete, citable evidence about named works protecting this specific location (e.g. a named diversion channel, a named dam, a documented drainage scheme).
- No evidence, or only generic material → found = false, sources = [], adjustedBand = the modelled band, rationale = one sentence saying no citable defences were found.
- Never invent works. Never cite a URL you did not read. Never lower a band on speculation.
- If the works exist but are known to have failed or to be insufficient, say so and do NOT lower the band.
- Name the works explicitly and state what they are designed to handle.`;

const MITIGATION_SYSTEM_ES = `Eres un analista de riesgo de inundación que verifica un peligro modelizado frente a la realidad. Responde siempre en español (es-ES).

Contexto: las capas de inundación de este informe son modelos de terreno. NO tienen en cuenta las defensas de inundación construidas — canales de desvío, diques, presas, drenaje pluvial, estaciones de bombeo, muros costeros y barreras contra marejadas. Por tanto, una banda modelizada "severa" puede ser un falso positivo para un emplazamiento que en realidad está bien protegido, lo que induce a error al tasador.

Tu tarea: usa la búsqueda web para establecer qué infraestructura de defensa contra inundaciones protege realmente el emplazamiento en las coordenadas dadas, y juzga si la banda modelizada debería revisarse a la baja.

Reglas:
- La ubicación autorizada es la que se te da como UBICACIÓN VERIFICADA, derivada de las coordenadas. El nombre de la calle NO es prueba de una ciudad — nunca infieras la ciudad a partir de él, y nunca busques ni cites obras de ninguna otra ciudad.
- Busca primero, acotando cada consulta a la UBICACIÓN VERIFICADA. Basa cada afirmación en fuentes que hayas consultado realmente y devuelve sus URLs reales.
- Marca found = true SOLO con pruebas concretas y citables sobre obras con nombre que protejan este emplazamiento concreto (p. ej., un canal de desvío con nombre, una presa con nombre, un plan de drenaje documentado).
- Sin pruebas, o solo material genérico → found = false, sources = [], adjustedBand = la banda modelizada, rationale = una frase indicando que no se hallaron defensas citables.
- Nunca inventes obras. Nunca cites una URL que no hayas leído. Nunca rebajes una banda por especulación.
- Si las obras existen pero se sabe que han fallado o son insuficientes, indícalo y NO rebajes la banda.
- Nombra las obras explícitamente e indica para qué están diseñadas.`;

const MITIGATION_SYSTEM_RU = `Ты аналитик риска затопления, проверяющий смоделированную опасность на соответствие реальности. Всегда отвечай на русском языке.

Контекст: слои затопления в этом отчёте — модели рельефа. Они НЕ учитывают инженерные защитные сооружения — отводные каналы, дамбы, плотины, ливневую канализацию, насосные станции, морские стены и барьеры от штормового нагона. Поэтому смоделированная «тяжёлая» полоса может быть ложным срабатыванием для площадки, которая на деле хорошо защищена, что вводит оценщика в заблуждение.

Твоя задача: с помощью веб-поиска установить, какая инфраструктура защиты от затопления реально защищает площадку по заданным координатам, и решить, следует ли снизить смоделированную полосу.

Правила:
- Авторитетное местоположение — это то, что дано тебе как ПРОВЕРЕННОЕ МЕСТОПОЛОЖЕНИЕ, выведенное из координат. Название улицы НЕ является доказательством города — никогда не выводи город из него и никогда не ищи и не цитируй сооружения для другого города.
- Сначала ищи, ограничивая каждый запрос ПРОВЕРЕННЫМ МЕСТОПОЛОЖЕНИЕМ. Основывай каждое утверждение на источниках, которые ты действительно просмотрел, и возвращай их реальные URL.
- Ставь found = true ТОЛЬКО при конкретных, цитируемых доказательствах о поименованных сооружениях, защищающих именно эту площадку (например, названный отводной канал, названная плотина, документированная схема дренажа).
- Нет доказательств или только общий материал → found = false, sources = [], adjustedBand = смоделированная полоса, rationale = одна фраза о том, что цитируемых защит не найдено.
- Никогда не выдумывай сооружения. Никогда не цитируй URL, который не читал. Никогда не снижай полосу на основе домыслов.
- Если сооружения существуют, но известно, что они отказали или недостаточны, укажи это и НЕ снижай полосу.
- Называй сооружения явно и указывай, на что они рассчитаны.`;

const MITIGATION_SYSTEM: Record<Locale, string> = {
  [Locale.En]: MITIGATION_SYSTEM_EN,
  [Locale.Es]: MITIGATION_SYSTEM_ES,
  [Locale.Ru]: MITIGATION_SYSTEM_RU,
};

const MITIGATION_SEARCH_PROMPT_ES = `Se ha realizado una búsqueda web. Incorpora los siguientes resultados de búsqueda web en tu respuesta, redactada en español. IMPORTANTE: cítalos mediante enlaces markdown nombrados con el dominio de la fuente. Ejemplo: [example.com](https://example.com/pagina).`;

const SPAIN_RE = /\b(spain|españa|espanya|espagne|spanien)\b/i;

function localeFor(place: string | null): Locale {
  return place && SPAIN_RE.test(place) ? Locale.Es : Locale.En;
}

function coerceDrivers(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.drivers)) return raw;
  const drivers = obj.drivers.map((d) => {
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object') {
      const parts = Object.values(d as Record<string, unknown>)
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());
      if (parts.length) return parts.join(' — ');
    }
    return d;
  });
  return { ...obj, drivers };
}

function memoFacts(memo: RiskMemo): string {
  const lines: string[] = [];
  lines.push(`Site: ${memo.place}`);
  lines.push(`Coordinates: ${memo.center[1].toFixed(5)}, ${memo.center[0].toFixed(5)}`);
  lines.push(`Assessed area: ${memo.zone ? 'user-drawn site outline' : 'scan radius around the point'}`);
  lines.push(`Layers assessed: ${memo.completeness.available} of ${memo.completeness.total}`);
  const overallLabel =
    memo.overall === 'unknown'
      ? 'NOT FULLY ASSESSED — one or more hazard layers returned no data, so overall risk is undetermined; do NOT call the site low-risk'
      : memo.overall;
  lines.push(
    `OVERALL RISK (engine, materiality-weighted — amenity layers such as noise and air quality only raise it when high or severe): ${overallLabel}`,
  );
  lines.push('');
  lines.push('RISK LAYERS (value | band | source type | source | engine verdict):');
  for (const e of memo.entries) {
    const value =
      e.value == null
        ? 'no value'
        : `${e.value}${e.range ? ` (range ${e.range[0]}–${e.range[1]})` : ''} ${e.unit}`;
    lines.push(
      `- ${e.label}: ${value} | band: ${e.bandLabel} | ${e.kindLabel} | ${e.source} | ${e.verdict}${e.note ? ` | ${e.note}` : ''}${e.degraded ? ' | DATA UNAVAILABLE' : ''}`,
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
  const text = [core.verdict, core.assessment, core.implication, ...core.drivers].join(' ');
  return numbersIn(text).filter((n) => !allowed.has(n));
}

function fallback(memo: RiskMemo): MemoNarrative {
  const material = memo.entries.filter((e) => e.band === 'severe' || e.band === 'high');
  const verdict =
    memo.overall === 'unknown'
      ? 'This site could not be fully assessed — one or more hazard layers returned no data, so overall risk is undetermined.'
      : memo.overall === 'severe' || memo.overall === 'high'
        ? 'This site carries a notable environmental risk — review the flagged layers below.'
        : memo.overall === 'moderate'
          ? 'This site is broadly ordinary, with one or two moderate factors and no serious hazards.'
          : 'This is an ordinary, low-risk site with no material environmental hazards in the layers assessed.';
  return {
    verdict,
    assessment: memo.headline,
    drivers: (material.length ? material : memo.entries.slice(0, 3)).map(
      (e) =>
        `${e.label}: ${e.value == null ? '—' : `${e.value} ${e.unit}`} — ${e.verdict} Source: ${e.source} (${e.kindLabel}).`,
    ),
    implication: material.length
      ? 'Material environmental exposure is present; a lender or insurer would typically review the flagged layers before proceeding.'
      : 'No material environmental exposure was found in the assessed layers, so the site poses no unusual concern for lending or insurance.',
    mitigation: null,
    model: null,
    degraded: true,
  };
}

type MitigationOutcome = { status: 'found'; value: Mitigation } | { status: 'none' } | { status: 'failed' };

async function fetchMitigation(
  memo: RiskMemo,
  model: string,
  place: string | null,
  locale: Locale,
): Promise<MitigationOutcome> {
  const floodLayers = memo.entries.filter(
    (e) =>
      (e.key === 'flood' || e.key === 'pluvial' || e.key === 'q100' || e.key === 'coastal') &&
      (e.band === 'high' || e.band === 'severe'),
  );
  if (!floodLayers.length) return { status: 'none' };
  const flagged = new Map(floodLayers.map((e) => [e.key as string, e.band]));

  const modelled = floodLayers
    .map((e) => `- ${e.label} (${e.key}): ${e.value ?? '—'} ${e.unit}, modelled band ${e.bandLabel} — ${e.verdict}`)
    .join('\n');

  try {
    if (!place) {
      console.warn('[narrative] mitigation skipped: could not verify the location from coordinates');
      return { status: 'failed' };
    }

    const coords = `${memo.center[1].toFixed(5)}, ${memo.center[0].toFixed(5)}`;
    const user =
      locale === Locale.Es
        ? `UBICACIÓN VERIFICADA (a partir de las coordenadas, autoritativa): ${place}
Coordenadas: ${coords}
Etiqueta de la calle (NO es prueba de la ciudad, ignórala para localizar): ${memo.place}

Peligro de inundación modelizado que ignora las defensas construidas:
${modelled}

Busca en la web la infraestructura de defensa contra inundaciones que protege ${place} y decide luego si la banda modelizada debe revisarse a la baja. No cites obras de ninguna otra ciudad.`
        : `VERIFIED LOCATION (from coordinates, authoritative): ${place}
Coordinates: ${coords}
Street label (NOT evidence of the city, ignore for locating): ${memo.place}

Modelled flood hazard that ignores engineered defences:
${modelled}

Search the web for the flood-defence infrastructure that protects ${place}, then decide whether the modelled band should be revised down. Do not cite works from any other city.`;

    const { result } = await toolCall<unknown>({
      model,
      system: MITIGATION_SYSTEM[locale],
      user,
      toolName: 'flood_defence_check',
      toolDescription: 'Verify a modelled flood hazard against real engineered flood defences found on the web.',
      parameters: MITIGATION_PARAMS[locale],
      maxTokens: MAX_TOKENS,
      temperature: 0.1,
      webSearch: WEB_SEARCH_RESULTS,
      searchPrompt: locale === Locale.Es ? MITIGATION_SEARCH_PROMPT_ES : undefined,
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

function cacheKey(memo: RiskMemo, model: string, locale: Locale): string {
  const canonical = JSON.stringify({
    v: 12,
    locale,
    overall: memo.overall,
    place: memo.place,
    center: memo.center.map((c) => c.toFixed(5)),
    zone: memo.zone,
    entries: memo.entries.map((e) => [e.key, e.value, e.band, e.degraded]),
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

export async function narrateMemo(
  memo: RiskMemo,
  localeOverride?: Locale | null,
  knownPlace?: string | null,
): Promise<MemoNarrative> {
  if (!llmEnabled()) return fallback(memo);

  const model = defaultModel();
  const place =
    knownPlace !== undefined ? knownPlace : await reverseGeocode(memo.center[1], memo.center[0]);
  const locale = localeOverride ?? localeFor(place);
  const key = cacheKey(memo, model, locale);

  const local = memoryGet(key);
  if (local) {
    return local;
  }

  const running = inflight.get(key);
  if (running) {
    return running;
  }

  const task = Promise.race([
    generate(memo, key, model, locale, place),
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

async function generate(
  memo: RiskMemo,
  key: string,
  model: string,
  locale: Locale,
  place: string | null,
): Promise<MemoNarrative> {
  const cachedRaw = await cacheGet<unknown>(key);
  const cached = cachedRaw != null ? validCached(cachedRaw) : null;
  if (cached != null) {
    memorySet(key, cached);
    return cached;
  }

  const facts = memoFacts(memo);
  const allowed = allowedNumbers(memo, facts);
  const baseUser = `Write an assessor's conclusion for this site. Use ONLY the data below.\n\n${facts}`;

  const mitigationPromise = fetchMitigation(memo, model, place, locale);

  let core: NarrativeCore | null = null;
  try {
    let correction = '';
    for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS && !core; attempt++) {
      const { result } = await toolCall<unknown>({
        model,
        system: SYSTEM[locale],
        user: baseUser + correction,
        toolName: 'risk_assessment',
        toolDescription: 'Risk assessor conclusion for a property, based strictly on the supplied measurements.',
        parameters: CORE_PARAMS[locale],
        maxTokens: MAX_TOKENS,
        temperature: 0.2,
        label: attempt === 1 ? 'risk-memo' : 'risk-memo-retry',
      });

      const parsed = CoreSchema.safeParse(coerceDrivers(result));
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
