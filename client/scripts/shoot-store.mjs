/**
 * Photograph the App Store screenshots: the real client, in the iPhone app's
 * mode, at the App Store's 6.9-inch size.
 *
 *   cd client && npx vite --port 5199 --strictPort --host 127.0.0.1   (in another terminal; this script needs it)
 *   npm run store:shots
 *
 * Needs only the client dev server on port 5199 and fails with a message if it
 * is not answering. The API is not called: every request to it is answered
 * from design/lines/fixtures/api.json, with design/lines/fixtures/store.json
 * layered on top of it (the pages the line fixtures never visit: Expeditions,
 * a fuller quest list). The page's clock is fixed at the moment api.json names
 * and stands still, so the pictures are the same on every run and nothing
 * touches the database.
 *
 * The page is the real one: `?native=1` (the app's layout), `?inset=59,34`
 * (an iPhone's status-bar and home-indicator insets). The app is signed in by
 * seeding the secure-storage keys the web build of the Keychain plugin
 * reads. Nothing is drawn on top of the screens: no text, frames or mock-ups.
 *
 * Drives one headless Chrome or Edge over its debugging port (no extra
 * packages). Each picture is 430 x 932 CSS px at scale 3 = 1290 x 2796.
 *
 * Shots land in client/ios/App/fastlane/screenshots/en-US/.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.STORE_SHOTS_URL || 'http://127.0.0.1:5199';
// The dev client may be pointed at the API by any of these (client/.env*.local).
const API_HOSTS = (
  process.env.STORE_SHOTS_API
  || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3092,http://127.0.0.1:3092'
).split(',');
const isApi = (url) => API_HOSTS.some((host) => url.startsWith(`${host}/`));
const FIXTURE_DIR = resolve(here, '../../design/lines/fixtures');
const OUT = resolve(here, '../ios/App/fastlane/screenshots/en-US');

const W = 430;
const H = 932;
const SCALE = 3;
const INSET = '59,34';

const SHOTS = [
  { file: '01_today.png', path: '/', query: '' },
  { file: '02_route.png', path: '/feed', query: '' },
  { file: '03_quests.png', path: '/quests', query: '' },
  { file: '04_expeditions.png', path: '/tracker', query: '' },
  { file: '05_trophies.png', path: '/trophies', query: '' },
  { file: '06_star_guild.png', path: '/', query: 'line=star' },
  // Last: the store shows the first three in search results, and this screen is the plainest.
  { file: '07_timer.png', path: '/', query: '', timer: true },
];

const browser = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!browser) {
  console.error('No Chrome or Edge found. Set CHROME to the browser executable.');
  process.exit(2);
}

try {
  await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
} catch {
  console.error(`The client dev server is not answering at ${BASE}.`);
  console.error('Start it first:  cd client && npx vite --port 5199 --strictPort --host 127.0.0.1');
  process.exit(2);
}

const fixtures = JSON.parse(readFileSync(join(FIXTURE_DIR, 'api.json'), 'utf8'));
const storePath = join(FIXTURE_DIR, 'store.json');
if (existsSync(storePath)) {
  const extra = JSON.parse(readFileSync(storePath, 'utf8'));
  fixtures.responses = { ...fixtures.responses, ...extra.responses };
}
const nowMs = new Date(fixtures.now).getTime();
const clerkId = fixtures.responses['POST /users']?.body?.data?.clerkId ?? 'dev-member-001';

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), `fg-store-shoot-${process.pid}`);
const port = 9300 + (process.pid % 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (method, url) => `${method} ${new URL(url).pathname}`;

/** The page's clock is set to a fixed moment and stands still there. */
const clockShim = (ms) => `(() => {
  const Real = Date;
  class Fixed extends Real {
    constructor(...a) { if (a.length) super(...a); else super(${ms}); }
    static now() { return ${ms}; }
  }
  globalThis.Date = Fixed;
})();`;

/** Signed in (the web build of the Keychain plugin keeps base64 values under cap_sec_), not a first launch, no welcome guide. */
const seed = (timer) => `(() => {
  try {
    localStorage.setItem('cap_sec_focusGuild.deviceToken', btoa('fgd_sample_token'));
    localStorage.setItem('cap_sec_focusGuild.deviceClerkId', btoa(${JSON.stringify(clerkId)}));
    localStorage.setItem('focusGuild.installed', '1');
    localStorage.setItem('fg:welcome-hidden', '1');
    ${timer
      ? `localStorage.setItem('focusGuild.activeSession', JSON.stringify(${JSON.stringify(timer)}));`
      : `localStorage.removeItem('focusGuild.activeSession');`}
  } catch {}
})();`;

const chrome = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
], { stdio: 'ignore' });

async function debuggerUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = tabs.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  throw new Error('The browser did not open its debugging port.');
}

let failed = 0;
const unanswered = new Set();
try {
  const ws = new WebSocket(await debuggerUrl());
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let seq = 0;
  const waiting = new Map();
  const on = {};
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, no } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) no(new Error(msg.error.message));
      else ok(msg.result);
    } else if (msg.method && on[msg.method]) {
      on[msg.method](msg.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((ok, no) => {
      seq += 1;
      waiting.set(seq, { ok, no });
      ws.send(JSON.stringify({ id: seq, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

  await send('Page.enable');
  await send('Runtime.enable');
  const thrown = [];
  on['Runtime.exceptionThrown'] = ({ exceptionDetails: d }) => thrown.push(d.exception?.description?.split('\n').slice(0, 2).join(' | ') ?? d.text);

  await send('Page.addScriptToEvaluateOnNewDocument', { source: clockShim(nowMs) });
  if (fixtures.timezone) await send('Emulation.setTimezoneOverride', { timezoneId: fixtures.timezone });
  // Settled pictures: the app's own reduced-motion look, so nothing moves between runs.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setLocaleOverride', { locale: 'en-US' }).catch(() => {});

  // Answer the API from the sample data. Nothing reaches the network.
  const cors = [
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' },
    { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
  ];
  await send('Fetch.enable', { patterns: API_HOSTS.map((host) => ({ urlPattern: `${host}/*` })) });
  on['Fetch.requestPaused'] = ({ requestId, request }) => {
    if (request.method === 'OPTIONS') {
      send('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: cors }).catch(() => {});
      return;
    }
    const key = keyOf(request.method, request.url);
    const hit = fixtures.responses[key];
    if (!hit) unanswered.add(key);
    const status = hit ? hit.status : request.method === 'GET' ? 404 : 200;
    const body = hit ? hit.body : request.method === 'GET' ? { error: 'not in the sample data' } : {};
    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: status,
      responseHeaders: [...cors, { name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    }).catch(() => {});
  };

  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });

  for (const shot of SHOTS) {
    let seedId;
    try {
      // A running session, six minutes into a 25-minute one, on the first quest.
      const timer = shot.timer
        ? { questId: 'q1', questTitle: 'Draft the methods section', durationMin: 25, startedAt: nowMs - 6 * 60_000, pausedAt: null, pausedTotalMs: 0, daily: false }
        : null;
      seedId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: seed(timer) })).identifier;
      const q = ['native=1', `inset=${INSET}`, shot.query].filter(Boolean).join('&');
      await send('Page.navigate', { url: `${BASE}${shot.path}?${q}` });
      // Ready means: loaded, a line applied, something rendered, no loading placeholders left.
      let ready = false;
      for (let i = 0; i < 80 && !ready; i += 1) {
        await sleep(250);
        ready = await evaluate(
          `document.readyState === 'complete' && document.documentElement.dataset.line !== undefined`
          + ` && !!document.querySelector('#root')?.children.length && !document.querySelector('.skeleton, [aria-busy="true"]')`,
        ).catch(() => false);
      }
      if (shot.timer) {
        // The timer's own screen is not persisted as open: open it as the chip does.
        let clicked = false;
        for (let i = 0; i < 40 && !clicked; i += 1) {
          clicked = await evaluate(`(() => { const c = document.querySelector('[data-timer-chip]'); if (c) c.click(); return !!c; })()`);
          if (!clicked) await sleep(250);
        }
        if (!clicked) throw new Error('the timer chip never appeared');
      }
      await evaluate('document.fonts.ready.then(() => true)').catch(() => {});
      await sleep(2500);
      const state = await evaluate(`({ line: document.documentElement.dataset.line, native: !!document.querySelector('.bottom-nav, nav'), text: document.body.innerText.slice(0, 80).replace(/\\s+/g, ' ') })`);
      const data = (await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;
      writeFileSync(join(OUT, shot.file), Buffer.from(data, 'base64'));
      if (!ready) failed += 1;
      console.log(`${ready ? 'ok  ' : 'WARN'} ${shot.file}${ready ? '' : '  (still loading when taken)'}  [${state?.line}] ${state?.text}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${shot.file}: ${e.message}`);
    } finally {
      if (seedId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedId }).catch(() => {});
    }
  }
  if (thrown.length) console.log(`\npage errors: ${thrown.slice(0, 5).join('\n  ')}`);
  ws.close();
} catch (e) {
  failed += 1;
  console.error(e.message);
} finally {
  chrome.kill();
  await sleep(400);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // The browser may still hold a file; the profile is in the temp folder either way.
  }
}

if (unanswered.size) console.log(`\nnot in the sample data (answered empty): ${[...unanswered].join(', ')}`);
console.log(`\n${OUT}`);
process.exit(failed ? 1 : 0);
