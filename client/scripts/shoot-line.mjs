/**
 * Photograph a line in the running app, so it can be looked at instead of
 * imagined.
 *
 *   npm run line:shoot <id>            every shot
 *   npm run line:shoot <id> scene      only the window poses (quick)
 *   npm run line:shoot night record    save what the real API answers, to check the sample data's shapes against
 *
 * Needs only the client dev server (5173). The API is not called: every
 * request to it is answered from design/lines/fixtures/api.json (written by
 * build.mjs beside it), and the page's clock starts at the moment that file names. So the pictures
 * are the same on every run, on every machine, and nothing touches the
 * database. `record` is the one mode that talks to the real API.
 *
 * Drives one headless Chrome or Edge over its debugging port (no extra
 * packages), at a real phone width where asked, and uses the ?scene= poses
 * understood by src/lines/SceneWindow.tsx.
 *
 * Shots land in design/lines/shots/<id>/ (not committed).
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const mode = process.argv[3] ?? 'all';
if (!id || !['all', 'scene', 'record'].includes(mode)) {
  console.error('usage: npm run line:shoot <id> [scene|record]');
  process.exit(2);
}

const BASE = process.env.LINE_SHOOT_URL || 'http://localhost:5173';
// The client may be pointed at the API by either name (client/.env, .env.local).
const API_HOSTS = (process.env.LINE_SHOOT_API || 'http://localhost:3000,http://127.0.0.1:3000').split(',');
const isApi = (url) => API_HOSTS.some((host) => url.startsWith(`${host}/`));
const FIXTURES = resolve(here, '../../design/lines/fixtures/api.json');

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

const SCENE = [
  ['scene-away', '/', 'scene=away&done=0&caution=0', 1280, 330],
  ['scene-arriving', '/', 'scene=arriving&k=0.55&done=2&caution=0', 1280, 330],
  ['scene-stopped', '/', 'scene=stopped&done=4&caution=0', 1280, 330],
  ['scene-caution', '/', 'scene=stopped&done=7&caution=1', 1280, 330],
  ['scene-departing', '/', 'scene=departing&k=0.45&done=5&caution=0', 1280, 330],
  ['scene-passing', '/', 'scene=passing&k=0.5&done=1&caution=0', 1280, 330],
  ['scene-phone', '/', 'scene=stopped&done=4&caution=0', 375, 330],
];
const PAGES = [
  ['today-1280', '/', 'scene=stopped&done=4&caution=0', 1280, 1300],
  ['today-375', '/', 'scene=stopped&done=4&caution=0', 375, 812],
  ['route-1280', '/feed', '', 1280, 900],
  ['route-375', '/feed', '', 375, 812],
  ['settings-1280', '/settings', '', 1280, 900],
  // The last entry is something to scroll to before the picture is taken.
  ['picker-1280', '/settings', '', 1280, 900, '[role="radiogroup"][aria-label="Line"]'],
];
const shots = mode === 'scene' ? SCENE : mode === 'record' ? PAGES : [...SCENE, ...PAGES];

const recording = mode === 'record';
let fixtures = null;
if (!recording) {
  if (!existsSync(FIXTURES)) {
    console.error(`No sample data at ${FIXTURES}. Run: npm run line:shoot night record`);
    process.exit(2);
  }
  fixtures = JSON.parse(readFileSync(FIXTURES, 'utf8'));
}
const recorded = {};

const outDir = resolve(here, '../../design/lines/shots', id);
mkdirSync(outDir, { recursive: true });
const profile = join(tmpdir(), `fg-line-shoot-${id}-${process.pid}`);
const port = 9300 + (process.pid % 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (method, url) => `${method} ${new URL(url).pathname}`;

/** The page's clock starts at a fixed moment and runs on from there. */
const clockShim = (startMs) => `(() => {
  const Real = Date;
  const offset = ${startMs} - Real.now();
  class Shifted extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + offset); }
    static now() { return Real.now() + offset; }
  }
  globalThis.Date = Shifted;
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

  if (recording) {
    // Keep every answer the API gives while the pages load.
    const calls = new Map();
    await send('Network.enable');
    on['Network.responseReceived'] = ({ requestId, response }) => {
      if (isApi(response.url)) calls.set(requestId, { ...calls.get(requestId), url: response.url, status: response.status });
    };
    on['Network.requestWillBeSent'] = ({ requestId, request }) => {
      if (isApi(request.url)) calls.set(requestId, { ...calls.get(requestId), method: request.method, url: request.url });
    };
    on['Network.loadingFinished'] = async ({ requestId }) => {
      const call = calls.get(requestId);
      if (!call || !call.method || call.method === 'OPTIONS') return;
      try {
        const { body, base64Encoded } = await send('Network.getResponseBody', { requestId });
        const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
        recorded[keyOf(call.method, call.url)] = { status: call.status, body: text ? JSON.parse(text) : null };
      } catch {
        // No body, or not JSON: nothing worth replaying.
      }
    };
  } else {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: clockShim(new Date(fixtures.now).getTime()) });
    if (fixtures.timezone) await send('Emulation.setTimezoneOverride', { timezoneId: fixtures.timezone });
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
  }

  for (const [name, path, query, w, h, scrollTo] of shots) {
    const url = `${BASE}${path}?line=${id}${query ? `&${query}` : ''}`;
    try {
      const phone = w < 600;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: phone });
      await send('Emulation.setTouchEmulationEnabled', { enabled: phone });
      await send('Page.navigate', { url });
      // Ready means: loaded, a line applied, something rendered, and no loading placeholders left.
      let ready = false;
      for (let i = 0; i < 80 && !ready; i += 1) {
        await sleep(250);
        ready = await evaluate(
          `document.readyState === 'complete' && document.documentElement.dataset.line !== undefined`
          + ` && !!document.querySelector('#root')?.children.length && !document.querySelector('.skeleton')`,
        ).catch(() => false);
      }
      await evaluate('document.fonts.ready.then(() => true)').catch(() => {});
      if (scrollTo) await evaluate(`document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: 'center' })`).catch(() => {});
      await sleep(recording ? 6000 : 1500);
      const applied = await evaluate('document.documentElement.dataset.line');
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
      const note = !ready ? '  (still loading when taken)' : applied !== id ? `  (line "${id}" did not load; this is "${applied}")` : '';
      if (note) failed += 1;
      console.log(`${note ? 'WARN' : 'ok  '} ${name}.png${note}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }
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

if (recording) {
  // A recording is raw material for design/lines/fixtures/build.mjs, not the sample data itself.
  const file = resolve(dirname(FIXTURES), 'recorded.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ recordedAt: new Date().toISOString(), responses: recorded }, null, 1)}\n`);
  console.log(`\nrecorded ${Object.keys(recorded).length} answers to ${file}`);
  console.log('Compare the shapes with design/lines/fixtures/build.mjs, which writes the sample data.');
} else if (unanswered.size) {
  console.log(`\nnot in the sample data (answered empty): ${[...unanswered].join(', ')}`);
}
console.log(`\n${outDir}`);
process.exit(failed ? 1 : 0);
