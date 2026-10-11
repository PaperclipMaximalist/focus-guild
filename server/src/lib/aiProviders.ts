/**
 * The AIs a person can plug into the Guild with their own API key, and the
 * two ways of talking to them.
 *
 * Claude is called through Anthropic's SDK. Everything else is called through
 * the chat-completions endpoint that OpenAI defined and the rest of the
 * industry copied: OpenAI itself, Google's Gemini, xAI's Grok, Mistral,
 * DeepSeek and OpenRouter all answer it, so one small adapter covers them and
 * "Another provider" covers whatever comes next. No provider is special-cased
 * beyond its address.
 *
 * What the Guild asks of an AI is one thing: a system prompt, a user prompt,
 * text back. No tools, no streaming, no sampling settings (several current
 * models reject them), so the same request is valid everywhere.
 *
 * Model names go stale within months, so none is hard-coded as the only
 * choice: when a key is connected the provider is asked what it offers
 * (`listModels`, which is also the first proof the key works), a default is
 * picked from that list by pattern (`pickDefaultModel`), and the person can
 * change it to anything on the list or type a name that is not.
 *
 * Errors come back as `AiError` with a code and a sentence a person can act
 * on. A key never appears in one (`scrub`).
 */

import Anthropic from '@anthropic-ai/sdk';
import { normaliseFeedUrl } from './calendar/ics.js';
import { open, sealingSecret } from './secretBox.js';

export type ProviderKind = 'anthropic' | 'openai-chat';

export interface Provider {
  id: string;
  /** What people call it. */
  name: string;
  /** Who bills for it. */
  company: string;
  /** The line under the name in the list. */
  tagline: string;
  kind: ProviderKind;
  /** Root of the OpenAI-compatible API; absent for Claude and for "custom". */
  baseUrl?: string;
  /** Where a key is made. */
  keyUrl: string;
  /** One line under the name. */
  note: string;
  /** Tried in order against the provider's own model list; the first hit is the default. */
  prefer: Array<string | RegExp>;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    tagline: 'Anthropic',
    name: 'Claude',
    company: 'Anthropic',
    kind: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'A Claude Pro or Max plan does not include API use; the API has its own billing.',
    prefer: ['claude-opus-5-5', /^claude-opus-/, /^claude-sonnet-/, /^claude-/],
  },
  {
    id: 'openai',
    tagline: 'OpenAI',
    name: 'ChatGPT',
    company: 'OpenAI',
    kind: 'openai-chat',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'A ChatGPT Plus plan does not include API use; the API has its own billing.',
    prefer: [/^gpt-(\d+(?:\.\d+)?)$/, /^gpt-(\d+(?:\.\d+)?)/, /^o\d/],
  },
  {
    id: 'google',
    tagline: 'Google',
    name: 'Gemini',
    company: 'Google',
    kind: 'openai-chat',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'A key from Google AI Studio. It has a free tier.',
    prefer: [/^gemini-(\d+(?:\.\d+)?)-pro$/, /^gemini-(\d+(?:\.\d+)?)-flash$/, /^gemini-(\d+(?:\.\d+)?)/],
  },
  {
    id: 'xai',
    tagline: 'xAI',
    name: 'Grok',
    company: 'xAI',
    kind: 'openai-chat',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    note: 'A key from the xAI console.',
    prefer: [/^grok-(\d+(?:\.\d+)?)$/, /^grok-(\d+(?:\.\d+)?)/],
  },
  {
    id: 'mistral',
    tagline: 'Mistral Large and the rest of La Plateforme',
    name: 'Mistral',
    company: 'Mistral AI',
    kind: 'openai-chat',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'A key from La Plateforme.',
    prefer: ['mistral-large-latest', 'mistral-medium-latest', /^mistral-large/, /^mistral-/],
  },
  {
    id: 'deepseek',
    tagline: 'DeepSeek chat and reasoner',
    name: 'DeepSeek',
    company: 'DeepSeek',
    kind: 'openai-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'A key from the DeepSeek platform.',
    prefer: ['deepseek-chat', /^deepseek-/],
  },
  {
    id: 'openrouter',
    tagline: 'One key for many makers’ models',
    name: 'OpenRouter',
    company: 'OpenRouter',
    kind: 'openai-chat',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'One key for models from many makers, billed in one place.',
    prefer: ['openrouter/auto'],
  },
  {
    id: 'custom',
    tagline: 'Any service that speaks the OpenAI API',
    name: 'Another provider',
    company: 'the provider',
    kind: 'openai-chat',
    keyUrl: '',
    note: 'Anything that speaks the OpenAI chat API: give its address and a key.',
    prefer: [],
  },
];

export const providerById = (id: string): Provider | undefined => PROVIDERS.find((p) => p.id === id);

/** What a browser may know about a provider. */
export const publicProviders = () =>
  PROVIDERS.map(({ id, name, company, tagline, keyUrl, note }) => ({ id, name, company, tagline, keyUrl, note, needsBaseUrl: id === 'custom' }));

export type AiErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_KEY_REJECTED'
  | 'AI_KEY_UNREADABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_REFUSED'
  | 'AI_UNREACHABLE'
  | 'AI_EMPTY'
  | 'AI_ERROR';

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    /** The HTTP status the route should answer with. */
    readonly status: 400 | 502 | 503 = 502,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** Everything needed to make a call. `apiKey` is the opened key; it lives only as long as the request. */
export interface Connection {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}

export interface CompletionRequest {
  system?: string;
  prompt: string;
}

/** Stand-ins for the network, so the adapters can be tested without one. */
export interface Deps {
  fetch?: typeof fetch;
  anthropic?: (apiKey: string) => Pick<Anthropic, 'messages' | 'models'>;
}

const TIMEOUT_MS = 120_000;
/** Thinking counts against this on current Claude models, so it is generous. */
const MAX_TOKENS = 16_000;

/** A provider's error text with the key taken out, at a length fit for a toast. */
export function scrub(text: string, apiKey: string): string {
  const clean = apiKey.length >= 8 ? text.split(apiKey).join('[key]') : text;
  return clean.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * The address of a custom provider: https, not a private network, no trailing
 * slash. The same guard the calendar feeds use, so a pasted address cannot
 * make the server call into its own network.
 */
export function normaliseBaseUrl(raw: string): { url: string } | { error: string } {
  const checked = normaliseFeedUrl(raw);
  if ('error' in checked) return { error: checked.error.replace('calendar link', 'address') };
  const u = new URL(checked.url);
  if (u.search || u.hash) return { error: 'Give the address without a ? or # part.' };
  // People paste the full endpoint; the root is what is wanted.
  const path = u.pathname.replace(/\/(chat\/completions|models)\/?$/, '').replace(/\/+$/, '');
  return { url: `${u.origin}${path}` };
}

function baseUrlOf(conn: Pick<Connection, 'provider' | 'baseUrl'>): string {
  const provider = providerById(conn.provider);
  const url = provider?.baseUrl ?? conn.baseUrl;
  if (!url) throw new AiError('AI_ERROR', 'This connection has no address to call.', 400);
  return url;
}

const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|moderation|realtime|transcri|babbage|davinci|sora|veo|imagen|aqa|rerank|guard|search|computer-use/i;

/** Model ids fit for a chat request, in the provider's order, without the path prefix Gemini adds. */
export function chatModels(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.replace(/^models\//, '');
    if (!id || seen.has(id) || NOT_CHAT.test(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * The model to start on. A string is an exact name; a pattern with a capture
 * group picks the highest version it captures ("gpt-5.2" over "gpt-5"), and a
 * pattern without one picks the first match. Falls back to the first model.
 */
export function pickDefaultModel(providerId: string, ids: string[]): string | null {
  const provider = providerById(providerId);
  for (const want of provider?.prefer ?? []) {
    if (typeof want === 'string') {
      if (ids.includes(want)) return want;
      continue;
    }
    const hits = ids.map((id) => ({ id, m: want.exec(id) })).filter((h): h is { id: string; m: RegExpExecArray } => h.m !== null);
    if (hits.length === 0) continue;
    if (hits[0]!.m[1] === undefined) return hits[0]!.id;
    // Highest version; among equals the shortest name, which is the undated one.
    hits.sort((a, b) => parseFloat(b.m[1]!) - parseFloat(a.m[1]!) || a.id.length - b.id.length);
    return hits[0]!.id;
  }
  return ids[0] ?? null;
}

// ─── Stored connections ──────────────────────────────────────────────────────

/** The stored row behind a connection: everything but the key in the clear. */
export interface ConnectionRow {
  id: string;
  provider: string;
  keySealed: string;
  model: string;
  baseUrl: string | null;
  isDefault: boolean;
  createdAt: Date;
}

/** The one a person's AI features run on: the default, or failing that the newest. */
export function pickActive<T extends Pick<ConnectionRow, 'isDefault' | 'createdAt'>>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.find((r) => r.isDefault) ?? [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
}

/** A stored row with its key opened, ready to call. Throws if the key can no longer be read. */
export function unseal(row: ConnectionRow, secret: string | null = sealingSecret()): Connection {
  const apiKey = secret ? open(row.keySealed, secret) : null;
  if (!apiKey) {
    const name = providerById(row.provider)?.name ?? 'that AI';
    throw new AiError('AI_KEY_UNREADABLE', `The saved key for ${name} can no longer be read. Remove it and paste it again.`, 400);
  }
  return { provider: row.provider, apiKey, model: row.model, baseUrl: row.baseUrl };
}

/** "Claude · claude-opus-5-5": who answered, for the page to show. */
export const describeConnection = (conn: Pick<Connection, 'provider' | 'model'>) =>
  `${providerById(conn.provider)?.name ?? conn.provider} · ${conn.model}`;

/** An error from an AI call as the body and status a route answers with. */
export function aiFailure(e: unknown): { body: { success: false; error: { code: string; message: string } }; status: 400 | 502 | 503 } {
  if (e instanceof AiError) return { body: { success: false, error: { code: e.code, message: e.message } }, status: e.status };
  return { body: { success: false, error: { code: 'AI_ERROR', message: e instanceof Error ? e.message : String(e) } }, status: 502 };
}

// ─── Claude, through Anthropic's SDK ──────────────────────────────────────────

const anthropicClient = (apiKey: string) => new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS });

function fromAnthropic(e: unknown, apiKey: string): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError('AI_KEY_REJECTED', 'Anthropic did not accept that key. Check that it was copied whole and has not been revoked.', 400);
  }
  if (e instanceof Anthropic.NotFoundError) {
    return new AiError('AI_MODEL_NOT_FOUND', 'Anthropic does not know that model. Pick another from the list.', 400);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new AiError('AI_RATE_LIMITED', 'Anthropic is turning requests away for now: the account is over its rate limit or out of credit.');
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new AiError('AI_UNREACHABLE', 'Could not reach Anthropic. Try again in a moment.');
  }
  if (e instanceof Anthropic.APIError) {
    return new AiError('AI_ERROR', `Anthropic answered ${e.status ?? 'with an error'}: ${scrub(e.message, apiKey)}`);
  }
  return new AiError('AI_ERROR', scrub(e instanceof Error ? e.message : String(e), apiKey));
}

async function anthropicModels(conn: Pick<Connection, 'apiKey'>, deps: Deps): Promise<string[]> {
  const client = (deps.anthropic ?? anthropicClient)(conn.apiKey);
  try {
    const ids: string[] = [];
    // The list pages itself; a few hundred is far more than there are.
    for await (const model of client.models.list({ limit: 100 })) {
      ids.push(model.id);
      if (ids.length >= 300) break;
    }
    return ids;
  } catch (e) {
    throw fromAnthropic(e, conn.apiKey);
  }
}

async function anthropicComplete(conn: Connection, req: CompletionRequest, deps: Deps): Promise<string> {
  const client = (deps.anthropic ?? anthropicClient)(conn.apiKey);
  try {
    const response = await client.messages.create({
      model: conn.model,
      max_tokens: MAX_TOKENS,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: 'user', content: req.prompt }],
    });
    if (response.stop_reason === 'refusal') throw new AiError('AI_REFUSED', 'Claude declined to answer that.');
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    if (!text) throw new AiError('AI_EMPTY', 'Claude answered with nothing. Try again, or try another model.');
    return text;
  } catch (e) {
    throw fromAnthropic(e, conn.apiKey);
  }
}

// ─── Everyone else, through the chat-completions API ──────────────────────────

async function chatFetch(conn: Pick<Connection, 'provider' | 'apiKey' | 'baseUrl'>, path: string, init: RequestInit, deps: Deps): Promise<unknown> {
  const name = providerById(conn.provider)?.company ?? 'The provider';
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(`${baseUrlOf(conn)}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Never follow a redirect with the key attached.
      redirect: 'error',
      headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError('AI_UNREACHABLE', `Could not reach ${name}. Check the address, or try again in a moment.`);
  }
  const raw = await res.text().catch(() => '');
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // Not JSON: an error page, most likely. The status says enough.
  }
  if (res.ok) {
    if (body === null) throw new AiError('AI_ERROR', `${name} answered with something that is not JSON. Is the address its API root?`);
    return body;
  }
  // Providers disagree on the envelope: { error: { message } }, { error: "..." }, { message }, or a list of those.
  const first = Array.isArray(body) ? body[0] : body;
  const err = (first as { error?: unknown } | null)?.error;
  const said =
    typeof err === 'string'
      ? err
      : ((err as { message?: unknown } | undefined)?.message ?? (first as { message?: unknown } | null)?.message ?? '');
  const detail = scrub(typeof said === 'string' ? said : '', conn.apiKey);
  if (res.status === 401 || res.status === 403) {
    throw new AiError('AI_KEY_REJECTED', `${name} did not accept that key. Check that it was copied whole and has not been revoked.`, 400);
  }
  if (res.status === 404) {
    throw new AiError('AI_MODEL_NOT_FOUND', `${name} does not know that model or address.${detail ? ` It said: ${detail}` : ''}`, 400);
  }
  if (res.status === 429 || res.status === 402) {
    throw new AiError('AI_RATE_LIMITED', `${name} is turning requests away for now: the account is over its rate limit or out of credit.${detail ? ` It said: ${detail}` : ''}`);
  }
  throw new AiError('AI_ERROR', `${name} answered ${res.status}${detail ? `: ${detail}` : '.'}`);
}

async function chatModelsOf(conn: Pick<Connection, 'provider' | 'apiKey' | 'baseUrl'>, deps: Deps): Promise<string[]> {
  const body = (await chatFetch(conn, '/models', { method: 'GET' }, deps)) as { data?: unknown } | unknown[];
  const list = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : [];
  return list.map((m) => (typeof m === 'string' ? m : String((m as { id?: unknown })?.id ?? ''))).filter(Boolean);
}

async function chatComplete(conn: Connection, req: CompletionRequest, deps: Deps): Promise<string> {
  const name = providerById(conn.provider)?.name ?? 'The AI';
  const body = (await chatFetch(
    conn,
    '/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({
        model: conn.model,
        messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), { role: 'user', content: req.prompt }],
      }),
    },
    deps,
  )) as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }> };
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'content_filter' || (typeof choice?.message?.refusal === 'string' && choice.message.refusal)) {
    throw new AiError('AI_REFUSED', `${name} declined to answer that.`);
  }
  const content = choice?.message?.content;
  // Usually a string; some providers send a list of parts.
  const text = (
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => (typeof part === 'string' ? part : typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : '')).join('')
        : ''
  ).trim();
  if (!text) throw new AiError('AI_EMPTY', `${name} answered with nothing. Try again, or try another model.`);
  return text;
}

// ─── The two calls the rest of the server makes ───────────────────────────────

/** What the provider offers for chat, in its own order. Also the first proof that a key works. */
export async function listModels(conn: Pick<Connection, 'provider' | 'apiKey' | 'baseUrl'>, deps: Deps = {}): Promise<string[]> {
  const provider = providerById(conn.provider);
  if (!provider) throw new AiError('AI_ERROR', 'That is not a provider the Guild knows.', 400);
  const ids = provider.kind === 'anthropic' ? await anthropicModels(conn, deps) : await chatModelsOf(conn, deps);
  return chatModels(ids);
}

/** One question, one answer. */
export async function complete(conn: Connection, req: CompletionRequest, deps: Deps = {}): Promise<string> {
  const provider = providerById(conn.provider);
  if (!provider) throw new AiError('AI_ERROR', 'That is not a provider the Guild knows.', 400);
  return provider.kind === 'anthropic' ? anthropicComplete(conn, req, deps) : chatComplete(conn, req, deps);
}
