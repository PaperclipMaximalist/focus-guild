/**
 * The demo build's plumbing, installed before any other app module runs
 * (demo/boot.ts, the first import of main.tsx): a clock that stands still, the
 * sample data in place of the API, and the first-run switches already set.
 *
 * Only ever called inside `if (import.meta.env.VITE_DEMO === '1')`, so a real
 * build drops this module and the sample data with it.
 */

import apiRaw from '../../../design/lines/fixtures/api.json?raw';
import storeRaw from '../../../design/lines/fixtures/store.json?raw';
import demoRaw from '../../../design/lines/fixtures/demo.json?raw';

interface Canned {
  status: number;
  body: unknown;
}

interface FixtureFile {
  now?: string;
  timezone?: string;
  responses?: Record<string, Canned>;
}

/**
 * The browser's own fetch, kept before it is wrapped: the route file must
 * reach the page's origin. installFetch sets it; until then it calls through.
 * (Not bound here: a call at module level would survive in the real builds,
 * which otherwise drop this whole module.)
 */
export let realFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** The sample member's moment: `now` in api.json. */
export let demoNow = 0;

export let demoClerkId = 'dev-member-001';

function readFixtures(): { now: number; responses: Record<string, Canned> } {
  const files = [apiRaw, storeRaw, demoRaw].map((raw) => JSON.parse(raw) as FixtureFile);
  // Later files win, key by key: store.json over api.json, demo.json over both.
  const responses = Object.assign({}, ...files.map((f) => f.responses ?? {})) as Record<string, Canned>;
  return { now: new Date(files[0]!.now ?? Date.now()).getTime(), responses };
}

/** Same as clockShim in scripts/shoot-store.mjs: `new Date()` and `Date.now()` answer one moment and stand still. */
function installClock(ms: number): void {
  const Real = Date;
  class Fixed extends Real {
    constructor(...a: unknown[]) {
      if (a.length) super(...(a as [string]));
      else super(ms);
    }
    static override now(): number {
      return ms;
    }
  }
  globalThis.Date = Fixed as DateConstructor;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Every request to the API is answered here; nothing leaves the phone. */
function installFetch(apiUrl: string, responses: Record<string, Canned>): void {
  realFetch = globalThis.fetch.bind(globalThis);
  const original = realFetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (!url.startsWith(apiUrl)) return original(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const key = `${method} ${new URL(url).pathname}`;
    // A beat, as a real answer takes: the pages' loading states run as usual.
    await new Promise((r) => setTimeout(r, 40));
    const hit = responses[key];
    if (hit) return json(hit.status, hit.body);
    if (method === 'GET') {
      console.warn(`[demo] unanswered ${key}`);
      return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'Not in the sample data' } });
    }
    return json(200, { success: true, data: {} });
  };
}

/** Not a first launch, and the welcome guide already put away (as seed() in shoot-store.mjs). */
function seedStorage(): void {
  try {
    localStorage.setItem('fg:welcome-hidden', '1');
    localStorage.setItem('focusGuild.installed', '1');
  } catch {
    // No storage: the first-run screens may show; nothing else depends on it.
  }
}

export function installDemo(): void {
  const { now, responses } = readFixtures();
  demoNow = now;
  const user = responses['POST /users']?.body as { data?: { clerkId?: string } } | undefined;
  if (user?.data?.clerkId) demoClerkId = user.data.clerkId;
  installClock(now);
  installFetch((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000', responses);
  seedStorage();
}
