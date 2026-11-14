/**
 * Asking before the member's text goes to an AI provider (App Review
 * guideline 5.1.2(i)).
 *
 * Three features send text to a third-party AI: Break down on a quest, Ask the
 * Guild, and the quest-list writer. Each request goes through `withAiConsent`,
 * which lib/api.ts wraps around the raw request where it is defined; the raw
 * requests are not exported, so a page cannot reach them without the gate
 * (aiConsent.test.ts calls every function lib/api.ts exports to prove it).
 *
 * Before a request:
 *   1. Who would answer (GET /ai): the member's own key in use, else the
 *      Guild's own key if the server has one, else nobody.
 *   2. Nobody: no prompt. The request goes out and the server answers
 *      AI_NOT_CONFIGURED without contacting anyone, so the page's usual
 *      "connect an AI" message appears.
 *   3. Somebody, and the member has not allowed this feature for this
 *      answerer on this device: ask (components/AiConsentHost.tsx). Allow is
 *      remembered in localStorage; Not now is not, and the action stops
 *      quietly (AiConsentDeclined, which callers ignore).
 *
 * A remembered Allow belongs to one answerer: a different provider, the same
 * provider through the member's own key instead of the Guild's, or another
 * address for "Another provider", is asked about afresh.
 */

import type { AiState } from './api';

export type AiFeature = 'breakDown' | 'askGuild' | 'questList';

/** Ask the Guild sends this many days of the activity log, and the prompt says so. */
export const ASK_DAYS = 14;

/**
 * What each feature is called and exactly what it sends (docs/PRIVACY_DATA_MAP.md,
 * section 4). The prompt reads "<lead> <company> <sends>.": "Break down sends
 * Anthropic this quest’s title, …".
 */
export const AI_FEATURES: Record<AiFeature, { name: string; lead: string; sends: string }> = {
  breakDown: {
    name: 'Break down',
    lead: 'Break down sends',
    sends: 'this quest’s title, time estimate, effort and impact scores, deadline and category',
  },
  askGuild: {
    name: 'Ask the Guild',
    lead: 'Asking the Guild sends',
    sends:
      `your question, your permafile, your unfinished expedition items, and the last ${ASK_DAYS} days of your ` +
      'activity log, which includes journal entries and mood ratings, check-ins and finished quests',
  },
  questList: {
    name: 'Write the list',
    lead: 'Writing the list sends',
    sends: 'the notes you typed or pasted',
  },
};

/** Who would receive the text. */
export interface AiAnswerer {
  /** What a remembered Allow is tied to: `own:openai`, `own:custom:api.groq.com`, `guild:anthropic`. */
  id: string;
  /** The company that receives the text, as the prompt names it: Anthropic, OpenAI, api.groq.com. */
  company: string;
  /** What people call the AI: Claude, ChatGPT; for another provider, its address. */
  product: string;
  /** The member's own key, or the Guild's. */
  own: boolean;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

/** Who answers an AI request right now, from GET /ai; null when nobody would. */
export function answererFrom(state: AiState): AiAnswerer | null {
  const active = state.connections.find((c) => c.inUse);
  if (active) {
    if (active.provider === 'custom') {
      const host = hostOf(active.baseUrl) ?? 'another provider';
      return { id: `own:custom:${host}`, company: host, product: host, own: true };
    }
    const p = state.providers.find((x) => x.id === active.provider);
    return { id: `own:${active.provider}`, company: p?.company ?? active.provider, product: p?.name ?? active.provider, own: true };
  }
  // The server's own key is always Claude (server lib/ai.ts).
  if (state.builtIn) {
    const p = state.providers.find((x) => x.id === 'anthropic');
    return { id: 'guild:anthropic', company: p?.company ?? 'Anthropic', product: p?.name ?? 'Claude', own: false };
  }
  return null;
}

// ─── What this device remembers ───────────────────────────────────────────────

export const CONSENT_KEY = 'fg:ai-consent';

const entry = (who: AiAnswerer, feature: AiFeature) => `${who.id}|${feature}`;

function readAll(): string[] {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function hasConsent(who: AiAnswerer, feature: AiFeature): boolean {
  return readAll().includes(entry(who, feature));
}

export function rememberConsent(who: AiAnswerer, feature: AiFeature): void {
  const all = readAll();
  if (all.includes(entry(who, feature))) return;
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify([...all, entry(who, feature)]));
  } catch {
    // Not kept: the next request asks again, which is the safe side.
  }
}

/** "Ask me again before sending": every remembered Allow on this device goes. */
export function forgetConsents(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Nothing kept to forget.
  }
}

// ─── Asking ───────────────────────────────────────────────────────────────────

/** Shows the prompt and resolves true for Send, false for Not now (or a closed sheet). */
export type ConsentAsker = (feature: AiFeature, who: AiAnswerer) => Promise<boolean>;

let asker: ConsentAsker | null = null;

/** The host component registers itself; returns the way to unregister. */
export function setConsentAsker(fn: ConsentAsker): () => void {
  asker = fn;
  return () => {
    if (asker === fn) asker = null;
  };
}

/** The member pressed Not now. Not an error: callers stop without a word. */
export class AiConsentDeclined extends Error {
  constructor() {
    super('Not sent: the member chose Not now.');
    this.name = 'AiConsentDeclined';
  }
}

export const isConsentDeclined = (err: unknown): err is AiConsentDeclined => err instanceof AiConsentDeclined;

/**
 * Run `send` only if the member has allowed this feature for whoever would
 * answer, asking first if not. With no prompt on screen to ask with, the
 * answer is no.
 */
export async function withAiConsent<T>(
  feature: AiFeature,
  findAnswerer: () => Promise<AiAnswerer | null>,
  send: () => Promise<T>,
): Promise<T> {
  const who = await findAnswerer();
  if (who && !hasConsent(who, feature)) {
    const allowed = asker ? await asker(feature, who) : false;
    if (!allowed) throw new AiConsentDeclined();
    rememberConsent(who, feature);
  }
  return send();
}
