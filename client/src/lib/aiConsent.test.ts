/**
 * The consent gate in front of the three AI features: when it asks, what it
 * remembers, and that nothing in lib/api.ts can reach an AI route without it.
 * fetch is stubbed; lib/api.ts is the real one.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiConnection, AiState } from './api';

const stored = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, String(v)),
  removeItem: (k: string) => void stored.delete(k),
});

const PROVIDERS: AiState['providers'] = [
  { id: 'anthropic', name: 'Claude', company: 'Anthropic', tagline: '', keyUrl: '', note: '', needsBaseUrl: false },
  { id: 'openai', name: 'ChatGPT', company: 'OpenAI', tagline: '', keyUrl: '', note: '', needsBaseUrl: false },
  { id: 'custom', name: 'Another provider', company: 'the provider', tagline: '', keyUrl: '', note: '', needsBaseUrl: true },
];

const connection = (provider: string, baseUrl: string | null = null): AiConnection => ({
  provider, model: 'm', keyHint: 'abcd', baseUrl, inUse: true, lastUsedAt: null, lastError: null, createdAt: '2026-11-01T00:00:00Z',
});

/** What GET /ai answers in the current test. */
let aiState: AiState;
const ownKey = (provider = 'openai', baseUrl: string | null = null): AiState => ({
  providers: PROVIDERS, connections: [connection(provider, baseUrl)], builtIn: null, inUse: `${provider} · m`,
});
const guildKey = (): AiState => ({ providers: PROVIDERS, connections: [], builtIn: 'Claude · claude-opus-5', inUse: 'Claude · claude-opus-5 (the server\'s own key)' });
const nobody = (): AiState => ({ providers: PROVIDERS, connections: [], builtIn: null, inUse: null });

const AI_ROUTE = /\/decompose|\/chronicle\/ask|\/ai\/manifest/;
let calls: Array<{ url: string; method: string }> = [];
vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
  const method = init.method ?? 'GET';
  calls.push({ url, method });
  const path = new URL(url).pathname;
  if (path === '/ai' && method === 'GET') return { status: 200, json: async () => ({ success: true, data: aiState }) } as Response;
  if (AI_ROUTE.test(path) && aiState.inUse === null) {
    return { status: 503, json: async () => ({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'No AI is connected.' } }) } as Response;
  }
  return { status: 200, json: async () => ({ success: true, data: { suggestions: [], answer: '', actions: [], text: '', via: '' } }) } as Response;
});

const consent = await import('./aiConsent');
const apiModule = await import('./api');
const { aiFeatures } = apiModule;

const aiCalls = () => calls.filter((c) => AI_ROUTE.test(new URL(c.url).pathname));

/** A stand-in for the prompt: records each question and answers as told. */
let asked: Array<{ feature: string; company: string; own: boolean }> = [];
let answer = true;
let unregister: (() => void) | null = null;
function mountPrompt() {
  unregister = consent.setConsentAsker(async (feature, who) => {
    asked.push({ feature, company: who.company, own: who.own });
    return answer;
  });
}

beforeEach(() => {
  stored.clear();
  calls = [];
  asked = [];
  answer = true;
  aiState = ownKey();
  unregister?.();
  unregister = null;
});

describe('who would answer', () => {
  it('is the member’s own key in use, named by the company that receives the text', () => {
    expect(consent.answererFrom(ownKey('openai'))).toEqual({ id: 'own:openai', company: 'OpenAI', product: 'ChatGPT', own: true });
  });
  it('is the address for another provider, so a new address is a new answerer', () => {
    expect(consent.answererFrom(ownKey('custom', 'https://api.groq.com/openai/v1'))).toMatchObject({ id: 'own:custom:api.groq.com', company: 'api.groq.com' });
  });
  it('is the Guild’s own Claude key when nothing is connected and the server has one', () => {
    expect(consent.answererFrom(guildKey())).toEqual({ id: 'guild:anthropic', company: 'Anthropic', product: 'Claude', own: false });
  });
  it('is nobody when neither exists', () => {
    expect(consent.answererFrom(nobody())).toBeNull();
  });
});

describe('the gate', () => {
  it('no provider: no prompt, and the request goes out for the server to say "connect an AI"', async () => {
    mountPrompt();
    aiState = nobody();
    await expect(aiFeatures.breakDown('q1')).rejects.toThrow(/AI_NOT_CONFIGURED/);
    expect(asked).toHaveLength(0);
    expect(aiCalls()).toHaveLength(1);
  });

  it('first use: asks, naming the provider, before anything is sent', async () => {
    let sentBeforeAnswer = -1;
    unregister = consent.setConsentAsker(async (feature, who) => {
      asked.push({ feature, company: who.company, own: who.own });
      sentBeforeAnswer = aiCalls().length;
      return true;
    });
    await aiFeatures.askGuild('Why did I fall behind?');
    expect(asked).toEqual([{ feature: 'askGuild', company: 'OpenAI', own: true }]);
    expect(sentBeforeAnswer).toBe(0);
    expect(aiCalls()).toHaveLength(1);
  });

  it('remembers Allow for that feature and that provider', async () => {
    mountPrompt();
    await aiFeatures.breakDown('q1');
    await aiFeatures.breakDown('q2');
    expect(asked).toHaveLength(1);
    expect(aiCalls()).toHaveLength(2);
    // Another feature is its own question.
    await aiFeatures.writeQuestList('buy milk', 'g'.repeat(200));
    expect(asked.map((a) => a.feature)).toEqual(['breakDown', 'questList']);
  });

  it('does not remember Not now: nothing is sent, the action stops quietly, and it asks again next time', async () => {
    mountPrompt();
    answer = false;
    const err = await aiFeatures.breakDown('q1').catch((e: unknown) => e);
    expect(consent.isConsentDeclined(err)).toBe(true);
    expect(aiCalls()).toHaveLength(0);
    expect(stored.get(consent.CONSENT_KEY)).toBeUndefined();
    answer = true;
    await aiFeatures.breakDown('q1');
    expect(asked).toHaveLength(2);
    expect(aiCalls()).toHaveLength(1);
  });

  it('asks again when the answering provider changes', async () => {
    mountPrompt();
    await aiFeatures.breakDown('q1');
    aiState = ownKey('anthropic');
    await aiFeatures.breakDown('q1');
    expect(asked.map((a) => a.company)).toEqual(['OpenAI', 'Anthropic']);
  });

  it('asks again when the member connects their own key after using the Guild’s', async () => {
    mountPrompt();
    aiState = guildKey();
    await aiFeatures.breakDown('q1');
    aiState = ownKey('anthropic');
    await aiFeatures.breakDown('q1');
    expect(asked).toEqual([
      { feature: 'breakDown', company: 'Anthropic', own: false },
      { feature: 'breakDown', company: 'Anthropic', own: true },
    ]);
  });

  it('"Ask me again before sending" forgets every remembered Allow', async () => {
    mountPrompt();
    await aiFeatures.breakDown('q1');
    consent.forgetConsents();
    await aiFeatures.breakDown('q1');
    expect(asked).toHaveLength(2);
  });

  it('with no prompt mounted, the answer is no', async () => {
    const err = await aiFeatures.askGuild('hello').catch((e: unknown) => e);
    expect(consent.isConsentDeclined(err)).toBe(true);
    expect(aiCalls()).toHaveLength(0);
  });

  it('Ask the Guild sends the number of days the prompt names', async () => {
    mountPrompt();
    const bodies: unknown[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      if (String(url).includes('/chronicle/ask')) bodies.push(JSON.parse(String(init.body)));
      return realFetch(url, init);
    });
    await aiFeatures.askGuild('hello');
    vi.stubGlobal('fetch', realFetch);
    expect(bodies).toEqual([expect.objectContaining({ days: consent.ASK_DAYS })]);
    expect(consent.AI_FEATURES.askGuild.sends).toContain(`last ${consent.ASK_DAYS} days`);
  });
});

describe('nothing can bypass the gate', () => {
  /** Every function lib/api.ts exports, at any depth of its exported objects. */
  function everyFunction(value: unknown, path: string, out: Array<{ path: string; fn: (...a: unknown[]) => unknown }>, depth = 0) {
    if (depth > 4 || value === null) return;
    if (typeof value === 'function') {
      // Classes (ApiRequestError…) are not requests.
      if (/^class\b/.test(Function.prototype.toString.call(value))) return;
      out.push({ path, fn: value as (...a: unknown[]) => unknown });
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) everyFunction(v, `${path}.${k}`, out, depth + 1);
    }
  }

  it('no exported function of lib/api.ts reaches an AI route without a Send', async () => {
    const fns: Array<{ path: string; fn: (...a: unknown[]) => unknown }> = [];
    for (const [name, value] of Object.entries(apiModule)) {
      // The auth seams change who requests are made as; calling them here would only muddle the test.
      if (/^set[A-Z]/.test(name)) continue;
      everyFunction(value, name, fns);
    }
    expect(fns.length).toBeGreaterThan(50); // the walk really found the API
    mountPrompt();
    answer = false; // every prompt answered Not now
    for (const { fn } of fns) {
      try {
        await fn('x', 'x', 'x');
      } catch {
        // Wrong arguments or Not now: either way, what matters is what was sent.
      }
    }
    expect(aiCalls()).toEqual([]);
    // The three features did ask, so the walk reached them.
    expect(asked.map((a) => a.feature).sort()).toEqual(['askGuild', 'breakDown', 'questList']);
  });

  it('the AI routes are written nowhere in the client but inside the gate in lib/api.ts', () => {
    const src = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(src);
    const offenders = files.filter((f) => relative(src, f).replace(/\\/g, '/') !== 'lib/api.ts' && AI_ROUTE.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    // In lib/api.ts, each route appears once in code, inside withAiConsent.
    const api = readFileSync(join(src, 'lib/api.ts'), 'utf8');
    const code = api.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
    for (const route of ['/decompose', '/chronicle/ask', '/ai/manifest']) {
      expect(code.split(route).length - 1).toBe(1);
    }
    expect(code.match(/withAiConsent\(/g)?.length).toBe(3);
  });
});
