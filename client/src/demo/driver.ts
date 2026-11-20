/**
 * The demo build is steered from outside the page by one file,
 * /demo-route.json: { "n": 3, "path": "/quests", "line": "spire", "timer": false }.
 * Whatever writes it (the simulator walk on CI, scripts/shoot-demo.mjs on a
 * desktop) bumps `n` for each screen it wants, then waits for the console line
 * "[demo] shown <n> ..." before taking the picture.
 *
 * Each screen is a full page load of its path, so every store starts clean,
 * as the Chrome scripts do it. The `n` being handled is kept in sessionStorage
 * so the page that loads knows it was asked for and says when it is settled.
 */

import { chooseLine } from '../lines/current';
import { isSceneEnabled, setSceneEnabled } from '../lib/scene';
import { demoNow, realFetch } from './install';

interface RouteAsk {
  n: number;
  path: string;
  line: string;
  timer?: boolean;
}

const HANDLED_KEY = 'fg:demo-n';
const PENDING_KEY = 'fg:demo-pending';
const READY_KEY = 'fg:demo-ready';
const SESSION_KEY = 'focusGuild.activeSession';
const POLL_MS = 400;
const SETTLE_LIMIT_MS = 12_000;
const SETTLE_EXTRA_MS = 1500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Without sessionStorage the walk still moves; it only cannot say "shown" after the reload.
  }
}

function isAsk(v: unknown): v is RouteAsk {
  const r = v as Partial<RouteAsk> | null;
  return !!r && typeof r.n === 'number' && typeof r.path === 'string' && typeof r.line === 'string';
}

function looksSettled(): boolean {
  return (
    document.documentElement.dataset.line !== undefined &&
    !!document.getElementById('root')?.children.length &&
    !document.querySelector('.skeleton, [aria-busy="true"]')
  );
}

/** True when the screen settled in time; false when it gave up waiting. */
async function settle(): Promise<boolean> {
  // performance.now, not Date.now: the demo's clock stands still.
  const giveUp = performance.now() + SETTLE_LIMIT_MS;
  let settled = false;
  while (performance.now() < giveUp) {
    if (looksSettled()) {
      settled = true;
      break;
    }
    await sleep(100);
  }
  await Promise.race([document.fonts.ready, sleep(Math.max(0, giveUp - performance.now()))]);
  await sleep(SETTLE_EXTRA_MS);
  return settled;
}

/** The timer's own screen is not kept as open: open it as the chip does (as shoot-store.mjs does). */
async function openTimer(): Promise<boolean> {
  for (let i = 0; i < 40; i += 1) {
    const chip = [...document.querySelectorAll<HTMLElement>('[data-timer-chip]')].find((el) => el.offsetParent !== null)
      ?? document.querySelector<HTMLElement>('[data-timer-chip]');
    if (chip) {
      chip.click();
      return true;
    }
    await sleep(250);
  }
  return false;
}

/** Six minutes into a 25-minute session on the first quest, exactly as shoot-store.mjs seeds it. */
function writeTimer(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        questId: 'q1',
        questTitle: 'Draft the methods section',
        durationMin: 25,
        startedAt: demoNow - 6 * 60_000,
        pausedAt: null,
        pausedTotalMs: 0,
        daily: false,
      }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // No storage: the timer screen cannot be shown; the shot will say so.
  }
}

// ─── A probe, for looking into the iPhone's WebView from outside ──────────────
//
// On the simulator the two cards at the top of Today (Now boarding, Time
// available) came out without their drawn frames, in every look, while the
// same Time available card on the Route kept its frame. Nobody can open a web
// inspector on the Mac runner, so the build says what it sees: one console
// line, "[demo] frames <n> …", with what the WebView computed for the frame on
// the first panels of Today and the Route; and a path with ?demoprobe=<name>
// changes one thing before the picture is taken, so one run shows which change
// brings the frames back. Diagnosis only; take it out once the cause is fixed.

const nextFrames = async (count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await new Promise<void>((r) => requestAnimationFrame(() => r()));
};

function describeFrames(): string {
  const short = (v: string, n = 28) => (v.length > n ? `${v.slice(0, n)}~${v.length}` : v);
  const panels = [...document.querySelectorAll<HTMLElement>('.panel')].slice(0, 4).map((el) => {
    const cs = getComputedStyle(el);
    const a = getComputedStyle(el, '::after');
    const r = el.getBoundingClientRect();
    return {
      cls: el.className.slice(0, 36),
      box: [r.x, r.y, r.width, r.height].map(Math.round).join(','),
      el: [cs.position, cs.display, cs.overflow, cs.opacity, short(cs.transform, 12), cs.isolation, cs.contain, cs.willChange].join('|'),
      after: [a.content, a.position, a.display, a.width, a.height, a.top, a.left, a.borderTopWidth, a.borderImageSlice, a.alignSelf, a.justifySelf, a.opacity, a.visibility].join('|'),
      src: short(a.borderImageSource),
    };
  });
  const root = document.documentElement;
  const rs = getComputedStyle(root);
  return JSON.stringify({
    ornate: root.dataset.ornate ?? '',
    moving: root.dataset.moving ?? '',
    vars: ['--frame-panel', '--frame-card'].map((v) => rs.getPropertyValue(v).length).join(','),
    panels,
  });
}

// Round 1 (2026-11-14) found: WebKit computes the frames exactly as Chrome
// does; with Scenery off every panel keeps its frame; a layer on the two cards
// brings theirs back but takes the frames off the panels below. So the moving
// scene window disturbs how WebKit paints border-image on panels that it has
// had to put into a shared layer. Round 2 tries the candidate fixes, each as a
// stylesheet added just before the picture.
const FRAME_AFTERS =
  '.panel::after, .next-card::after, .board-sign::after, [class~="rounded-(--radius-card)"][class~="border"]::after';

const CANDIDATES: Record<string, string> = {
  // Every frame on a layer of its own, so none is painted into a shared one.
  afterlayer: `${FRAME_AFTERS} { transform: translateZ(0); }`,
  // The same, asked for as a hint instead of a transform.
  afterwill: `${FRAME_AFTERS} { will-change: transform; }`,
  // The scene window kept to its own box, so it cannot force the panels after it into shared layers.
  scenecontain: '.scene-window { contain: paint; }',
  // Only the moving canvas hidden (the window and its words stay): is the canvas itself the trigger?
  canvashide: '.scene-window canvas { visibility: hidden; }',
};

async function applyProbe(name: string): Promise<void> {
  if (name === 'noscene') {
    // Control: Scenery off brought every frame back in round 1.
    setSceneEnabled(false);
    await sleep(2500);
    return;
  }
  const css = CANDIDATES[name];
  if (!css) return;
  const style = document.createElement('style');
  style.dataset.demoProbe = name;
  style.textContent = css;
  document.head.append(style);
  await nextFrames(3);
  await sleep(1500);
}

/** The screen this load was asked for: wait for it, then say so on the console. */
async function finishPending(ask: RouteAsk): Promise<void> {
  let settled = await settle();
  if (ask.timer) {
    const opened = await openTimer();
    settled = (await settle()) && settled && opened;
  }
  const probe = new URLSearchParams(window.location.search).get('demoprobe');
  if (probe) await applyProbe(probe);
  if (!ask.timer && (window.location.pathname === '/' || window.location.pathname === '/feed')) {
    console.log(`[demo] frames ${ask.n} ${probe ?? 'plain'} ${describeFrames()}`);
  }
  console.log(`[demo] shown ${ask.n} ${ask.line} ${ask.path}${settled ? '' : ' (still loading)'}`);
}

async function go(ask: RouteAsk): Promise<void> {
  await chooseLine(ask.line);
  // The noscene probe turns Scenery off; every other screen is taken with it on.
  if (!isSceneEnabled()) setSceneEnabled(true);
  writeTimer(!!ask.timer);
  writeSession(PENDING_KEY, JSON.stringify(ask));
  window.location.replace(ask.path);
}

let started = false;

/** Called once, after the first render. */
export async function startDemoDriver(): Promise<void> {
  if (started) return;
  started = true;
  let handled = Number(readSession(HANDLED_KEY) ?? '0') || 0;

  const pendingRaw = readSession(PENDING_KEY);
  writeSession(PENDING_KEY, null);
  let pending: RouteAsk | null = null;
  try {
    const v: unknown = pendingRaw ? JSON.parse(pendingRaw) : null;
    if (isAsk(v)) pending = v;
  } catch {
    // Unreadable: as if nothing was asked.
  }

  if (pending) await finishPending(pending);
  else await settle();
  // Once per run of the app, not once per screen (each screen is a new page load).
  if (!readSession(READY_KEY)) {
    writeSession(READY_KEY, '1');
    console.log('[demo] ready');
  }

  let counter = 0;
  for (;;) {
    counter += 1;
    try {
      const res = await realFetch(`/demo-route.json?t=${counter}`, { cache: 'no-store' });
      if (res.ok) {
        const ask: unknown = await res.json();
        if (isAsk(ask) && ask.n !== handled) {
          handled = ask.n;
          writeSession(HANDLED_KEY, String(handled));
          if (ask.n !== 0) {
            await go(ask);
            return;
          }
        }
      }
    } catch {
      // Not there yet, or half written: ask again next time.
    }
    await sleep(POLL_MS);
  }
}
