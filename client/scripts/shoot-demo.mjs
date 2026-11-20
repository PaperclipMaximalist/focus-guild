/**
 * Walk the demo build through every screen in every line, in headless Chrome
 * or Edge, the same way the iPhone simulator walks it on CI: by rewriting
 * /demo-route.json and waiting for the page to say "[demo] shown <n> ...".
 *
 *   cd client && npm run build:demo && npm run demo:shots
 *   npm run demo:shots -- --looks night,star
 *
 * Serves client/dist (which must hold a demo build) on 127.0.0.1:5251 with its
 * own small static server. Nothing is intercepted, shimmed or seeded here: the
 * demo build answers the API, fixes the clock and signs itself in. The screens
 * come from client/ios/ci/screens.tsv.
 *
 * No notch band in these pictures: the safe-area insets come from iOS, and the
 * desktop's are zero (the ?inset= seam is development-only).
 *
 * Pictures land in client/demo-shots/<line>/<stem>.png (scratch output).
 * Exits 1 when any screen did not say it was shown in time, or any request
 * was not in the sample data.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const SCREENS = resolve(here, '../ios/ci/screens.tsv');
const FIXTURES = resolve(here, '../../design/lines/fixtures/api.json');
const OUT = resolve(here, '../demo-shots');
const PORT = 5251;
const BASE = `http://127.0.0.1:${PORT}`;
const ALL_LOOKS = ['night', 'deep', 'dispatch', 'orbital', 'sleeper', 'spire', 'star'];
const W = 430;
const H = 932;
const SCALE = 2;
const SHOWN_TIMEOUT_MS = 25_000;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
};
const looks = (arg('--looks') ?? ALL_LOOKS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
for (const l of looks) {
  if (!ALL_LOOKS.includes(l)) {
    console.error(`Unknown look "${l}". Looks: ${ALL_LOOKS.join(', ')}`);
    process.exit(2);
  }
}

if (!existsSync(join(DIST, 'demo-route.json'))) {
  console.error('client/dist does not hold a demo build (no demo-route.json). Run: npm run build:demo');
  process.exit(2);
}

const screens = readFileSync(SCREENS, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => {
    const [stem, path, extra] = line.split('\t');
    return { stem, path, timer: extra?.trim() === 'timer' };
  });

const timezone = JSON.parse(readFileSync(FIXTURES, 'utf8')).timezone;

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

// ─── The static server: the build, an SPA fallback, and the route file ─────────

let route = { n: 0, path: '/', line: 'night' };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
};

const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (pathname === '/demo-route.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(route));
    return;
  }
  let file = normalize(join(DIST, pathname));
  if (!file.startsWith(DIST + sep) && file !== DIST) {
    res.writeHead(403).end();
    return;
  }
  const hasFile = existsSync(file) && statSync(file).isFile();
  if (!hasFile) {
    // A path without an extension is one of the app's own routes.
    if (extname(pathname)) {
      res.writeHead(404).end();
      return;
    }
    file = join(DIST, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
});

await new Promise((ok, no) => {
  server.once('error', no);
  server.listen(PORT, '127.0.0.1', ok);
}).catch((e) => {
  console.error(`Could not serve the build on port ${PORT}: ${e.message}`);
  process.exit(2);
});

// ─── The browser ───────────────────────────────────────────────────────────────

const profile = join(tmpdir(), `fg-demo-shoot-${process.pid}`);
const port = 9400 + (process.pid % 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const results = [];
const thrown = [];
const unanswered = new Set();
let failed = 0;
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

  // The page's console: "[demo] shown <n> ..." lines, and the unanswered requests.
  let ready = false;
  const shownWaiters = new Map();
  on['Runtime.consoleAPICalled'] = ({ args }) => {
    const text = args.map((a) => (a.value !== undefined ? String(a.value) : a.description ?? '')).join(' ');
    const m = /^\[demo\] shown (\d+) /.exec(text);
    if (m) {
      const n = Number(m[1]);
      shownWaiters.get(n)?.(text);
    } else if (text === '[demo] ready') {
      ready = true;
    } else if (text.startsWith('[demo] unanswered ')) {
      unanswered.add(text.slice('[demo] unanswered '.length));
    }
  };
  on['Runtime.exceptionThrown'] = ({ exceptionDetails: d }) =>
    thrown.push(d.exception?.description?.split('\n').slice(0, 2).join(' | ') ?? d.text);

  await send('Page.enable');
  await send('Runtime.enable');
  if (timezone) await send('Emulation.setTimezoneOverride', { timezoneId: timezone });
  // Settled pictures: the app's own reduced-motion look, so nothing moves between runs.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setLocaleOverride', { locale: 'en-US' }).catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });

  await send('Page.navigate', { url: `${BASE}/` });
  for (let i = 0; i < 120 && !ready; i += 1) await sleep(250);
  if (!ready) console.log('WARN the app never said "[demo] ready" (going on anyway)');

  let n = 0;
  for (const look of looks) {
    mkdirSync(join(OUT, look), { recursive: true });
    for (const s of screens) {
      n += 1;
      const name = `${look}/${s.stem}.png`;
      const said = new Promise((ok) => {
        shownWaiters.set(n, ok);
        setTimeout(() => ok(null), SHOWN_TIMEOUT_MS);
      });
      route = { n, path: s.path, line: look, timer: s.timer };
      const text = await said;
      shownWaiters.delete(n);
      try {
        const data = (await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;
        writeFileSync(join(OUT, look, `${s.stem}.png`), Buffer.from(data, 'base64'));
      } catch (e) {
        failed += 1;
        results.push(`FAIL ${name}: ${e.message}`);
        console.log(results.at(-1));
        continue;
      }
      const ok = text && !text.endsWith('(still loading)');
      if (!ok) failed += 1;
      results.push(`${ok ? 'ok  ' : 'WARN'} ${name}${text ? (ok ? '' : '  (still loading when taken)') : '  (never said it was shown)'}`);
      console.log(results.at(-1));
    }
  }
  ws.close();
} catch (e) {
  failed += 1;
  console.error(e.message);
} finally {
  chrome.kill();
  server.close();
  await sleep(400);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // The browser may still hold a file; the profile is in the temp folder either way.
  }
}

console.log(`\npage errors: ${thrown.length ? `\n  ${[...new Set(thrown)].slice(0, 10).join('\n  ')}` : 'none'}`);
console.log(`unanswered requests: ${unanswered.size ? `\n  ${[...unanswered].sort().join('\n  ')}` : 'none'}`);
console.log(`\n${OUT}`);
process.exit(failed || unanswered.size ? 1 : 0);
