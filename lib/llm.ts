import 'server-only';

const BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const SITE_URL = process.env.OPENROUTER_SITE_URL || 'https://geo-intelligence.app';
const APP_TITLE = 'Geo-Intelligence';

const MAX_ATTEMPTS = 4;
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const ARGS_SNIPPET = 200;
const REQUEST_TIMEOUT_MS = 45000;
const OVERALL_DEADLINE_MS = 70000;

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ToolCallOptions {
  model?: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  parameters: Record<string, unknown>;
  maxTokens: number;
  temperature?: number;
  webSearch?: number;
  label?: string;
}

interface ChatChoice {
  message?: {
    tool_calls?: { type: string; function: { name: string; arguments: string } }[];
  };
  finish_reason?: string;
}

interface ChatResponse {
  choices?: ChatChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

export function llmEnabled(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function defaultModel(): string {
  return process.env.NARRATION_MODEL || 'anthropic/claude-haiku-4.5';
}

async function post(body: unknown, label: string): Promise<ChatResponse> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');

  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const budget = deadline - Date.now();
    if (budget <= 0) break;
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, budget)),
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'HTTP-Referer': SITE_URL,
          'X-Title': APP_TITLE,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, ARGS_SNIPPET)}`);
        if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
          lastError = err;
        } else {
          throw err;
        }
      } else {
        return (await res.json()) as ChatResponse;
      }
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof Error &&
        (/ECONNRESET|ETIMEDOUT|overloaded|HTTP (408|409|429|5\d\d)/.test(err.message) ||
          err.name === 'TypeError' ||
          err.name === 'TimeoutError');
      if (!retryable || attempt === MAX_ATTEMPTS) break;
    }
    if (Date.now() >= deadline) break;
    const exp = Math.min(15000, 1000 * 2 ** (attempt - 1));
    const delay = exp / 2 + Math.random() * (exp / 2);
    console.warn(`[llm:${label}] attempt ${attempt} failed — retrying in ${Math.round(delay)} ms`);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function toolCall<T>(opts: ToolCallOptions): Promise<{ result: T; usage: LlmUsage }> {
  const model = opts.model || defaultModel();
  const label = opts.label ?? opts.toolName;

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.2,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: opts.toolName,
          description: opts.toolDescription,
          parameters: opts.parameters,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: opts.toolName } },
    usage: { include: true },
  };
  if (opts.webSearch && opts.webSearch > 0) {
    body.plugins = [{ id: 'web', max_results: opts.webSearch }];
  }

  const response = await post(body, label);

  const call = response.choices?.[0]?.message?.tool_calls?.[0];
  if (!call || call.type !== 'function') {
    throw new Error(
      `LLM returned no tool_call (model=${model}, finish=${response.choices?.[0]?.finish_reason})`,
    );
  }

  let result: T;
  try {
    result = JSON.parse(call.function.arguments) as T;
  } catch {
    throw new Error(
      `Failed to parse tool_call arguments (model=${model}, args="${(call.function.arguments ?? '').slice(0, ARGS_SNIPPET)}")`,
    );
  }

  const usage: LlmUsage = {
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    costUsd: response.usage?.cost ?? 0,
  };
  console.log(
    `[llm:${label}] model=${model} in=${usage.inputTokens} out=${usage.outputTokens} cost=$${usage.costUsd}`,
  );

  return { result, usage };
}
