import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  AiError,
  PROVIDERS,
  aiFailure,
  chatModels,
  complete,
  describeConnection,
  listModels,
  normaliseBaseUrl,
  pickActive,
  pickDefaultModel,
  providerById,
  publicProviders,
  scrub,
  unseal,
  type Deps,
} from './aiProviders.js';
import { seal } from './secretBox.js';

const KEY = 'sk-test-0123456789abcdefWXYZ';

/** A stand-in for the network: records the request, answers with what it is given. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, deps: { fetch: impl } satisfies Deps };
}

const failed = async (p: Promise<unknown>): Promise<AiError> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AiError) return e;
    throw e;
  }
  throw new Error('expected it to fail');
};

describe('the providers', () => {
  it('lists the ones people have heard of, each with somewhere to get a key', () => {
    expect(PROVIDERS.map((p) => p.name)).toEqual(['Claude', 'ChatGPT', 'Gemini', 'Grok', 'Mistral', 'DeepSeek', 'OpenRouter', 'Another provider']);
    for (const p of PROVIDERS) {
      if (p.id === 'custom') continue;
      expect(p.keyUrl).toMatch(/^https:\/\//);
      if (p.kind === 'openai-chat') expect(p.baseUrl).toMatch(/^https:\/\/[^/]+.*[^/]$/);
    }
  });

  it('tells a browser nothing it could call with', () => {
    const pub = publicProviders();
    expect(Object.keys(pub[0]!).sort()).toEqual(['company', 'id', 'keyUrl', 'name', 'needsBaseUrl', 'note', 'tagline']);
    expect(pub.find((p) => p.id === 'custom')!.needsBaseUrl).toBe(true);
  });
});

describe('choosing a model to start on', () => {
  it('takes the named one when the provider has it', () => {
    expect(pickDefaultModel('anthropic', ['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5'])).toBe('claude-opus-5-5');
    expect(pickDefaultModel('deepseek', ['deepseek-reasoner', 'deepseek-chat'])).toBe('deepseek-chat');
  });

  it('falls back by family, in the order the provider listed them', () => {
    expect(pickDefaultModel('anthropic', ['claude-sonnet-6', 'claude-opus-6', 'claude-opus-5'])).toBe('claude-opus-6');
    expect(pickDefaultModel('anthropic', ['claude-sonnet-6'])).toBe('claude-sonnet-6');
  });

  it('takes the highest version, and the plain name over a dated or smaller one', () => {
    expect(pickDefaultModel('openai', ['gpt-4o', 'gpt-4.1', 'gpt-5-mini', 'gpt-5', 'gpt-5-2025-08-07', 'o3'])).toBe('gpt-5');
    expect(pickDefaultModel('openai', ['gpt-5', 'gpt-5.2', 'gpt-4.1'])).toBe('gpt-5.2');
    expect(pickDefaultModel('openai', ['gpt-4o-mini', 'gpt-4o'])).toBe('gpt-4o');
    expect(pickDefaultModel('google', ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro', 'gemini-3-pro-preview'])).toBe('gemini-3-pro');
    expect(pickDefaultModel('google', ['gemini-2.5-flash-lite', 'gemini-2.5-flash'])).toBe('gemini-2.5-flash');
    expect(pickDefaultModel('xai', ['grok-3-mini', 'grok-4', 'grok-3'])).toBe('grok-4');
  });

  it('takes the first on the list when nothing is recognised, and nothing from an empty list', () => {
    expect(pickDefaultModel('custom', ['llama-70b', 'qwen'])).toBe('llama-70b');
    expect(pickDefaultModel('openai', ['some-future-name'])).toBe('some-future-name');
    expect(pickDefaultModel('openai', [])).toBeNull();
  });

  it('leaves out models that are not for chat', () => {
    expect(chatModels(['gpt-5', 'text-embedding-3-large', 'whisper-1', 'dall-e-3', 'tts-1', 'gpt-5', 'models/gemini-2.5-pro', 'omni-moderation-latest', 'gpt-realtime'])).toEqual([
      'gpt-5',
      'gemini-2.5-pro',
    ]);
  });
});

describe('a custom address', () => {
  it('is kept as the API root', () => {
    expect(normaliseBaseUrl('https://api.groq.com/openai/v1/')).toEqual({ url: 'https://api.groq.com/openai/v1' });
    expect(normaliseBaseUrl(' https://api.together.xyz/v1/chat/completions ')).toEqual({ url: 'https://api.together.xyz/v1' });
    expect(normaliseBaseUrl('https://example.com')).toEqual({ url: 'https://example.com' });
  });

  it('must be https and must not point inside the server\'s own network', () => {
    for (const bad of ['http://api.example.com/v1', 'https://localhost:11434/v1', 'https://192.168.1.5/v1', 'https://10.0.0.2', 'not a url', 'https://api.example.com/v1?key=1']) {
      expect('error' in normaliseBaseUrl(bad), bad).toBe(true);
    }
  });
});

describe('talking to an OpenAI-compatible provider', () => {
  const conn = { provider: 'openai', apiKey: KEY, model: 'gpt-5' };

  it('sends one system and one user message, with the key as a bearer token and nothing else', async () => {
    const { calls, deps } = fakeFetch(200, { choices: [{ finish_reason: 'stop', message: { content: '  focus-guild manifest 1\nRead chapter 4  ' } }] });
    const text = await complete(conn, { system: 'the guide', prompt: 'my notes' }, deps);
    expect(text).toBe('focus-guild manifest 1\nRead chapter 4');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.redirect).toBe('error');
    expect(calls[0]!.init.headers).toEqual({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
    // No temperature, no max_tokens: current models reject one or the other.
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: 'the guide' },
        { role: 'user', content: 'my notes' },
      ],
    });
  });

  it('calls each provider at its own address', async () => {
    const urls: Record<string, string> = {
      google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      xai: 'https://api.x.ai/v1/chat/completions',
      mistral: 'https://api.mistral.ai/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    };
    for (const [provider, url] of Object.entries(urls)) {
      const { calls, deps } = fakeFetch(200, { choices: [{ message: { content: 'ok' } }] });
      await complete({ provider, apiKey: KEY, model: 'm' }, { prompt: 'hi' }, deps);
      expect(calls[0]!.url).toBe(url);
      expect(JSON.parse(String(calls[0]!.init.body)).messages).toEqual([{ role: 'user', content: 'hi' }]);
    }
    const custom = fakeFetch(200, { choices: [{ message: { content: 'ok' } }] });
    await complete({ provider: 'custom', apiKey: KEY, model: 'm', baseUrl: 'https://api.groq.com/openai/v1' }, { prompt: 'hi' }, custom.deps);
    expect(custom.calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('reads an answer sent as a list of parts', async () => {
    const { deps } = fakeFetch(200, { choices: [{ message: { content: [{ type: 'text', text: 'one ' }, { type: 'text', text: 'two' }] } }] });
    expect(await complete(conn, { prompt: 'hi' }, deps)).toBe('one two');
  });

  it('says so when the answer is empty or was declined', async () => {
    expect((await failed(complete(conn, { prompt: 'hi' }, fakeFetch(200, { choices: [{ message: { content: '' } }] }).deps))).code).toBe('AI_EMPTY');
    expect((await failed(complete(conn, { prompt: 'hi' }, fakeFetch(200, { choices: [] }).deps))).code).toBe('AI_EMPTY');
    expect((await failed(complete(conn, { prompt: 'hi' }, fakeFetch(200, { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }).deps))).code).toBe('AI_REFUSED');
    expect((await failed(complete(conn, { prompt: 'hi' }, fakeFetch(200, { choices: [{ message: { content: null, refusal: 'I cannot help with that.' } }] }).deps))).code).toBe('AI_REFUSED');
  });

  it('turns each kind of refusal by the provider into words a person can act on', async () => {
    const run = (status: number, body: unknown) => failed(complete(conn, { prompt: 'hi' }, fakeFetch(status, body).deps));
    const rejected = await run(401, { error: { message: `Incorrect API key provided: ${KEY}` } });
    expect(rejected.code).toBe('AI_KEY_REJECTED');
    expect(rejected.status).toBe(400);
    expect(rejected.message).toMatch(/OpenAI did not accept that key/);
    expect((await run(403, {})).code).toBe('AI_KEY_REJECTED');
    const missing = await run(404, { error: { message: 'The model `gpt-9` does not exist' } });
    expect(missing.code).toBe('AI_MODEL_NOT_FOUND');
    expect(missing.message).toContain('gpt-9');
    const quota = await run(429, { error: { message: 'You exceeded your current quota' } });
    expect(quota.code).toBe('AI_RATE_LIMITED');
    expect(quota.message).toMatch(/out of credit.*exceeded your current quota/);
    expect((await run(402, { error: 'Insufficient Balance' })).message).toContain('Insufficient Balance');
    const other = await run(500, '<html>Bad gateway</html>');
    expect(other.code).toBe('AI_ERROR');
    expect(other.message).toBe('OpenAI answered 500.');
    // Gemini wraps its errors in a list.
    expect((await run(400, [{ error: { message: 'API key not valid' } }])).message).toBe('OpenAI answered 400: API key not valid');
  });

  it('never repeats the key back in an error', async () => {
    const e = await failed(complete(conn, { prompt: 'hi' }, fakeFetch(500, { error: { message: `bad key ${KEY} used` } }).deps));
    expect(e.message).not.toContain(KEY);
    expect(e.message).toContain('[key]');
    expect(scrub(`a ${KEY} b   c`, KEY)).toBe('a [key] b c');
  });

  it('reports a provider that cannot be reached', async () => {
    const deps: Deps = { fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch };
    const e = await failed(complete(conn, { prompt: 'hi' }, deps));
    expect(e.code).toBe('AI_UNREACHABLE');
    expect(e.message).not.toContain('fetch failed');
  });

  it('lists the chat models a key can use, which is how a key is checked', async () => {
    const { calls, deps } = fakeFetch(200, { object: 'list', data: [{ id: 'gpt-5' }, { id: 'text-embedding-3-small' }, { id: 'gpt-5-mini' }] });
    expect(await listModels({ provider: 'openai', apiKey: KEY }, deps)).toEqual(['gpt-5', 'gpt-5-mini']);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/models');
    expect(calls[0]!.init.method).toBe('GET');
    const gemini = fakeFetch(200, { data: [{ id: 'models/gemini-2.5-pro' }, { id: 'models/gemini-embedding-001' }] });
    expect(await listModels({ provider: 'google', apiKey: KEY }, gemini.deps)).toEqual(['gemini-2.5-pro']);
    expect((await failed(listModels({ provider: 'openai', apiKey: KEY }, fakeFetch(401, { error: { message: 'no' } }).deps))).code).toBe('AI_KEY_REJECTED');
  });

  it('refuses a provider it does not know, and a custom one with no address', async () => {
    expect((await failed(complete({ provider: 'nope', apiKey: KEY, model: 'm' }, { prompt: 'hi' }))).status).toBe(400);
    expect((await failed(complete({ provider: 'custom', apiKey: KEY, model: 'm' }, { prompt: 'hi' }, fakeFetch(200, {}).deps))).status).toBe(400);
  });
});

describe('talking to Claude', () => {
  const conn = { provider: 'anthropic', apiKey: KEY, model: 'claude-opus-5-5' };
  type Create = (params: Record<string, unknown>) => Promise<unknown>;
  const withCreate = (create: Create, seen: { key?: string } = {}): Deps => ({
    anthropic: (apiKey) => {
      seen.key = apiKey;
      return { messages: { create }, models: {} } as unknown as Pick<Anthropic, 'messages' | 'models'>;
    },
  });
  const headers = new Headers();

  it('sends the system prompt and the notes through the SDK, with room to think and no sampling settings', async () => {
    let sent: Record<string, unknown> = {};
    const seen: { key?: string } = {};
    const deps = withCreate(async (params) => {
      sent = params;
      return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: ' ready ' }] };
    }, seen);
    expect(await complete(conn, { system: 'the guide', prompt: 'my notes' }, deps)).toBe('ready');
    expect(seen.key).toBe(KEY);
    expect(sent).toEqual({ model: 'claude-opus-5-5', max_tokens: 16000, system: 'the guide', messages: [{ role: 'user', content: 'my notes' }] });
  });

  it('says so when Claude declines or answers with nothing', async () => {
    expect((await failed(complete(conn, { prompt: 'x' }, withCreate(async () => ({ stop_reason: 'refusal', content: [] }))))).code).toBe('AI_REFUSED');
    expect((await failed(complete(conn, { prompt: 'x' }, withCreate(async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] }))))).code).toBe('AI_EMPTY');
  });

  it('tells the kinds of failure apart by the SDK\'s own error classes', async () => {
    const run = (e: unknown) => failed(complete(conn, { prompt: 'x' }, withCreate(async () => { throw e; })));
    expect((await run(new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', headers))).code).toBe('AI_KEY_REJECTED');
    expect((await run(new Anthropic.PermissionDeniedError(403, undefined, 'no', headers))).code).toBe('AI_KEY_REJECTED');
    expect((await run(new Anthropic.NotFoundError(404, undefined, 'model: nope', headers))).code).toBe('AI_MODEL_NOT_FOUND');
    expect((await run(new Anthropic.RateLimitError(429, undefined, 'slow down', headers))).code).toBe('AI_RATE_LIMITED');
    expect((await run(new Anthropic.APIConnectionError({ message: 'socket hang up' }))).code).toBe('AI_UNREACHABLE');
    const other = await run(new Anthropic.BadRequestError(400, undefined, `bad request with ${KEY}`, headers));
    expect(other.code).toBe('AI_ERROR');
    expect(other.message).toMatch(/^Anthropic answered 400/);
    expect(other.message).not.toContain(KEY);
  });

  it('asks the SDK what models the key can use', async () => {
    const deps: Deps = {
      anthropic: () =>
        ({
          messages: {},
          models: {
            list: () => ({
              async *[Symbol.asyncIterator]() {
                yield { id: 'claude-opus-5-5' };
                yield { id: 'claude-haiku-5-5' };
              },
            }),
          },
        }) as unknown as Pick<Anthropic, 'messages' | 'models'>,
    };
    expect(await listModels({ provider: 'anthropic', apiKey: KEY }, deps)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
  });
});

describe('stored connections', () => {
  const SECRET = 'a-secret-of-reasonable-length';
  const row = (over: Partial<{ id: string; provider: string; isDefault: boolean; createdAt: Date }> = {}) => ({
    id: 'c1',
    provider: 'openai',
    keySealed: seal(KEY, SECRET),
    model: 'gpt-5',
    baseUrl: null,
    isDefault: false,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  });

  it('uses the one marked default, else the newest, else none', () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b', provider: 'anthropic', createdAt: new Date('2026-10-05T00:00:00Z') });
    expect(pickActive([a, b])!.id).toBe('b');
    expect(pickActive([{ ...a, isDefault: true }, b])!.id).toBe('a');
    expect(pickActive([])).toBeNull();
  });

  it('opens the key only with the secret that sealed it', () => {
    expect(unseal(row(), SECRET)).toEqual({ provider: 'openai', apiKey: KEY, model: 'gpt-5', baseUrl: null });
    for (const secret of ['another-secret-entirely!', null]) {
      let thrown: unknown;
      try {
        unseal(row(), secret);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(AiError);
      expect((thrown as AiError).code).toBe('AI_KEY_UNREADABLE');
      expect((thrown as AiError).message).toContain('ChatGPT');
    }
  });

  it('names who answered', () => {
    expect(describeConnection({ provider: 'anthropic', model: 'claude-opus-5-5' })).toBe('Claude · claude-opus-5-5');
    expect(providerById('google')!.name).toBe('Gemini');
  });

  it('answers a route with the code, the sentence and the right status', () => {
    expect(aiFailure(new AiError('AI_NOT_CONFIGURED', 'No AI is connected.', 503))).toEqual({
      body: { success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'No AI is connected.' } },
      status: 503,
    });
    expect(aiFailure(new Error('boom'))).toEqual({ body: { success: false, error: { code: 'AI_ERROR', message: 'boom' } }, status: 502 });
  });
});
