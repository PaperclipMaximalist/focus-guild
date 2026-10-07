/**
 * Fuzz lab: property-based fuzzing of the scheduler's public API.
 *
 *   npm run lab:fuzz -- --n 5000 --seed 1        run 5000 cases, print violation classes
 *   npm run lab:fuzz -- --show 137               one case: inputs, every call, every violation
 *   npm run lab:fuzz -- --show 137 --dump        ...plus the exact arguments of each failing call
 *   npm run lab:fuzz -- --show 137 --brief       ...without the case's JSON
 *   npm run lab:fuzz -- --shrink 137 --class "overlap:kept/pinned"
 *                                                smallest case that still shows that class
 *   npm run lab:fuzz -- --only wild|api|ui       restrict to one tier of input
 *   npm run lab:fuzz -- --seeds                  list several ui-tier cases per class
 *   npm run lab:fuzz -- --from 1900 --n 100      a slice of the run (FUZZ_PROGRESS=all names each case)
 *   npm run lab:fuzz -- --show 1933 --print      a case's data without running it
 *   npm run lab:fuzz -- --hazard                 include inputs known to never return (negative breaks)
 *   npm run lab:fuzz -- --scale                  runtime vs task count and horizon
 *   npm run lab:fuzz -- --probe                  documented behaviour on a few odd inputs
 *
 * The population lab asks "is this a good week for a realistic person?".
 * This lab asks the opposite question: what is the worst input and the worst
 * order of taps, and does the plan still obey its hard rules? A case is a
 * starting state (quests, calendar, routines, settings, clock) plus up to
 * ~30 steps of what a person or a client can do: plan, replan, pin, swap,
 * delete, move, log progress, finish, defer, add, change settings, wait.
 * After every plan the checker tests the properties listed in `checkPlan`.
 *
 * Every case has a tier, worked out from its data, so a finding says who can
 * hit it:
 *   ui    only what the real client sends (quests inside the zod schemas,
 *         pin / unpin / delete / swap, settings inside their ranges);
 *   api   passes the routes' validation but the client never sends it
 *         (move_block, unknown block ids, an unparseable newStart);
 *   wild  inputs the routes reject (raw Tasks with NaN, dependencies,
 *         reversed fixed blocks, settings out of range).
 *
 * The app model below mirrors routes/schedule.ts (generate, replan, edit) so
 * a ui-tier finding is one a person can reach. Pure and seeded: no DB, no
 * network, no clock.
 */

import { performance } from 'node:perf_hooks';
import { generateSchedule, replan } from '../src/lib/scheduler/replan.js';
import { applyEdit } from '../src/lib/scheduler/edits.js';
import { questsToTasks, type QuestLike } from '../src/lib/scheduler/adapter.js';
import { placeDailyFillers, type DailyFiller } from '../src/lib/scheduler/dailyFiller.js';
import { CHRONOTYPE_CURVES, defaultConfig } from '../src/lib/scheduler/config.js';
import { eventsToFixedBlocks, isCalendarBlock } from '../src/lib/calendar/ics.js';
import { calibrateEstimates, computeInsights, type Calibration, type CompletedSample } from '../src/lib/scheduler/insights.js';
import { explainBlock, whyFromNote } from '../src/lib/scheduler/explain.js';
import type { Block, BreakPolicy, Edit, ScoreWeights, SchedulerResult, Task, UserConfig } from '../src/lib/scheduler/types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Minutes of slack on every "equals" property: the planner rounds shortfalls up. */
const TOL_MIN = 1;
/** The brief's budget for one planning call. */
const SLOW_MS = 250;
/** The constructor may run a block this far past the cap to finish a quota (TAIL_ABSORB_MIN). */
const TAIL_ABSORB_MIN = 20;

// ─── Args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (name: string, def: string | null = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? '') : def;
};
const N = Number(arg('n', '1000'));
const SEED = Number(arg('seed', '1'));
/** First case number, to resume a run or bisect a crash. */
const FROM = Number(arg('from', '0'));
const SHOW = arg('show') === null ? null : Number(arg('show'));
const SHRINK = arg('shrink') === null ? null : Number(arg('shrink'));
const CLASS = arg('class');
const ONLY = arg('only') as Tier | null;
const DUMP = argv.includes('--dump');

// ─── Seeded randomness ────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const chance = (r: Rng, p: number) => r() < p;
function weighted<T>(r: Rng, xs: ReadonlyArray<readonly [T, number]>): T {
  const total = xs.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of xs) if ((x -= w) < 0) return v;
  return xs[xs.length - 1]![0];
}

// ─── A case, as plain data (so it can be printed, cloned and shrunk) ──────────

type Tier = 'ui' | 'api' | 'wild';

/** A quest row as the routes store it: every field inside routes/quests.ts' zod schemas. */
interface QuestSpec {
  id: string;
  title: string;
  estimatedMinutes: number;
  mentalLoad: number;
  impact: number;
  deadline: number | null;
  status: 'ACTIVE' | 'COMPLETE' | 'NOT_TODAY' | 'RESCUE';
  actualMinutes: number | null;
  createdAt: number;
  updatedAt: number;
  tediousness?: number | null;
  category?: string | null;
  preferredHour?: number | null;
  minChunkMin?: number | null;
  maxChunkMin?: number | null;
  setupCost?: number | null;
  urgencyMult?: number | null;
  priorityTier?: 'HIGH' | 'MED' | 'LOW' | null;
  /** When "Not Today" was pressed; the routes revive it once that local day is over. */
  deferredAt?: number;
}

type CurveName = 'standard' | 'lark' | 'afternoon' | 'owl' | 'zero' | 'one' | 'nan' | 'five' | 'negative';

interface CfgSpec {
  workingHours: { startHour: number; endHour: number };
  horizonDays: number;
  softMaxBlockMin: number;
  breakPolicy: Partial<BreakPolicy>;
  scoreWeights: Partial<ScoreWeights>;
  curve: CurveName;
  /** Today's check-in: scales the energy curve (routes/schedule.ts configForUser). */
  energyScale: number | null;
  todayCapMin?: number;
  tzOffsetMin?: number;
}

interface EventSpec { id: string; title: string; start: number; end: number }

/** Where a move_block lands, resolved against the schedule when the step runs. */
type Target =
  | { at: 'now'; offMin: number }
  | { at: 'fixed'; idx: number; offMin: number }
  | { at: 'block'; idx: number; offMin: number }
  | { at: 'localHour'; day: number; hour: number }
  | { at: 'deadline'; offMin: number }
  | { at: 'nan' };

/** Which blocks an edit may pick: `fw` future unpinned work, `w` any work, `any` anything. */
type Pool = 'fw' | 'w' | 'any';

type Op =
  | { k: 'advance'; ms: number }
  | { k: 'advanceTo'; edge: 'start' | 'mid' | 'end'; idx: number }
  | { k: 'replan' }
  | { k: 'generate' }
  | { k: 'move'; pool: Pool; block: number; to: Target }
  | { k: 'swap'; poolA: Pool; a: number; poolB: Pool; b: number }
  | { k: 'delete'; pool: Pool; block: number }
  | { k: 'pin'; pool: Pool; block: number }
  | { k: 'unpin'; pool: Pool; block: number }
  | { k: 'editUnknown'; kind: Edit['kind'] }
  | { k: 'progress'; item: number; min: number }
  | { k: 'complete'; item: number }
  | { k: 'remove'; item: number }
  | { k: 'notToday'; item: number }
  | { k: 'addQuest'; quest: QuestSpec }
  | { k: 'addRaw'; task: Task }
  | { k: 'patchQuest'; item: number; patch: Partial<QuestSpec> }
  | { k: 'settings'; patch: Partial<CfgSpec> }
  | { k: 'addEvent'; ev: EventSpec }
  | { k: 'dropEvent'; idx: number };

interface Case {
  idx: number;
  now: number;
  cfg: CfgSpec;
  quests: QuestSpec[];
  /** Tasks handed to the scheduler as they are, bypassing the adapter (wild tier). */
  rawTasks: Task[];
  events: EventSpec[];
  /** Blocks handed to the scheduler as they are, bypassing the calendar (wild tier). */
  rawFixed: Block[];
  fillers: DailyFiller[];
  samples: CompletedSample[];
  ops: Op[];
}

const DEFAULT_CFG = (): CfgSpec => ({
  workingHours: { startHour: 9, endHour: 18 },
  horizonDays: 7,
  softMaxBlockMin: 90,
  breakPolicy: {},
  scoreWeights: {},
  curve: 'standard',
  energyScale: null,
});

const CURVES: Record<CurveName, (h: number) => number> = {
  ...CHRONOTYPE_CURVES,
  zero: () => 0,
  one: () => 1,
  nan: () => NaN,
  five: () => 5,
  negative: () => -1,
};

function buildConfig(s: CfgSpec): UserConfig {
  const base = defaultConfig();
  const curve = CURVES[s.curve];
  const scale = s.energyScale;
  return {
    ...base,
    breakPolicy: { ...base.breakPolicy, ...s.breakPolicy },
    scoreWeights: { ...base.scoreWeights, ...s.scoreWeights },
    workingHours: { ...s.workingHours },
    horizonDays: s.horizonDays,
    softMaxBlockMin: s.softMaxBlockMin,
    energyCurve: scale === null ? curve : (h: number) => Math.min(1, Math.max(0, curve(h) * scale)),
    tzOffsetMin: s.tzOffsetMin,
    ...(s.todayCapMin !== undefined ? { todayCapMin: s.todayCapMin } : {}),
  };
}

// ─── Tier: who can produce this case? ─────────────────────────────────────────

const isInt = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

/** True when routes/settings.ts, checkin.ts or schedule.ts would reject this config. */
function cfgIsWild(c: Partial<CfgSpec>): boolean {
  const wh = c.workingHours;
  // An end before the start runs past midnight; start == end is refused (routes/settings.ts).
  if (wh && !(inRange(wh.startHour, 0, 23.5) && inRange(wh.endHour, 0, 24) && Number.isInteger(wh.startHour * 2) && Number.isInteger(wh.endHour * 2) && spanHours(wh) > 0)) return true;
  if (c.horizonDays !== undefined && !isInt(c.horizonDays, 1, 30)) return true;
  if (c.softMaxBlockMin !== undefined && !isInt(c.softMaxBlockMin, 15, 480)) return true;
  const bp = c.breakPolicy;
  if (bp) {
    if (bp.shortBreakAfterMin !== undefined && !isInt(bp.shortBreakAfterMin, 15, 240)) return true;
    if (bp.shortBreakDurationMin !== undefined && !isInt(bp.shortBreakDurationMin, 1, 60)) return true;
    if (bp.longBreakAfterMin !== undefined && !isInt(bp.longBreakAfterMin, 30, 480)) return true;
    if (bp.longBreakDurationMin !== undefined && !isInt(bp.longBreakDurationMin, 5, 120)) return true;
  }
  for (const v of Object.values(c.scoreWeights ?? {})) if (!inRange(v as number, 0, 10)) return true;
  if (c.curve !== undefined && !(c.curve in CHRONOTYPE_CURVES)) return true;
  if (c.energyScale !== undefined && c.energyScale !== null && !inRange(c.energyScale, 0.74, 1.1)) return true;
  if (c.todayCapMin !== undefined && !isInt(c.todayCapMin, 0, 1440)) return true;
  if (c.tzOffsetMin !== undefined && !isInt(c.tzOffsetMin, -720, 840)) return true;
  return false;
}

/** Routines come from recurring quests (5..240 min) or the fillers route (1..60 min). */
const fillerIsWild = (f: DailyFiller) =>
  !isInt(f.durationMin, 1, 240) || !(f.preferredHour === null || isInt(f.preferredHour, 0, 23));

function opTier(op: Op): Tier {
  switch (op.k) {
    case 'addRaw': return 'wild';
    case 'settings': return cfgIsWild(op.patch) ? 'wild' : 'ui';
    case 'move':
    case 'editUnknown': return 'api';
    // The Feed only starts a drag on an upcoming, unpinned work block, and
    // only drops on a work block; pin and delete are offered on every tile.
    case 'swap': return op.poolA === 'fw' && op.poolB !== 'any' ? 'ui' : 'api';
    default: return 'ui';
  }
}

function tierOf(c: Case): Tier {
  let t: Tier = 'ui';
  if (c.rawTasks.length || c.rawFixed.length || cfgIsWild(c.cfg) || c.fillers.some(fillerIsWild)) return 'wild';
  if (c.samples.some((s) => !isInt(s.estimatedMinutes, 1, 1e9) || !isInt(s.actualMinutes, 1, 1e9))) return 'wild';
  for (const op of c.ops) {
    const ot = opTier(op);
    if (ot === 'wild') return 'wild';
    if (ot === 'api') t = 'api';
  }
  return t;
}

// ─── Generators ───────────────────────────────────────────────────────────────

const localMidnight = (t: number, tz: number) => Math.floor((t - tz * MIN) / DAY) * DAY + tz * MIN;

// Working hours whose end is before their start run past midnight (22–06).
// Worked out here on purpose, not imported from tz.ts: the checker must not
// share the planner's arithmetic.
type Hours = { startHour: number; endHour: number };
const crosses = (h: Hours) => h.endHour < h.startHour;
function spanHours(h: Hours): number { const d = h.endHour - h.startHour; return d < 0 ? d + 24 : d; }
/** When the user's day turns over, in ms after local midnight: the hour a night window closes. */
const turnMs = (h: Hours) => (crosses(h) ? h.endHour * HOUR : 0);
/** Local midnight of the date the working day containing `t` started on. */
const workDayMidnight = (t: number, tz: number, h: Hours) => localMidnight(t - turnMs(h), tz);
/** The working window that starts on the local day beginning at `mid`. */
const windowOn = (mid: number, h: Hours) => ({ start: mid + h.startHour * HOUR, end: mid + (crosses(h) ? DAY : 0) + h.endHour * HOUR });

/** getTimezoneOffset() values, including the :30 and :45 zones and both extremes. */
const TZS = [-720, -765, -570, -345, -330, -60, 0, 0, 60, 210, 240, 300, 420, 480, 600, 840];

/** Calendar dates worth opening the app on: DST changes (US, EU), year end, a leap day. */
const DATES: Array<[number, number, number]> = [
  [2026, 9, 5], [2026, 9, 5], [2026, 10, 1], [2026, 2, 8], [2026, 9, 25], [2026, 2, 29], [2026, 11, 31], [2028, 1, 29],
];

/** Local time of day the app is opened at, in ms after local midnight. */
function genTimeOfDay(r: Rng): number {
  return weighted(r, [
    [0, 2],
    [DAY - 1, 2], // 23:59:59.999
    [DAY - 1000, 2], // 23:59:59
    [9 * HOUR - 500, 2],
    [9 * HOUR, 4],
    [12 * HOUR + 34 * MIN + 56_789, 4],
    [17 * HOUR + 59 * MIN, 2],
    [18 * HOUR, 2],
    [20 * HOUR, 3],
    [int(r, 0, DAY - 1), 12],
    [int(r, 6 * 60, 22 * 60) * MIN, 12],
  ] as const);
}

const TITLES = ['Essay draft', 'Lab report', 'Email landlord', 'Pay bill', 'Design doc', 'Clear inbox', 'Problem set', 'Tidy notes', 'Expense report', 'Slide deck'];
const SIZES = [1, 3, 5, 7, 10, 15, 25, 30, 45, 60, 90, 120, 180, 240, 600, 1440, 10000];
const COMMON_SIZES = [10, 15, 30, 45, 60, 90, 120, 180, 240];

function genDeadline(r: Rng, now: number, cfg: CfgSpec, shared: number[]): number | null {
  const tz = cfg.tzOffsetMin ?? 0;
  const mid = localMidnight(now, tz);
  const horizon = Number.isFinite(cfg.horizonDays) ? Math.max(1, Math.min(60, Math.floor(cfg.horizonDays))) : 7;
  const hourOnDay = (d: number, h: number) => mid + d * DAY + h * HOUR;
  const kind = weighted(r, [
    ['none', 18], ['past', 7], ['now', 2], ['minute', 3], ['halfHour', 4], ['today', 10], ['tonight', 8], ['midnight', 4],
    ['tomorrow', 10], ['inHorizon', 14], ['windowStart', 3], ['horizonEdge', 5], ['far', 6], ['veryFar', 2], ['shared', shared.length ? 8 : 0],
  ] as const);
  switch (kind) {
    case 'none': return null;
    case 'past': return now - pick(r, [1, MIN, HOUR, DAY, 4 * DAY, 400 * DAY]);
    case 'now': return now;
    case 'minute': return now + MIN;
    case 'halfHour': return now + 30 * MIN;
    case 'today': return hourOnDay(0, int(r, 0, 47) / 2 + pick(r, [0, 0, 17 / 60]));
    case 'tonight': return hourOnDay(0, 23 + 59 / 60);
    case 'midnight': return hourOnDay(int(r, 1, horizon), 0);
    case 'tomorrow': return hourOnDay(1, pick(r, [8, 9, 10, 12, 17, 23 + 59 / 60]));
    case 'inHorizon': return hourOnDay(int(r, 1, horizon), pick(r, [8, 9, 10.25, 12, 17, 20, 23 + 59 / 60]));
    case 'windowStart': return hourOnDay(int(r, 0, horizon), cfg.workingHours.startHour);
    case 'horizonEdge': return now + horizon * DAY + pick(r, [-HOUR, -1, 0, 1, HOUR, 12 * HOUR, 25 * HOUR]);
    case 'far': return hourOnDay(int(r, horizon + 1, horizon + 30), 23 + 59 / 60);
    case 'veryFar': return now + pick(r, [400, 5 * 365]) * DAY;
    case 'shared': return pick(r, shared);
  }
}

function genQuest(r: Rng, id: string, now: number, cfg: CfgSpec, shared: number[]): QuestSpec {
  const deadline = genDeadline(r, now, cfg, shared);
  if (deadline !== null && shared.length < 3) shared.push(deadline);
  const est = chance(r, 0.7) ? pick(r, COMMON_SIZES) : pick(r, SIZES);
  const overdue = deadline !== null && deadline < now;
  const q: QuestSpec = {
    id,
    title: `${pick(r, TITLES)} ${id}`,
    estimatedMinutes: est,
    mentalLoad: chance(r, 0.3) ? pick(r, [1, 10]) : int(r, 1, 10),
    impact: chance(r, 0.3) ? pick(r, [1, 10]) : int(r, 1, 10),
    deadline,
    status: overdue && chance(r, 0.5) ? 'RESCUE' : chance(r, 0.05) ? 'NOT_TODAY' : 'ACTIVE',
    // Logged focus time: none, part of the estimate, exactly it, or well past it.
    actualMinutes: weighted(r, [[null, 14], [Math.max(1, Math.round(est * 0.4)), 3], [est, 1], [est * 2 + 5, 1]] as const),
    createdAt: now - pick(r, [0, 1, 3, 20, 400]) * DAY,
    updatedAt: now - pick(r, [0, 1, 3]) * DAY,
  };
  if (q.status === 'NOT_TODAY') q.deferredAt = now - pick(r, [0, MIN, 3 * HOUR]);
  // Scheduler hints: most people never touch them.
  if (chance(r, 0.3)) q.priorityTier = pick(r, ['HIGH', 'MED', 'LOW'] as const);
  if (chance(r, 0.25)) q.category = pick(r, ['admin', 'comms', 'deep_work', 'light']);
  if (chance(r, 0.2)) q.tediousness = pick(r, [0, 0.4, 0.9, 1]);
  if (chance(r, 0.12)) q.preferredHour = pick(r, [0, 23, 9, 14, 20]);
  if (chance(r, 0.15)) q.minChunkMin = pick(r, [5, 15, 45, 120, 480]);
  if (chance(r, 0.15)) q.maxChunkMin = pick(r, [5, 15, 25, 50, 120, 480]);
  if (chance(r, 0.1)) q.setupCost = pick(r, [0, 0.7, 1]);
  if (chance(r, 0.15)) q.urgencyMult = pick(r, [0, 0.5, 1, 1.5, 5]);
  return q;
}

/** A raw Task with at least one field no route would let through. */
function genRawTask(r: Rng, id: string, now: number, cfg: CfgSpec, shared: number[], ids: string[]): Task {
  const odd = <T,>(normal: T, ...weird: T[]): T => (chance(r, 0.25) ? pick(r, weird) : normal);
  const remaining = odd(pick(r, COMMON_SIZES), 0, 0.4, 1, 3, 7, 10000, -5, NaN, Infinity);
  const deadline = odd(genDeadline(r, now, cfg, shared) ?? now + 14 * DAY, NaN, Infinity, -Infinity, now + 0.5);
  const deps: string[] = [];
  if (chance(r, 0.25) && ids.length) {
    deps.push(pick(r, ids));
    if (chance(r, 0.3)) deps.push(id); // depends on itself
    if (chance(r, 0.3)) deps.push('no-such-task');
  }
  const t: Task = {
    id,
    name: `Raw ${id}`,
    remainingMin: remaining,
    totalMin: odd(Number.isFinite(remaining) ? Math.max(1, remaining) : 60, 0, 1, Math.max(0, remaining - 30)),
    deadline,
    tediousness: odd(0.4, 0, 1, -0.5, 1.5, NaN),
    cognitiveLoad: odd(pick(r, [0.2, 0.5, 0.8]), 0, 1, -0.5, 1.5, NaN),
    importance: odd(0.5, 0, 1, -1, 2, NaN),
    setupCost: odd(0.3, 0, 1, NaN),
    minChunkMin: odd(15, 0, 1, 90, 600, -10),
    maxChunkMin: odd(50, 0, 1, 5, 600, -10),
    category: pick(r, ['deep_work', 'admin', 'comms', '']),
    preferredHour: odd(null, 0, 23, 24, -1, 12.5, NaN),
    dependencies: deps,
    createdAt: odd(now - 3 * DAY, now + DAY, NaN, 0),
    lastWorkedAt: odd(null, now + DAY, NaN),
    status: weighted(r, [['pending', 8], ['in_progress', 2], ['done', 2]] as const),
    urgencyMultiplier: odd(1, 0, 0.5, 5, NaN, -1),
  };
  if (chance(r, 0.25)) t.notBefore = pick(r, [now - DAY, now + HOUR, now + DAY, deadline + HOUR, NaN]);
  return t;
}

function genEvents(r: Rng, now: number, cfg: CfgSpec): EventSpec[] {
  const tz = cfg.tzOffsetMin ?? 0;
  const mid = localMidnight(now, tz);
  const out: EventSpec[] = [];
  const add = (start: number, end: number, title = 'Meeting') => {
    if (end > start) out.push({ id: `e${out.length + 1}`, title, start, end });
  };
  const shape = weighted(r, [
    ['none', 38], ['few', 26], ['school', 10], ['overlapping', 6], ['everything', 3], ['hundreds', 2], ['backToBack', 5], ['edges', 6], ['past', 4],
  ] as const);
  switch (shape) {
    case 'none': break;
    case 'few':
      for (let i = 0; i < int(r, 1, 6); i++) { const s = mid + int(r, 0, 6) * DAY + int(r, 14, 44) * 30 * MIN; add(s, s + pick(r, [15, 30, 60, 90, 180]) * MIN); }
      break;
    case 'school':
      for (let d = 0; d < 14; d++) add(mid + d * DAY + (8 * 60 + 40) * MIN, mid + d * DAY + (15 * 60 + 10) * MIN, 'School');
      break;
    case 'overlapping': {
      const s = mid + int(r, 0, 2) * DAY + 10 * HOUR;
      for (let i = 0; i < int(r, 2, 8); i++) add(s + i * pick(r, [0, 10, 30]) * MIN, s + (60 + i * 20) * MIN);
      break;
    }
    case 'everything': add(now - DAY, now + 40 * DAY, 'Conference'); break;
    case 'hundreds':
      for (let i = 0; i < int(r, 200, 500); i++) add(mid + 8 * HOUR + i * 30 * MIN, mid + 8 * HOUR + i * 30 * MIN + pick(r, [10, 15, 20]) * MIN, 'Slot');
      break;
    case 'backToBack':
      for (let i = 0; i < int(r, 3, 12); i++) add(mid + 9 * HOUR + i * 45 * MIN, mid + 9 * HOUR + (i + 1) * 45 * MIN);
      break;
    case 'edges':
      add(now - 30 * MIN, now + 30 * MIN, 'In progress'); // started, not finished
      add(now + 2 * HOUR, now + 2 * HOUR + 1000, 'One second');
      add(mid + 23 * HOUR, mid + 26 * HOUR, 'Over midnight');
      add(now + HOUR + 17_000, now + 2 * HOUR - 3000, 'Odd seconds');
      break;
    case 'past':
      add(now - 3 * HOUR, now - 2 * HOUR); add(now - HOUR, now, 'Ends now'); add(now, now + HOUR, 'Starts now');
      break;
  }
  return out;
}

/** Blocks no calendar produces: zero-length, reversed, NaN, stray types, clashing ids. */
function genRawFixed(r: Rng, now: number): Block[] {
  const out: Block[] = [];
  const n = int(r, 1, 4);
  for (let i = 0; i < n; i++) {
    const s = now + int(r, -120, 3 * 24 * 60) * MIN;
    const shape = pick(r, ['zero', 'reversed', 'nan', 'fraction', 'break', 'buffer', 'unlocked', 'bigId', 'dupId'] as const);
    const b: Block = { id: `raw-${i + 1}`, start: s, end: s + HOUR, type: 'fixed', taskId: null, locked: true, note: null };
    if (shape === 'zero') b.end = b.start;
    if (shape === 'reversed') b.end = b.start - HOUR;
    if (shape === 'nan') { if (chance(r, 0.5)) b.start = NaN; else b.end = NaN; }
    if (shape === 'fraction') { b.start += 0.25; b.end += 0.75; }
    if (shape === 'break') b.type = 'break';
    if (shape === 'buffer') { b.type = 'buffer'; b.locked = false; }
    if (shape === 'unlocked') b.locked = false;
    // makeIdGen reads the trailing number: past 2^53 the next id repeats.
    if (shape === 'bigId') b.id = 'raw-9007199254740992';
    if (shape === 'dupId') b.id = 'raw-1';
    out.push(b);
  }
  return out;
}

const ROUTINES = ['Morning meds', 'Workout', 'Duolingo', 'Practice piano', 'Evening walk', 'Read before bed', 'Journal', 'End of day review', 'Lunch prep'];

function genFillers(r: Rng, wild: boolean): DailyFiller[] {
  const n = weighted(r, [[0, 50], [1, 15], [2, 15], [4, 12], [8, 8]] as const);
  const out: DailyFiller[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `recurring:r${i + 1}`,
      name: pick(r, ROUTINES),
      // Up to four hours each, so four of them outlast a nine-hour day.
      durationMin: wild && chance(r, 0.3) ? pick(r, [0, 600, 1500, -15, NaN, 7.5]) : pick(r, [1, 5, 15, 30, 60, 90, 240]),
      preferredHour: wild && chance(r, 0.2) ? pick(r, [24, -1, 12.5, NaN]) : chance(r, 0.4) ? pick(r, [0, 7, 12, 21, 23]) : null,
      enabled: true,
    });
  }
  return out;
}

function genCfg(r: Rng, wild: boolean): CfgSpec {
  const c = DEFAULT_CFG();
  c.tzOffsetMin = chance(r, 0.08) ? undefined : chance(r, 0.8) ? pick(r, TZS) : int(r, -720, 840);
  if (c.tzOffsetMin === -765) c.tzOffsetMin = -720;
  if (chance(r, 0.5)) {
    c.workingHours = weighted(r, [
      [{ startHour: 0, endHour: 24 }, 4], [{ startHour: 23.5, endHour: 24 }, 2], [{ startHour: 9, endHour: 9.5 }, 2],
      [{ startHour: 0, endHour: 1 }, 1], [{ startHour: 15.5, endHour: 21.5 }, 4], [{ startHour: 13, endHour: 24 }, 3],
      [{ startHour: 7, endHour: 22 }, 4],
      // An end before the start: the window runs past midnight.
      [{ startHour: 22, endHour: 6 }, 3], [{ startHour: 18, endHour: 9 }, 2], [{ startHour: 23.5, endHour: 0.5 }, 1], [{ startHour: 14, endHour: 0 }, 1],
      [{ startHour: int(r, 0, 47) / 2, endHour: int(r, 2, 48) / 2 }, 4],
    ] as const);
  }
  if (chance(r, 0.35)) c.horizonDays = pick(r, [1, 1, 2, 3, 14, 30]);
  if (chance(r, 0.25)) c.softMaxBlockMin = pick(r, [15, 25, 45, 240, 480]);
  if (chance(r, 0.2)) {
    c.breakPolicy = pick(r, [
      { shortBreakAfterMin: 15, shortBreakDurationMin: 60 },
      { shortBreakAfterMin: 240, shortBreakDurationMin: 1 },
      { longBreakAfterMin: 30, longBreakDurationMin: 120 },
      { longBreakAfterMin: 480, longBreakDurationMin: 5 },
      { shortBreakAfterMin: 15, shortBreakDurationMin: 60, longBreakAfterMin: 30, longBreakDurationMin: 120 },
    ]);
  }
  if (chance(r, 0.2)) {
    const keys = ['energy', 'urgency', 'batch', 'prefHour', 'monotony', 'tedium', 'cooldown', 'session'] as const;
    const all = chance(r, 0.3) ? pick(r, [0, 4, 10]) : null;
    for (const k of keys) if (all !== null || chance(r, 0.4)) c.scoreWeights[k] = all ?? pick(r, [0, 0.5, 4, 10]);
  }
  if (chance(r, 0.3)) c.curve = pick(r, ['lark', 'afternoon', 'owl'] as const);
  if (chance(r, 0.3)) {
    c.energyScale = pick(r, [0.74, 0.83, 0.92, 1.01, 1.1]);
    c.todayCapMin = pick(r, [0, 1, 30, 60, 120, 240, 480, 1440]);
  }
  if (!wild) return c;

  // Out of range: each of these is refused by a route, so findings that need
  // them are robustness notes, not bugs a person can reach.
  if (chance(r, 0.3)) c.workingHours = pick(r, [
    { startHour: 9, endHour: 9 }, { startHour: -1, endHour: 25 }, { startHour: 9.25, endHour: 17.1 }, { startHour: NaN, endHour: 18 }, { startHour: 9, endHour: NaN }, { startHour: 0, endHour: 48 },
  ]);
  if (chance(r, 0.25)) c.horizonDays = pick(r, [0, -1, 2.5, 45, NaN]);
  if (chance(r, 0.25)) c.softMaxBlockMin = pick(r, [0, 1, 5, 600, 10000, NaN, -30]);
  if (chance(r, 0.3)) c.breakPolicy = pick(r, [
    { shortBreakAfterMin: 0, shortBreakDurationMin: 0, longBreakAfterMin: 0, longBreakDurationMin: 0 },
    { shortBreakAfterMin: 100000, shortBreakDurationMin: 100000, longBreakAfterMin: 100000, longBreakDurationMin: 100000 },
    { shortBreakDurationMin: -30 }, { shortBreakAfterMin: NaN }, { longBreakDurationMin: 100000 }, { shortBreakDurationMin: 100000 },
  ]);
  // A negative break never ends: seed 1 case 1933 ran the process out of
  // memory (2 GB) inside one planning call, which no in-process check can
  // report. Left out unless --hazard asks for it, so a run can finish.
  if (!argv.includes('--hazard') && (c.breakPolicy.shortBreakDurationMin ?? 0) < 0) c.breakPolicy = { shortBreakDurationMin: 0 };
  if (chance(r, 0.3)) {
    const keys = ['energy', 'urgency', 'batch', 'prefHour', 'monotony', 'tedium', 'cooldown', 'session'] as const;
    for (const k of keys) if (chance(r, 0.5)) c.scoreWeights[k] = pick(r, [-2, -4, 100, NaN]);
  }
  if (chance(r, 0.2)) c.curve = pick(r, ['zero', 'one', 'nan', 'five', 'negative'] as const);
  if (chance(r, 0.2)) c.todayCapMin = pick(r, [10000, -5, NaN, 0.5]);
  if (chance(r, 0.15)) c.tzOffsetMin = pick(r, [900, -800, 0.5, NaN]);
  return c;
}

function genTarget(r: Rng): Target {
  return weighted(r, [
    [{ at: 'fixed', idx: int(r, 0, 5), offMin: pick(r, [0, 0, -15, 10]) } as Target, 5],
    [{ at: 'block', idx: int(r, 0, 9), offMin: pick(r, [0, 0, 15, -10]) } as Target, 5],
    [{ at: 'now', offMin: pick(r, [-600, -30, -1, 0, 5, 60, 600, 3 * 1440, 400 * 1440]) } as Target, 6],
    [{ at: 'localHour', day: int(r, 0, 3), hour: pick(r, [0, 3, 6, 12, 22, 23.75]) } as Target, 5],
    [{ at: 'deadline', offMin: pick(r, [-30, 0, 1, 60]) } as Target, 3],
    [{ at: 'nan' } as Target, 1],
  ] as const);
}

function genOps(r: Rng, tier: Tier, c: Case, len: number): Op[] {
  const ops: Op[] = [];
  let questSeq = c.quests.length;
  let rawSeq = c.rawTasks.length;
  const shared: number[] = [];
  const editPool = (): Pool => (tier === 'ui' ? pick(r, ['fw', 'fw', 'w', 'any'] as const) : pick(r, ['fw', 'fw', 'w', 'any', 'any'] as const));
  let now = c.now;
  while (ops.length < len) {
    const kind = weighted(r, [
      ['advance', 14], ['advanceTo', 8], ['replan', 12], ['generate', 3], ['pin', 6], ['unpin', 3], ['delete', 6], ['swap', 6],
      ['move', tier === 'ui' ? 0 : 12], ['editUnknown', tier === 'ui' ? 0 : 2],
      ['progress', 8], ['complete', 6], ['remove', 3], ['notToday', 3], ['addQuest', 5], ['addRaw', tier === 'wild' ? 3 : 0],
      ['patchQuest', 4], ['settings', 3], ['addEvent', 3], ['dropEvent', 1],
    ] as const);
    let replanAfter = false;
    switch (kind) {
      case 'advance': {
        const ms = pick(r, [0, 1, 59_999, MIN, 7 * MIN, 25 * MIN, 50 * MIN, 90 * MIN, 3 * HOUR, 8 * HOUR, 16 * HOUR, DAY, 3 * DAY, 10 * DAY, 40 * DAY]);
        ops.push({ k: 'advance', ms }); now += ms; replanAfter = chance(r, 0.8);
        break;
      }
      case 'advanceTo': ops.push({ k: 'advanceTo', edge: pick(r, ['start', 'mid', 'end'] as const), idx: int(r, 0, 4) }); replanAfter = chance(r, 0.8); break;
      case 'replan': ops.push({ k: 'replan' }); break;
      case 'generate': ops.push({ k: 'generate' }); break;
      case 'pin': ops.push({ k: 'pin', pool: editPool(), block: int(r, 0, 20) }); break;
      case 'unpin': ops.push({ k: 'unpin', pool: editPool(), block: int(r, 0, 20) }); break;
      case 'delete': ops.push({ k: 'delete', pool: editPool(), block: int(r, 0, 20) }); break;
      case 'swap':
        ops.push(tier === 'ui'
          ? { k: 'swap', poolA: 'fw', a: int(r, 0, 20), poolB: pick(r, ['fw', 'fw', 'w'] as const), b: int(r, 0, 20) }
          : { k: 'swap', poolA: editPool(), a: int(r, 0, 20), poolB: editPool(), b: int(r, 0, 20) });
        break;
      case 'move': ops.push({ k: 'move', pool: editPool(), block: int(r, 0, 20), to: genTarget(r) }); break;
      case 'editUnknown': ops.push({ k: 'editUnknown', kind: pick(r, ['move_block', 'swap_blocks', 'delete_block', 'pin_block', 'unpin_block'] as const) }); break;
      case 'progress': ops.push({ k: 'progress', item: int(r, 0, 30), min: pick(r, [1, 5, 15, 25, 30, 60, 600]) }); replanAfter = chance(r, 0.8); break;
      case 'complete': ops.push({ k: 'complete', item: int(r, 0, 30) }); replanAfter = chance(r, 0.8); break;
      case 'remove': ops.push({ k: 'remove', item: int(r, 0, 30) }); replanAfter = chance(r, 0.8); break;
      case 'notToday': ops.push({ k: 'notToday', item: int(r, 0, 30) }); replanAfter = chance(r, 0.8); break;
      case 'addQuest': questSeq += 1; ops.push({ k: 'addQuest', quest: genQuest(r, `q${questSeq}`, now, c.cfg, shared) }); replanAfter = chance(r, 0.9); break;
      case 'addRaw': rawSeq += 1; ops.push({ k: 'addRaw', task: genRawTask(r, `t${rawSeq}`, now, c.cfg, shared, c.rawTasks.map((t) => t.id)) }); replanAfter = true; break;
      case 'patchQuest': {
        const patch: Partial<QuestSpec> = pick(r, [
          { deadline: now + pick(r, [-HOUR, 30 * MIN, DAY, 20 * DAY]) }, { deadline: null },
          { estimatedMinutes: pick(r, [5, 30, 240, 1440]) }, { priorityTier: pick(r, ['HIGH', 'LOW'] as const) },
          { maxChunkMin: pick(r, [5, 25, 480]) }, { minChunkMin: pick(r, [5, 60, 480]) }, { mentalLoad: pick(r, [1, 10]) },
        ]);
        ops.push({ k: 'patchQuest', item: int(r, 0, 30), patch }); replanAfter = chance(r, 0.8);
        break;
      }
      case 'settings': {
        const full = genCfg(r, tier === 'wild');
        const patch: Partial<CfgSpec> = pick(r, [
          { workingHours: full.workingHours }, { horizonDays: full.horizonDays }, { softMaxBlockMin: full.softMaxBlockMin },
          { breakPolicy: full.breakPolicy }, { curve: full.curve }, { scoreWeights: full.scoreWeights },
          // A check-in after the plan was made.
          { todayCapMin: pick(r, [0, 30, 60, 120, 480]), energyScale: pick(r, [0.74, 0.92, 1.1]) },
          { todayCapMin: pick(r, [0, 30, 60, 120, 480]), energyScale: pick(r, [0.74, 0.92, 1.1]) },
        ]);
        ops.push({ k: 'settings', patch }); replanAfter = true;
        break;
      }
      case 'addEvent': {
        const s = pick(r, [now + 10 * MIN, now + HOUR, now + DAY, now - 20 * MIN]);
        ops.push({ k: 'addEvent', ev: { id: `x${ops.length}`, title: 'New meeting', start: s, end: s + pick(r, [30, 60, 240]) * MIN } }); replanAfter = chance(r, 0.9);
        break;
      }
      case 'dropEvent': ops.push({ k: 'dropEvent', idx: int(r, 0, 10) }); replanAfter = chance(r, 0.9); break;
    }
    if (replanAfter) ops.push({ k: 'replan' });
  }
  if (ops.length && ops[ops.length - 1]!.k !== 'replan') ops.push({ k: 'replan' });
  return ops;
}

function genCase(idx: number, seed = SEED, forced: Tier | null = ONLY): Case {
  const r = mulberry32(seed * 1_000_003 + idx * 7919);
  const tier: Tier = forced ?? weighted(r, [['ui', 45], ['api', 15], ['wild', 40]] as const);
  const wild = tier === 'wild';
  const cfg = genCfg(r, wild);
  const tz = Number.isFinite(cfg.tzOffsetMin) ? (cfg.tzOffsetMin as number) : 0;
  const [y, m, d] = pick(r, DATES);
  const now = Date.UTC(y, m, d) + tz * MIN + genTimeOfDay(r);

  // 0, 1 and 200 tasks are all on the list; most cases stay small so the
  // shrunk repro is close to what the generator made.
  const nItems = weighted(r, [[0, 6], [1, 14], [int(r, 2, 8), 55], [int(r, 9, 25), 20], [int(r, 26, 60), 4], [200, 1]] as const);
  const shared: number[] = [];
  const quests: QuestSpec[] = [];
  const rawTasks: Task[] = [];
  for (let i = 0; i < nItems; i++) {
    if (wild && chance(r, 0.5)) {
      // Ids that differ only in case, and (rarely) an outright duplicate.
      const id = chance(r, 0.15) && rawTasks.length ? (chance(r, 0.7) ? rawTasks[0]!.id.toUpperCase() : rawTasks[0]!.id) : `t${rawTasks.length + 1}`;
      rawTasks.push(genRawTask(r, id, now, cfg, shared, rawTasks.map((t) => t.id)));
    } else quests.push(genQuest(r, `q${quests.length + 1}`, now, cfg, shared));
  }

  const samples: CompletedSample[] = [];
  if (chance(r, 0.25)) {
    const ratio = pick(r, [0.3, 0.7, 1, 1.4, 3]);
    for (let i = 0; i < int(r, 3, 12); i++) {
      const est = pick(r, [5, 15, 30, 60, 240]);
      samples.push({ category: pick(r, [null, 'admin', 'deep_work']), estimatedMinutes: est, actualMinutes: Math.max(1, Math.round(est * ratio * (0.7 + r() * 0.6))) });
    }
    if (wild) samples.push({ category: null, estimatedMinutes: pick(r, [0, -30, NaN]), actualMinutes: pick(r, [0, NaN, 1e12]) });
  }

  const c: Case = {
    idx, now, cfg, quests, rawTasks,
    events: genEvents(r, now, cfg),
    rawFixed: wild && chance(r, 0.4) ? genRawFixed(r, now) : [],
    fillers: genFillers(r, wild),
    samples,
    ops: [],
  };
  // Long sequences on a 200-quest month would dominate the run time.
  const maxLen = nItems > 60 ? 3 : nItems > 25 ? 10 : 30;
  const len = Math.min(maxLen, weighted(r, [[0, 15], [int(r, 1, 5), 35], [int(r, 6, 15), 35], [int(r, 16, 30), 15]] as const));
  c.ops = genOps(r, tier, c, len);
  return c;
}

// ─── Checker ──────────────────────────────────────────────────────────────────

interface Violation { cls: string; step: number; call: string; detail: string }
interface Timing { ms: number; fn: 'generate' | 'replan'; tasks: number; blocks: number; horizon: number }
interface CallDump { step: number; fn: string; now: number; tasks: Task[]; blocks: Block[]; out: Block[] | null; issues: SchedulerResult['feasibilityReport']['issues'] | null }

const keyOf = (b: Block) => `${b.id}|${b.start}|${b.end}|${b.type}|${b.taskId}|${b.locked}|${b.note}`;
/**
 * Has this block stayed put? A work block's note is its "why now" sentence,
 * which the planner rewrites from the finished plan (explain.explainPlan), so
 * a new reason on an unmoved block is not a change; a fixed block's note is
 * its name and must survive.
 */
const stayKey = (b: Block) => (b.type === 'work' ? `${b.id}|${b.start}|${b.end}|${b.type}|${b.taskId}|${b.locked}` : keyOf(b));
const placeKey = (b: Block) => `${b.id}|${b.start}|${b.end}|${b.type}|${b.taskId}`;
const minutes = (b: { start: number; end: number }) => (b.end - b.start) / MIN;
/** `MM-DD HH:MM` in the user's zone; the raw number when it isn't a date at all. */
const clock = (t: number, tz: number) => {
  const d = new Date(t - tz * MIN);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(5, 16).replace('T', ' ') : String(t);
};
const BAD_TEXT = /undefined|NaN|Infinity|\[object|null|-\d/;

/** The days the planner may use, worked out here independently of budget.ts. */
function workingWindows(cfg: UserConfig, now: number): Array<{ mid: number; start: number; end: number }> {
  const tz = cfg.tzOffsetMin ?? 0;
  const mid0 = workDayMidnight(now, tz, cfg.workingHours);
  const horizonEnd = now + cfg.horizonDays * DAY;
  const out: Array<{ mid: number; start: number; end: number }> = [];
  for (let d = 0; d < cfg.horizonDays && d < 400; d++) {
    const mid = mid0 + d * DAY;
    const w = windowOn(mid, cfg.workingHours);
    const start = Math.max(w.start, now);
    const end = Math.min(w.end, horizonEnd);
    if (end > start) out.push({ mid, start, end });
  }
  return out;
}

function eligible(t: Task, byId: Map<string, Task>, now: number): boolean {
  if (t.status === 'done' || !(t.remainingMin > 0.5) || !(t.deadline > now)) return false;
  for (const id of t.dependencies) if (byId.get(id)?.status !== 'done') return false;
  return true;
}

/** Numbers a person will read: none may be NaN, infinite or negative. */
function badNumbers(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') { if (!Number.isFinite(v) || v < 0) out.push(`${path}=${v}`); return; }
  if (typeof v === 'string') { if (/undefined|NaN|Infinity|\[object|-\d/.test(v)) out.push(`${path}="${v}"`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => badNumbers(x, `${path}[${i}]`, out)); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) badNumbers(x, `${path}.${k}`, out);
}

interface PlanCheckInput {
  kind: 'generate' | 'replan';
  /** generate: the fixed blocks passed in. replan: the schedule passed in. */
  before: Block[];
  tasks: Task[];
  cfg: UserConfig;
  now: number;
  result: SchedulerResult;
  add: (cls: string, detail: string) => void;
}

/**
 * The hard properties of one plan. Blocks are sorted into: past (ended),
 * fixed, pinned (the user's, `locked`), kept (unpinned work a replan left
 * where it was) and new (work this call placed). The planner answers for
 * kept and new; pins are the user's responsibility.
 */
function checkPlan({ kind, before, tasks, cfg, now, result, add }: PlanCheckInput): void {
  const tz = cfg.tzOffsetMin ?? 0;
  const out = result.schedule;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const at = (b: Block) => `${b.id} ${clock(b.start, tz)}–${clock(b.end, tz).slice(6)} task=${b.taskId}`;

  // Every fixed, pinned and past block comes back exactly as it went in.
  const outKeys = new Set(out.map(stayKey));
  for (const b of before) {
    if (!Number.isFinite(b.start) || !Number.isFinite(b.end)) continue; // judged by block:non-finite below
    const group = kind === 'generate' ? 'fixed' : b.end <= now ? 'past' : b.type === 'fixed' ? 'fixed' : b.locked ? 'pinned' : null;
    // A pin for a quest that is finished or deleted holds time for nothing, and
    // is flagged below as an orphan when it stays. Flagging it here too when
    // it goes left the scheduler no right answer.
    const owner = b.taskId ? byId.get(b.taskId) : undefined;
    if (group === 'pinned' && b.type === 'work' && b.taskId && (!owner || owner.status === 'done')) continue;
    if (group && !outKeys.has(stayKey(b))) add(`preserve:${group}-block-lost-or-changed (${kind})`, at(b));
  }

  const ids = new Set<string>();
  for (const b of out) {
    if (ids.has(b.id)) { add('block:duplicate-id', `${b.id} appears twice`); break; }
    ids.add(b.id);
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.start < out[i - 1]!.start) { add('schedule:not-sorted-by-start', `${at(out[i - 1]!)} before ${at(out[i]!)}`); break; }
  }

  const beforePlace = new Set(before.filter((b) => b.type === 'work' && !b.locked).map(placeKey));
  const windows = workingWindows(cfg, now);
  const horizonEnd = now + cfg.horizonDays * DAY;
  // "Today" is the working day the user is in: for 22–06 it runs to 06:00.
  const today = workDayMidnight(now, tz, cfg.workingHours) + turnMs(cfg.workingHours);
  const inHours = (b: Block) => {
    const w = windowOn(workDayMidnight(b.start, tz, cfg.workingHours), cfg.workingHours);
    return b.start >= w.start && b.end <= w.end;
  };

  type Kind = 'new' | 'kept' | 'pinned' | 'fixed';
  const live: Array<{ b: Block; k: Kind }> = [];
  const perTask = new Map<string, { kept: number; fresh: number; pinned: number; future: number; pinnedLate: number }>();
  const tally = (id: string) => {
    let x = perTask.get(id);
    if (!x) { x = { kept: 0, fresh: 0, pinned: 0, future: 0, pinnedLate: 0 }; perTask.set(id, x); }
    return x;
  };
  let todayNew = 0;
  let todayKept = 0;

  for (const b of out) {
    if (!Number.isFinite(b.start) || !Number.isFinite(b.end)) { add(`block:non-finite-time (${b.type}${b.locked ? ', pinned' : ''})`, at(b)); continue; }
    if (b.end <= now) continue; // past
    if (b.type === 'fixed') { if (b.end > b.start) live.push({ b, k: 'fixed' }); continue; }
    if (b.type !== 'work') continue;
    const t = b.taskId ? byId.get(b.taskId) : undefined;
    // The planner's clock is the next whole minute: the last 40 seconds of a
    // block in progress are not minutes anyone can still plan with.
    const future = Math.max(0, b.end - Math.max(b.start, Math.ceil(now / MIN) * MIN)) / MIN;
    if (b.locked) {
      if (b.end > b.start) live.push({ b, k: 'pinned' });
      // A pin is the user's, so it stays; a pin for a quest that is gone is
      // still worth knowing about: it holds time for nothing.
      if (!t) add('orphan:pinned-block-for-absent-task', at(b));
      else if (t.status === 'done') add('orphan:pinned-block-for-done-task', at(b));
      if (t && b.taskId) { const x = tally(b.taskId); x.pinned += minutes(b); x.future += future; x.pinnedLate += Math.max(0, b.end - Math.max(b.start, now, t.deadline)) / MIN; }
      continue;
    }

    const k: Kind = kind === 'replan' && beforePlace.has(placeKey(b)) ? 'kept' : 'new';
    if (!Number.isInteger(b.start) || !Number.isInteger(b.end)) add(`block:non-integer-ms (${k})`, at(b));
    if (b.end <= b.start) { add(`block:empty-or-reversed (${k})`, at(b)); continue; }
    live.push({ b, k });
    if (!Number.isInteger(minutes(b))) add(`block:fraction-of-a-minute (${k})`, `${at(b)} lasts ${minutes(b)} min`);

    if (!t) { add(`orphan:${k}-block-for-absent-task`, at(b)); continue; }
    if (t.status === 'done') add(`orphan:${k}-block-for-done-task`, at(b));
    const x = tally(t.id);
    if (k === 'kept') x.kept += minutes(b); else x.fresh += minutes(b);
    x.future += future;

    if (k === 'new' && b.start < now) add('time:new-work-before-now', `${at(b)}, now ${clock(now, tz)}`);
    if (b.end > t.deadline) add(`time:${k}-work-past-deadline`, `${at(b)}, due ${clock(t.deadline, tz)}`);
    if (t.notBefore !== undefined && b.start < t.notBefore) add(`time:${k}-work-before-notBefore`, `${at(b)}, not before ${clock(t.notBefore, tz)}`);
    if (!inHours(b) || (k === 'new' && b.end > horizonEnd)) {
      add(`time:${k}-work-outside-working-hours`, `${at(b)}, hours ${cfg.workingHours.startHour}–${cfg.workingHours.endHour}`);
    }
    if (k === 'new' && !eligible(t, byId, now)) add('orphan:new-block-for-ineligible-task', `${at(b)} remaining=${t.remainingMin} deps=${t.dependencies.join(',')}`);

    // Session length, as the quest form promises it ("max session").
    if (k === 'new' && t.maxChunkMin > 0 && t.maxChunkMin >= t.minChunkMin && minutes(b) > t.maxChunkMin + TAIL_ABSORB_MIN + 0.5) {
      add('chunk:new-block-longer-than-maxChunkMin+20', `${at(b)} is ${minutes(b)} min, max ${t.maxChunkMin}`);
    }

    if (b.start >= today && b.start < today + DAY) { if (k === 'new') todayNew += future; else todayKept += future; }
    if (k === 'new') {
      const why = whyFromNote(b.note);
      if (why === null) add('note:new-block-without-why', `${at(b)} note=${b.note}`);
      else if (BAD_TEXT.test(why)) add('note:bad-text-in-why', `${at(b)} "${why}"`);
    }
  }

  // Overlaps: sweep in start order against everything still running.
  const sorted = [...live].sort((a, b) => a.b.start - b.b.start || a.b.end - b.b.end);
  let running: typeof live = [];
  for (const cur of sorted) {
    running = running.filter((x) => x.b.end > cur.b.start);
    for (const other of running) {
      const pair = [other.k, cur.k].sort().join('/');
      // Fixed and pinned blocks may sit on each other: neither is the planner's.
      if (!pair.includes('new') && !pair.includes('kept')) continue;
      add(`overlap:${pair}`, `${at(other.b)} × ${at(cur.b)}`);
    }
    running.push(cur);
  }

  // Minutes per quest, and what the report says about them.
  const issues = result.feasibilityReport.issues;
  const issueFor = new Map<string, number>();
  for (const i of issues) {
    if (issueFor.has(i.taskId)) add('report:duplicate-issue', i.taskId);
    issueFor.set(i.taskId, i.shortfallMin);
    if (!Number.isFinite(i.shortfallMin) || i.shortfallMin <= 0) add('report:bad-shortfall', `${i.taskId} shortfall=${i.shortfallMin}`);
    if (i.suggestions.some((s) => BAD_TEXT.test(s))) add('report:bad-text-in-suggestion', i.suggestions.join(' '));
    const t = byId.get(i.taskId);
    if (!t || !eligible(t, byId, now)) add('report:issue-for-ineligible-task', i.taskId);
  }
  if (result.feasibilityReport.ok !== (issues.length === 0)) add('report:ok-flag-disagrees-with-issues', `ok=${result.feasibilityReport.ok} issues=${issues.length}`);

  const lastWindowEnd = windows.length ? windows[windows.length - 1]!.end : -Infinity;
  for (const t of tasks) {
    if (byId.get(t.id) !== t) continue; // a duplicate id: the scheduler only sees the last one
    const x = perTask.get(t.id) ?? { kept: 0, fresh: 0, pinned: 0, future: 0, pinnedLate: 0 };
    const rem = t.remainingMin;
    if (!Number.isFinite(rem)) continue;
    const tag = `${t.id} remaining=${rem} kept=${x.kept} new=${x.fresh} pinned=${x.pinned} future=${x.future}`;
    // Minutes pinned after the deadline don't count toward meeting it: the
    // work is still owed before the deadline, or reported short. They used to
    // be counted here as planned, so a plan with the work on time AND the
    // user's late pin was "over-planned", one that reported it short
    // "exceeded remaining", and one that counted the pin was flagged for
    // that: every answer was a violation.
    const late = x.pinnedLate;
    const future = x.future - late;
    const pinned = x.pinned - late;
    if (future > Math.max(0, rem) + 0.5) {
      // More planned than is left to do. The user's own pins don't count against the planner.
      if (pinned > rem + 0.5 && x.fresh < 0.5 && x.kept < 0.5) add('minutes:pins-exceed-remaining (user’s doing)', tag);
      else if (x.fresh > 0.5) add(`minutes:over-planned, ${kind} placed more than is left`, tag);
      else add('minutes:over-planned, kept blocks not trimmed', tag);
      continue;
    }
    if (!eligible(t, byId, now)) continue;
    const short = issueFor.get(t.id) ?? 0;
    const full = x.kept + x.fresh + pinned;
    if (!issueFor.has(t.id) && !(t.deadline <= lastWindowEnd)) continue; // due after the plan: paced, not owed in full
    // A block in progress counts whole or by its future part; either reading is fair.
    const okWhole = Math.abs(full + short - rem) <= TOL_MIN;
    const okFuture = Math.abs(future + short - rem) <= TOL_MIN;
    if (!okWhole && !okFuture) {
      const countedLate = Math.abs(full + late + short - rem) <= TOL_MIN || Math.abs(future + late + short - rem) <= TOL_MIN;
      if (late > 0.5 && countedLate) add('minutes:pin-after-deadline-counts-as-on-time', `${tag} late=${late} shortfall=${short}`);
      else if (full + short < rem) add(`minutes:silently-under-planned (${kind})`, `${tag} shortfall=${short}`);
      else add(`minutes:placed+shortfall-exceeds-remaining (${kind})`, `${tag} shortfall=${short}`);
    }
  }

  // The check-in's "minutes available today".
  const cap = cfg.todayCapMin;
  if (cap !== undefined && Number.isFinite(cap) && windows.length && windows[0]!.mid <= localMidnight(now, tz)) {
    const limit = Math.max(0, cap) + 0.5;
    if (todayNew > limit) add(`cap:today-over-check-in-cap (${kind}, new work alone)`, `new today ${todayNew} min, cap ${cap}`);
    else if (todayNew > 0.5 && todayNew + todayKept > limit) add('cap:today-over-check-in-cap (replan added to kept work)', `kept ${todayKept} + new ${todayNew} min, cap ${cap}`);
    else if (todayKept > limit) add('cap:today-over-check-in-cap (kept work only)', `kept today ${todayKept} min, cap ${cap}`);
  }
}

function diffSchedules(a: Block[], b: Block[], key: (b: Block) => string = keyOf): { gone: number; added: number } {
  const ka = new Set(a.map(key));
  const kb = new Set(b.map(key));
  let gone = 0;
  let added = 0;
  for (const k of ka) if (!kb.has(k)) gone += 1;
  for (const k of kb) if (!ka.has(k)) added += 1;
  return { gone, added };
}

// ─── App model: one case, run the way routes/schedule.ts runs it ──────────────

interface RunOptions { trace?: boolean; dump?: boolean; light?: boolean }
interface RunResult { violations: Violation[]; timings: Timing[]; trace: string[]; dumps: CallDump[] }

function toQuestLike(q: QuestSpec): QuestLike {
  return { ...q, deadline: q.deadline === null ? null : new Date(q.deadline), tags: [], createdAt: new Date(q.createdAt), updatedAt: new Date(q.updatedAt) };
}

function runCase(c0: Case, opt: RunOptions = {}): RunResult {
  const c = structuredClone(c0);
  const violations: Violation[] = [];
  const timings: Timing[] = [];
  const trace: string[] = [];
  const dumps: CallDump[] = [];
  const seen = new Set<string>();
  let step = 0;
  let call = 'setup';
  let now = c.now;
  let spec = c.cfg;
  let cfg = buildConfig(spec);
  let schedule: Block[] = [];
  let failedThisCall = false;
  const tz = () => (Number.isFinite(cfg.tzOffsetMin) ? (cfg.tzOffsetMin as number) : 0);
  const log = (s: string) => { if (opt.trace) trace.push(s); };

  const add = (cls: string, detail: string) => {
    failedThisCall = true;
    log(`      !! ${cls}: ${detail}`);
    if (seen.has(cls)) return;
    seen.add(cls);
    violations.push({ cls, step, call, detail });
  };

  /** Run `f`; a throw is a violation named after the function and the message. */
  const guard = <T,>(fn: string, f: () => T): T | undefined => {
    try {
      return f();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message.split('\n')[0]}` : String(e);
      add(`throws:${fn}: ${msg.replace(/\d+/g, '#').slice(0, 90)}`, msg);
      return undefined;
    }
  };

  const calibration = (): Calibration | null => guard('calibrateEstimates', () => calibrateEstimates(c.samples)) ?? null;
  const cal = calibration();
  if (cal) { const bad: string[] = []; badNumbers(cal, 'calibration', bad); if (bad.length) add('insights:bad-number-in-calibration', bad.join(', ')); }

  const tasksNow = (): Task[] => {
    // The quest list revives "Not Today" once its local day is over (lib/deferral.ts).
    for (const q of c.quests) {
      if (q.status === 'NOT_TODAY' && q.deferredAt !== undefined && q.deferredAt < workDayMidnight(now, tz(), cfg.workingHours) + turnMs(cfg.workingHours)) q.status = 'ACTIVE';
    }
    const adapted = guard('questsToTasks', () => questsToTasks(c.quests.map(toQuestLike), {}, now, cfg.tzOffsetMin, cal, cfg.workingHours)) ?? [];
    return [...adapted, ...c.rawTasks];
  };
  const calendarNow = (): Block[] =>
    guard('eventsToFixedBlocks', () => eventsToFixedBlocks(c.events.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) })), now)) ?? [];

  const checkFillers = (placed: Block[], existing: Block[]) => {
    const solid = existing.filter((b) => Number.isFinite(b.start) && b.end > b.start);
    for (const b of placed) {
      if (!Number.isFinite(b.start) || !Number.isFinite(b.end)) { add('routine:non-finite-time', b.id); continue; }
      if (b.end <= b.start) { add('routine:empty-or-reversed', `${b.id} ${minutes(b)} min`); continue; }
      if (b.start < now) add('routine:placed-before-now', `${b.note} ${clock(b.start, tz())}, now ${clock(now, tz())}`);
      const hit = [...solid, ...placed.filter((p) => p !== b && p.end > p.start)].find((o) => o.start < b.end && b.start < o.end);
      if (hit) add(`routine:overlaps-${hit.note?.startsWith('Daily:') ? 'another-routine' : 'fixed-block'}`, `${b.note} ${clock(b.start, tz())} × ${hit.note} ${clock(hit.start, tz())}`);
    }
  };

  const afterPlan = (fn: 'generate' | 'replan', tasks: Task[], before: Block[], result: SchedulerResult | undefined, ms: number) => {
    timings.push({ ms, fn, tasks: tasks.length, blocks: before.length, horizon: cfg.horizonDays });
    if (ms > SLOW_MS) add(`slow:${fn} over ${SLOW_MS} ms`, `${ms.toFixed(0)} ms, ${tasks.length} tasks, ${before.length} blocks in, horizon ${cfg.horizonDays} d`);
    if (!result) { if (opt.dump) dumps.push({ step, fn, now, tasks, blocks: before, out: null, issues: null }); return; }
    checkPlan({ kind: fn, before, tasks, cfg, now, result, add });

    // What the Feed shows next to the plan.
    const quests = [
      ...c.quests.filter((q) => q.status !== 'COMPLETE').map((q) => ({ id: q.id, title: q.title, deadline: q.deadline === null ? null : new Date(q.deadline) })),
      ...c.rawTasks.map((t) => ({ id: t.id, title: t.name, deadline: new Date(t.deadline) })),
    ];
    const insights = guard('computeInsights', () =>
      computeInsights({
        schedule: result.schedule, tasks, quests,
        routineBlocks: result.schedule.filter((b) => b.type === 'fixed' && b.note?.startsWith('Daily:')),
        calendarBlocks: result.schedule.filter(isCalendarBlock),
        config: cfg, now, calibration: cal,
      }));
    if (insights) {
      const bad: string[] = [];
      badNumbers({ ...insights, calibration: null }, 'insights', bad);
      if (bad.length) add(`insights:bad-value (${bad[0]!.replace(/[=[].*$/, '')})`, bad.slice(0, 4).join(', '));
    }
    const sample = result.schedule.length > 40 ? result.schedule.slice(0, 40) : result.schedule;
    for (const b of sample) {
      const text = guard('explainBlock', () => explainBlock(b.id, result.schedule, tasks));
      if (text !== undefined && (typeof text !== 'string' || /undefined|NaN|Infinity|\[object/.test(text))) { add('note:bad-text-in-explainBlock', `${b.id}: ${text}`); break; }
    }
    guard('explainBlock', () => explainBlock('no-such-block', result.schedule, tasks));
  };

  const describe = (blocks: Block[]) => {
    if (!opt.trace) return;
    for (const b of blocks) {
      if (b.end <= now - DAY) continue;
      const kind = b.type === 'fixed' ? `fixed ${b.note ?? ''}` : `${b.type}${b.locked ? ' PINNED' : ''} ${b.taskId}`;
      log(`      ${clock(b.start, tz())} → ${clock(b.end, tz()).slice(6)}  ${String(minutes(b)).padStart(4)}m  ${b.id.padEnd(10)} ${kind}`);
    }
  };

  const timed = <T,>(f: () => T): [T | undefined, number] => {
    const t0 = performance.now();
    let r: T | undefined;
    try { r = f(); } finally { /* the caller's guard records the throw */ }
    return [r, performance.now() - t0];
  };

  const plan = (fn: 'generate' | 'replan', tasks: Task[], before: Block[]): SchedulerResult | undefined => {
    failedThisCall = false;
    call = fn;
    const tasksJson = JSON.stringify(tasks);
    const beforeJson = JSON.stringify(before);
    const invoke = () => (fn === 'generate' ? generateSchedule(tasks, before, cfg, now) : replan(before, tasks, cfg, now));
    let ms = 0;
    const result = guard(fn, () => { const [r, t] = timed(invoke); ms = t; return r; });
    if (JSON.stringify(tasks) !== tasksJson || JSON.stringify(before) !== beforeJson) add(`mutates-input:${fn}`, 'tasks or blocks changed in place');
    afterPlan(fn, tasks, before, result, ms);
    if (result && !opt.light) {
      // Same input twice, same answer.
      const again = guard(fn, invoke);
      if (again) {
        const d = diffSchedules(result.schedule, again.schedule);
        if (d.gone || d.added || JSON.stringify(result.feasibilityReport) !== JSON.stringify(again.feasibilityReport)) add(`determinism:${fn}-differs-on-same-input`, `${d.gone} gone, ${d.added} added`);
      }
      // A replan with nothing changed, at the same instant, changes nothing.
      const settled = guard('replan', () => replan(result.schedule, tasks, cfg, now));
      if (settled) {
        const d = diffSchedules(result.schedule, settled.schedule, stayKey);
        const label = fn === 'generate' ? 'no-change:replan-right-after-generate' : 'no-change:replan-not-idempotent';
        if (d.gone) add(`${label}, moves or drops blocks`, `${d.gone} gone, ${d.added} added`);
        else if (d.added) add(`${label}, adds blocks`, `${d.added} added`);
        else if (JSON.stringify(result.feasibilityReport) !== JSON.stringify(settled.feasibilityReport)) {
          add(`${label}, report changes`, `${JSON.stringify(result.feasibilityReport.issues)} → ${JSON.stringify(settled.feasibilityReport.issues)}`);
        }
      }
    }
    if (opt.trace) {
      log(`  [${step}] ${fn} at ${clock(now, tz())} (${tasks.length} tasks, ${before.length} blocks in) → ${result ? `${result.schedule.length} blocks, issues ${JSON.stringify(result.feasibilityReport.issues.map((i) => [i.taskId, i.shortfallMin]))}` : 'THREW'}`);
      if (result) describe(result.schedule);
    }
    if (opt.dump && failedThisCall) dumps.push({ step, fn, now, tasks, blocks: before, out: result?.schedule ?? null, issues: result?.feasibilityReport.issues ?? null });
    if (result) schedule = result.schedule;
    return result;
  };

  // routes/schedule.ts: regenerate()
  const routeGenerate = () => {
    const tasks = tasksNow();
    const calendar = calendarNow();
    const existing = [...calendar, ...c.rawFixed];
    const fillerBlocks = guard('placeDailyFillers', () =>
      placeDailyFillers({ fillers: c.fillers, now, horizonDays: cfg.horizonDays, workingHours: cfg.workingHours, existingFixed: existing, tzOffsetMin: cfg.tzOffsetMin })) ?? [];
    call = 'placeDailyFillers';
    checkFillers(fillerBlocks, existing);
    plan('generate', tasks, [...existing, ...fillerBlocks]);
  };

  // routes/schedule.ts: POST /replan (tops routines up) and POST /edit, /insert (don't)
  const routeReplan = (topUp: boolean) => {
    const tasks = tasksNow();
    const current = [...schedule.filter((b) => !isCalendarBlock(b)), ...calendarNow()];
    let routines: Block[] = [];
    if (topUp && c.fillers.length) {
      const dayOf = (t: number) => Math.floor((t - turnMs(cfg.workingHours) - tz() * MIN) / DAY);
      const have = new Set(current.filter((b) => b.note?.startsWith('Daily:')).map((b) => `${b.note}|${dayOf(b.start)}`));
      const existing = current.filter((b) => b.end > now);
      const placed = guard('placeDailyFillers', () =>
        placeDailyFillers({ fillers: c.fillers, now, horizonDays: cfg.horizonDays, workingHours: cfg.workingHours, existingFixed: existing, tzOffsetMin: tz(), idPrefix: `filler-${now}` })) ?? [];
      call = 'placeDailyFillers';
      checkFillers(placed, existing);
      routines = placed.filter((b) => !have.has(`${b.note}|${dayOf(b.start)}`));
    }
    plan('replan', tasks, [...current, ...routines]);
  };

  const pool = (p: Pool): Block[] =>
    p === 'any' ? schedule : schedule.filter((b) => b.type === 'work' && (p === 'w' || (b.end > now && !b.locked)));
  const pickBlock = (p: Pool, i: number): Block | undefined => { const xs = pool(p); return xs.length ? xs[i % xs.length] : undefined; };

  const resolve = (to: Target, moving: Block | undefined): number => {
    switch (to.at) {
      case 'nan': return NaN;
      case 'now': return now + to.offMin * MIN;
      case 'localHour': return localMidnight(now, tz()) + to.day * DAY + to.hour * HOUR;
      case 'fixed': { const xs = schedule.filter((b) => b.type === 'fixed' && b.end > now); return (xs.length ? xs[to.idx % xs.length]!.start : now + HOUR) + to.offMin * MIN; }
      case 'block': { const xs = schedule.filter((b) => b.type === 'work' && b.end > now && b !== moving); return (xs.length ? xs[to.idx % xs.length]!.start : now + HOUR) + to.offMin * MIN; }
      case 'deadline': {
        const t = moving?.taskId ? tasksNow().find((x) => x.id === moving.taskId) : undefined;
        return (t && Number.isFinite(t.deadline) ? t.deadline : now + DAY) + to.offMin * MIN;
      }
    }
  };

  const routeEdit = (edit: Edit) => {
    call = `applyEdit ${edit.kind}`;
    const snapshot = JSON.stringify(schedule);
    const input = schedule;
    const next = guard('applyEdit', () => applyEdit(input, edit));
    if (JSON.stringify(input) !== snapshot) add('applyEdit:mutates-its-input', edit.kind);
    log(`  [${step}] edit ${JSON.stringify(edit)}`);
    if (next) schedule = next;
    routeReplan(false);
  };

  const items = () => [...c.quests.filter((q) => q.status !== 'COMPLETE').map((q) => ({ q })), ...c.rawTasks.map((t) => ({ t }))] as Array<{ q?: QuestSpec; t?: Task }>;
  const item = (i: number) => { const xs = items(); return xs.length ? xs[i % xs.length] : undefined; };

  log(`  now ${clock(now, tz())} local (${new Date(now).toISOString()}), tz ${cfg.tzOffsetMin}, hours ${cfg.workingHours.startHour}–${cfg.workingHours.endHour}, horizon ${cfg.horizonDays} d`);
  routeGenerate();

  for (const op of c.ops) {
    step += 1;
    call = op.k;
    switch (op.k) {
      case 'advance': now += op.ms; log(`  [${step}] wait ${op.ms / MIN} min → ${clock(now, tz())}`); break;
      case 'advanceTo': {
        const xs = schedule.filter((b) => b.type === 'work' && b.end > now && Number.isFinite(b.start) && Number.isFinite(b.end)).sort((a, b) => a.start - b.start);
        if (xs.length) {
          const b = xs[op.idx % xs.length]!;
          const to = op.edge === 'start' ? b.start : op.edge === 'end' ? b.end : Math.floor((b.start + b.end) / 2);
          now = Math.max(now, to);
        }
        log(`  [${step}] wait until the ${op.edge} of a block → ${clock(now, tz())}`);
        break;
      }
      case 'replan': routeReplan(true); break;
      case 'generate': routeGenerate(); break;
      case 'move': { const b = pickBlock(op.pool, op.block); routeEdit({ kind: 'move_block', blockId: b?.id ?? 'no-such-block', newStart: resolve(op.to, b) }); break; }
      case 'swap': {
        const a = pickBlock(op.poolA, op.a);
        const b = pickBlock(op.poolB, op.b);
        // The Feed ignores a block dropped on itself.
        if (a && b && a.id === b.id) break;
        routeEdit({ kind: 'swap_blocks', aId: a?.id ?? 'no-such-block', bId: b?.id ?? 'no-such-block' });
        break;
      }
      case 'delete': routeEdit({ kind: 'delete_block', blockId: pickBlock(op.pool, op.block)?.id ?? 'no-such-block' }); break;
      case 'pin': routeEdit({ kind: 'pin_block', blockId: pickBlock(op.pool, op.block)?.id ?? 'no-such-block' }); break;
      case 'unpin': routeEdit({ kind: 'unpin_block', blockId: pickBlock(op.pool, op.block)?.id ?? 'no-such-block' }); break;
      case 'editUnknown':
        routeEdit(op.kind === 'move_block' ? { kind: 'move_block', blockId: 'no-such-block', newStart: now + HOUR }
          : op.kind === 'swap_blocks' ? { kind: 'swap_blocks', aId: 'no-such-block', bId: schedule[0]?.id ?? 'also-missing' }
          : { kind: op.kind, blockId: 'no-such-block' });
        break;
      case 'progress': {
        const it = item(op.item);
        if (it?.q) { it.q.actualMinutes = (it.q.actualMinutes ?? 0) + op.min; it.q.updatedAt = now; }
        if (it?.t) it.t.remainingMin -= op.min; // raw tasks may go below zero: that is the point
        log(`  [${step}] log ${op.min} min on ${it?.q?.id ?? it?.t?.id}`);
        break;
      }
      case 'complete': {
        const it = item(op.item);
        if (it?.q) it.q.status = 'COMPLETE';
        if (it?.t) it.t.status = 'done';
        log(`  [${step}] complete ${it?.q?.id ?? it?.t?.id}`);
        break;
      }
      case 'remove': {
        const it = item(op.item);
        if (it?.q) c.quests = c.quests.filter((q) => q !== it.q);
        if (it?.t) c.rawTasks = c.rawTasks.filter((t) => t !== it.t);
        log(`  [${step}] delete quest ${it?.q?.id ?? it?.t?.id}`);
        break;
      }
      case 'notToday': {
        const it = item(op.item);
        if (it?.q) { it.q.status = 'NOT_TODAY'; it.q.deferredAt = now; it.q.updatedAt = now; }
        if (it?.t) it.t.notBefore = workDayMidnight(now, tz(), cfg.workingHours) + turnMs(cfg.workingHours) + DAY;
        log(`  [${step}] not today: ${it?.q?.id ?? it?.t?.id}`);
        break;
      }
      case 'addQuest': c.quests.push(structuredClone(op.quest)); log(`  [${step}] add quest ${op.quest.id} (${op.quest.estimatedMinutes} min, due ${op.quest.deadline === null ? 'never' : clock(op.quest.deadline, tz())})`); break;
      case 'addRaw': c.rawTasks.push(structuredClone(op.task)); log(`  [${step}] add raw task ${op.task.id}`); break;
      case 'patchQuest': {
        const it = item(op.item);
        if (it?.q) Object.assign(it.q, op.patch, { updatedAt: now });
        log(`  [${step}] edit quest ${it?.q?.id}: ${JSON.stringify(op.patch)}`);
        break;
      }
      case 'settings': spec = { ...spec, ...op.patch }; cfg = buildConfig(spec); log(`  [${step}] settings ${JSON.stringify(op.patch)}`); break;
      case 'addEvent': c.events.push({ ...op.ev }); log(`  [${step}] calendar: new event ${clock(op.ev.start, tz())}–${clock(op.ev.end, tz()).slice(6)}`); break;
      case 'dropEvent': if (c.events.length) c.events.splice(op.idx % c.events.length, 1); log(`  [${step}] calendar: event removed`); break;
    }
  }
  return { violations, timings, trace, dumps };
}

// ─── Shrinker ─────────────────────────────────────────────────────────────────

/** Greedy delta-debugging: drop or simplify one thing at a time while `cls` still shows. */
function shrink(c0: Case, cls: string): Case {
  const shows = (c: Case) => {
    try { return runCase(c, { light: false }).violations.some((v) => v.cls === cls); } catch { return false; }
  };
  let c = structuredClone(c0);
  if (!shows(c)) throw new Error(`case ${c0.idx} does not show "${cls}"`);
  const attempt = (next: Case): boolean => { if (shows(next)) { c = next; return true; } return false; };

  // Nothing after the step that shows it matters.
  const at = runCase(c).violations.find((v) => v.cls === cls)!.step;
  attempt({ ...structuredClone(c), ops: c.ops.slice(0, at) });

  const lists = ['ops', 'quests', 'rawTasks', 'events', 'rawFixed', 'fillers', 'samples'] as const;
  for (let pass = 0; pass < 6; pass++) {
    const size = JSON.stringify(c).length;
    for (const key of lists) {
      // Halves first, then single items: 200 quests don't need 200 runs each.
      for (let chunk = Math.max(1, Math.floor(c[key].length / 2)); chunk >= 1; chunk = Math.floor(chunk / 2)) {
        for (let i = c[key].length - chunk; i >= 0; i -= chunk) {
          const next = structuredClone(c);
          (next[key] as unknown[]).splice(i, chunk);
          attempt(next);
        }
        if (chunk === 1) break;
      }
    }
    const def = DEFAULT_CFG();
    for (const k of Object.keys(c.cfg) as Array<keyof CfgSpec>) {
      const next = structuredClone(c);
      if (k in def) (next.cfg as unknown as Record<string, unknown>)[k] = (def as unknown as Record<string, unknown>)[k];
      else delete (next.cfg as unknown as Record<string, unknown>)[k];
      attempt(next);
    }
    for (const k of Object.keys(c.cfg.scoreWeights) as Array<keyof ScoreWeights>) { const next = structuredClone(c); delete next.cfg.scoreWeights[k]; attempt(next); }
    for (const k of Object.keys(c.cfg.breakPolicy) as Array<keyof BreakPolicy>) { const next = structuredClone(c); delete next.cfg.breakPolicy[k]; attempt(next); }
    // A round clock: on the hour, then on the minute.
    for (const unit of [HOUR, 5 * MIN, MIN]) { const next = structuredClone(c); next.now = Math.floor(c.now / unit) * unit; if (next.now !== c.now && attempt(next)) break; }

    const plain: Partial<QuestSpec> = { tediousness: null, category: null, preferredHour: null, minChunkMin: null, maxChunkMin: null, setupCost: null, urgencyMult: null, priorityTier: null, actualMinutes: null, mentalLoad: 5, impact: 5, status: 'ACTIVE' };
    const simplifyQuest = (get: (x: Case) => QuestSpec | undefined) => {
      for (const [k, v] of Object.entries(plain)) {
        const next = structuredClone(c);
        const q = get(next);
        if (!q || (q as unknown as Record<string, unknown>)[k] === v || (q as unknown as Record<string, unknown>)[k] === undefined) continue;
        (q as unknown as Record<string, unknown>)[k] = v;
        attempt(next);
      }
      for (const est of [30, 60, 120]) {
        const next = structuredClone(c);
        const q = get(next);
        if (!q || q.estimatedMinutes === est) continue;
        q.estimatedMinutes = est;
        if (attempt(next)) break;
      }
      for (const createdAt of [c.now - DAY]) {
        const next = structuredClone(c);
        const q = get(next);
        if (!q || q.createdAt === createdAt) continue;
        q.createdAt = createdAt; q.updatedAt = createdAt;
        attempt(next);
      }
      const cur = get(c);
      if (cur && cur.deadline !== null) {
        for (const d of [null, Math.ceil(cur.deadline / HOUR) * HOUR]) {
          const next = structuredClone(c);
          const q = get(next)!;
          if (q.deadline === d) continue;
          q.deadline = d;
          if (attempt(next)) break;
        }
      }
    };
    for (let i = 0; i < c.quests.length; i++) simplifyQuest((x) => x.quests[i]);
    for (let i = 0; i < c.ops.length; i++) simplifyQuest((x) => { const op = x.ops[i]; return op?.k === 'addQuest' ? op.quest : undefined; });
    if (JSON.stringify(c).length === size) break;
  }
  return c;
}

// ─── Printing ─────────────────────────────────────────────────────────────────

/** JSON that keeps NaN and ±Infinity readable (plain JSON turns them into null). */
const pretty = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? `<<${x}>>` : x), 1)
    .replace(/"<<(NaN|-?Infinity)>>"/g, '$1');

function showCase(c: Case, dump: boolean) {
  const run = runCase(c, { trace: true, dump });
  console.log(`\nCase ${c.idx} (tier ${tierOf(c)}): ${c.quests.length} quests, ${c.rawTasks.length} raw tasks, ${c.events.length} events, ${c.rawFixed.length} raw blocks, ${c.fillers.length} routines, ${c.ops.length} steps`);
  if (!argv.includes('--brief')) console.log(pretty(c));
  console.log('\nTrace:');
  for (const line of run.trace) console.log(line);
  console.log(`\nViolations (${run.violations.length}):`);
  for (const v of run.violations) console.log(`  step ${v.step} [${v.call}] ${v.cls}\n      ${v.detail}`);
  if (dump) for (const d of run.dumps) console.log(`\nCall at step ${d.step}: ${d.fn}(now=${d.now} ${new Date(d.now).toISOString()})\n${pretty({ tasks: d.tasks, blocksIn: d.blocks, out: d.out, issues: d.issues })}`);
}

// ─── Scaling ──────────────────────────────────────────────────────────────────

function scaling() {
  const now = Date.UTC(2026, 9, 5, 8, 0);
  const r = mulberry32(42);
  const makeTasks = (n: number, horizon: number): Task[] => {
    const quests: QuestLike[] = [];
    for (let i = 0; i < n; i++) {
      quests.push({
        id: `q${i}`, title: `Quest ${i}`, estimatedMinutes: pick(r, [15, 30, 45, 60, 90, 120]), mentalLoad: int(r, 1, 10), impact: int(r, 1, 10),
        deadline: chance(r, 0.2) ? null : new Date(now + int(r, 1, horizon) * DAY + 15 * HOUR),
        status: 'ACTIVE', tags: [], createdAt: new Date(now - DAY), updatedAt: new Date(now - DAY),
      });
    }
    return questsToTasks(quests, {}, now, 0, null);
  };
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const time = (f: () => unknown, reps: number) => { const xs: number[] = []; for (let i = 0; i < reps; i++) { const t0 = performance.now(); f(); xs.push(performance.now() - t0); } return median(xs); };

  // Warm the JIT so the first row isn't the compiler's time.
  for (let i = 0; i < 20; i++) generateSchedule(makeTasks(10, 7), [], defaultConfig(), now);

  console.log('\nRuntime vs task count (median ms; "×" is the growth for 2× the tasks, 2.0 = linear, 4.0 = quadratic)\n');
  console.log('  tasks  horizon   generate      ×    replan(no change)      ×    blocks');
  for (const horizon of [7, 30]) {
    let prevG = 0;
    let prevR = 0;
    for (const n of [1, 5, 12, 25, 50, 100, 200, 400]) {
      const cfg = { ...defaultConfig(), horizonDays: horizon, workingHours: { startHour: 8, endHour: 22 } };
      const tasks = makeTasks(n, horizon);
      const reps = n >= 100 ? 3 : 7;
      const g = time(() => generateSchedule(tasks, [], cfg, now), reps);
      const plan = generateSchedule(tasks, [], cfg, now);
      const rp = time(() => replan(plan.schedule, tasks, cfg, now), reps);
      const ratio = (cur: number, prev: number) => (prev > 0 ? (cur / prev).toFixed(1).padStart(5) : '    -');
      console.log(`  ${String(n).padStart(5)}  ${String(horizon).padStart(5)} d  ${g.toFixed(1).padStart(8)}  ${ratio(g, prevG)}  ${rp.toFixed(1).padStart(15)}    ${ratio(rp, prevR)}  ${String(plan.schedule.length).padStart(7)}${g > SLOW_MS || rp > SLOW_MS ? `   over ${SLOW_MS} ms` : ''}`);
      prevG = g; prevR = rp;
    }
  }

  console.log('\nRuntime vs fixed blocks (25 tasks, 7 days)\n');
  console.log('  fixed   generate      ×    replan      ×');
  let prevG = 0;
  let prevR = 0;
  const tasks = makeTasks(25, 7);
  for (const n of [0, 50, 100, 200, 400, 800]) {
    const fixed: Block[] = [];
    for (let i = 0; i < n; i++) {
      const s = now + i * ((7 * DAY) / Math.max(1, n));
      fixed.push({ id: `cal:${i}`, start: s, end: s + 10 * MIN, type: 'fixed', taskId: null, locked: true, note: 'Calendar: slot' });
    }
    const cfg = { ...defaultConfig(), workingHours: { startHour: 8, endHour: 22 } };
    const g = time(() => generateSchedule(tasks, fixed, cfg, now), 5);
    const plan = generateSchedule(tasks, fixed, cfg, now);
    const rp = time(() => replan(plan.schedule, tasks, cfg, now), 5);
    const ratio = (cur: number, prev: number) => (prev > 0 ? (cur / prev).toFixed(1).padStart(5) : '    -');
    console.log(`  ${String(n).padStart(5)}  ${g.toFixed(1).padStart(9)}  ${ratio(g, prevG)}  ${rp.toFixed(1).padStart(8)}  ${ratio(rp, prevR)}${g > SLOW_MS || rp > SLOW_MS ? `   over ${SLOW_MS} ms` : ''}`);
    prevG = g; prevR = rp;
  }
}

// ─── Probes: what happens today on inputs with no agreed answer ───────────────

function probes() {
  const now = Date.UTC(2026, 9, 5, 10, 0); // Mon 5 Oct 2026, 10:00 UTC
  const quest = (over: Partial<QuestLike>): QuestLike => ({
    id: 'q1', title: 'Essay', estimatedMinutes: 60, mentalLoad: 5, impact: 5, deadline: new Date(now + 2 * DAY),
    status: 'ACTIVE', tags: [], createdAt: new Date(now - DAY), updatedAt: new Date(now - DAY), ...over,
  });
  const run = (label: string, hours: { startHour: number; endHour: number }, at = now) => {
    const cfg = { ...defaultConfig(), workingHours: hours };
    const tasks = questsToTasks([quest({})], {}, at, 0, null);
    const r = generateSchedule(tasks, [], cfg, at);
    const work = r.schedule.filter((b) => b.type === 'work');
    console.log(`  ${label.padEnd(44)} ${work.length} block(s) ${work.map((b) => `${clock(b.start, 0)}–${clock(b.end, 0).slice(6)}`).join(', ') || '-'}; issues ${JSON.stringify(r.feasibilityReport.issues.map((i) => [i.taskId, i.shortfallMin]))}`);
  };
  console.log('\nDocumented behaviour (a 60-minute quest due in two days, opened Mon 10:00 UTC)\n');
  run('hours 9–18 (default)', { startHour: 9, endHour: 18 });
  run('hours 0–24', { startHour: 0, endHour: 24 });
  run('hours 23.5–24', { startHour: 23.5, endHour: 24 });
  run('hours 9–9.5, opened 10:00', { startHour: 9, endHour: 9.5 });
  run('hours 22–6 (past midnight)', { startHour: 22, endHour: 6 });
  run('hours 22–6, opened 01:00 (mid-session)', { startHour: 22, endHour: 6 }, now + 15 * HOUR);
  run('hours 18–9', { startHour: 18, endHour: 9 });
  run('hours 9–9 (refused by the settings route)', { startHour: 9, endHour: 9 });

  // Daylight saving: tzOffsetMin is one number for the whole plan.
  const ny = Date.UTC(2026, 9, 30, 14, 0); // Fri 30 Oct 2026 10:00 in New York (UTC-4); clocks go back Sun 1 Nov
  const cfg = { ...defaultConfig(), tzOffsetMin: 240 };
  const tasks = questsToTasks([quest({ estimatedMinutes: 240, deadline: new Date(ny + 6 * DAY), createdAt: new Date(ny - DAY), updatedAt: new Date(ny - DAY) })], {}, ny, 240, null);
  const r = generateSchedule(tasks, [], cfg, ny);
  const wall = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  console.log('\n  Daylight saving (New York, plan made Fri 30 Oct, clocks go back Sun 1 Nov), wall-clock starts:');
  console.log(`    ${r.schedule.filter((b) => b.type === 'work').map((b) => wall.format(b.start)).join(' | ')}`);
  console.log('    (working hours are 9–18; every block after the change is shown an hour early)');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (argv.includes('--scale')) { scaling(); return; }
  if (argv.includes('--probe')) { probes(); return; }
  if (SHRINK !== null) {
    if (!CLASS) throw new Error('--shrink needs --class "<violation class>"');
    const small = shrink(genCase(SHRINK), CLASS);
    console.log(`Shrunk case ${SHRINK} for "${CLASS}" (tier ${tierOf(genCase(SHRINK))} → ${tierOf(small)}):`);
    showCase(small, DUMP);
    return;
  }
  // --print: the case's data without running it (for a case that hangs or runs out of memory).
  if (SHOW !== null && argv.includes('--print')) { const c = genCase(SHOW); console.log(`tier ${tierOf(c)}\n${pretty(c)}`); return; }
  if (SHOW !== null) { showCase(genCase(SHOW), DUMP); return; }

  // Warm the JIT, so the first cases aren't "slow" for the compiler's sake.
  for (let i = 0; i < 30; i++) runCase(genCase(1_000_000 + i, 999, 'ui'), { light: true });

  interface Agg { cases: number; first: number; byTier: Record<Tier, { n: number; first: number | null }>; detail: string; step: number; seeds: number[] }
  const classes = new Map<string, Agg>();
  const tiers: Record<Tier, number> = { ui: 0, api: 0, wild: 0 };
  const allTimings: Timing[] = [];
  let calls = 0;
  const started = performance.now();

  for (let i = FROM; i < FROM + N; i++) {
    const c = genCase(i);
    const tier = tierOf(c);
    tiers[tier] += 1;
    // A hang or an out-of-memory can't be caught in-process: FUZZ_PROGRESS=all names the case.
    if (process.env['FUZZ_PROGRESS'] === 'all' || (process.env['FUZZ_PROGRESS'] && i % 100 === 0)) process.stderr.write(`case ${i}\n`);
    const run = runCase(c);
    calls += run.timings.length;
    for (const t of run.timings) allTimings.push(t);
    for (const v of run.violations) {
      let a = classes.get(v.cls);
      if (!a) {
        a = { cases: 0, first: i, byTier: { ui: { n: 0, first: null }, api: { n: 0, first: null }, wild: { n: 0, first: null } }, detail: v.detail, step: v.step, seeds: [] };
        classes.set(v.cls, a);
      }
      a.cases += 1;
      a.byTier[tier].n += 1;
      if (a.byTier[tier].first === null) a.byTier[tier].first = i;
      // A class can have more than one cause: keep a few seeds of the mildest tier to compare.
      if (tier === 'ui' && a.seeds.length < 8) a.seeds.push(i);
    }
  }

  const secs = (performance.now() - started) / 1000;
  console.log(`\nFuzz lab: ${N} cases, seed ${SEED} (${tiers.ui} ui, ${tiers.api} api, ${tiers.wild} wild), ${calls} planning calls checked, ${secs.toFixed(1)} s`);
  const ms = allTimings.map((t) => t.ms).sort((a, b) => a - b);
  const q = (p: number) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))]!.toFixed(1) : '-');
  const slowest = allTimings.reduce((m, t) => (t.ms > m.ms ? t : m), allTimings[0] ?? { ms: 0, fn: 'generate' as const, tasks: 0, blocks: 0, horizon: 0 });
  console.log(`Plan time: p50 ${q(0.5)} ms · p95 ${q(0.95)} ms · p99 ${q(0.99)} ms · max ${slowest.ms.toFixed(0)} ms (${slowest.fn}, ${slowest.tasks} tasks, ${slowest.blocks} blocks in, ${slowest.horizon} d)`);

  const reach = (a: Agg): Tier => (a.byTier.ui.n ? 'ui' : a.byTier.api.n ? 'api' : 'wild');
  const order: Record<Tier, number> = { ui: 0, api: 1, wild: 2 };
  const rows = [...classes].filter(([cls]) => !CLASS || cls.includes(CLASS)).sort((a, b) => order[reach(a[1])] - order[reach(b[1])] || b[1].cases - a[1].cases);
  console.log(`\n${rows.length} violation classes. "reach" is the mildest tier that shows it; seeds are case numbers for --show / --shrink.\n`);
  for (const [cls, a] of rows) {
    const t = a.byTier;
    const seed = (x: { n: number; first: number | null }) => (x.first === null ? '      -' : `${String(x.n).padStart(4)} @${String(x.first).padEnd(5)}`);
    console.log(`  [${reach(a).padEnd(4)}] ${cls}`);
    console.log(`           cases ${String(a.cases).padStart(4)} (${((100 * a.cases) / N).toFixed(1)}%) · ui ${seed(t.ui)} · api ${seed(t.api)} · wild ${seed(t.wild)}`);
    console.log(`           e.g. case ${a.first} step ${a.step}: ${a.detail.slice(0, 200)}`);
    if (argv.includes('--seeds') && a.seeds.length) console.log(`           ui seeds: ${a.seeds.join(', ')}`);
  }
  if (!rows.length) console.log('  none');
}

main();
