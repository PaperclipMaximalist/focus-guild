/**
 * Population lab: stress-test the scheduler on thousands of simulated people.
 *
 *   npm run lab:pop                        1000 people, static plan grading
 *   npm run lab:pop -- --n 3000 --seed 7   bigger / different population
 *   npm run lab:pop -- --week              also live each person's week
 *   npm run lab:pop -- --show 42           one person in detail (plan + week)
 *   npm run lab:pop -- --flag deadline-loss --examples 8
 *
 * The scenario lab (`npm run lab`) grades a handful of hand-written weeks.
 * This one generates people instead: students, office workers, parents,
 * freelancers, night owls, shift workers, overcommitters, minimalists and
 * procrastinators, in timezones from Honolulu to Kathmandu, with calendars,
 * routines, check-ins and a messy quest list. Every plan is graded against
 * an EDF oracle (how much deadline work *could* fit in the same free time),
 * and against the person's own energy curve, not the default one.
 *
 * With --week each person then lives seven days the way the app works
 * today: the Feed only generates when the plan is empty, every finished or
 * stopped focus session replans, people skip blocks, overrun estimates and
 * get surprise homework. The outcome that matters is deadlines met.
 *
 * Night-shift people (working hours that run past midnight: 22–06, 14–02)
 * are a population of their own, numbered n0, n1, … and simulated after
 * everyone else, so the ordinary people of a seed are exactly who they were
 * before the archetype existed:
 *
 *   (default)             --n ordinary people, plus 6% as many night-shift
 *   --no-night-shift      the ordinary people only (the pre-night-shift lab)
 *   --only-night-shift    --n night-shift people and nobody else
 *   --show n12            night-shift person 12 in detail
 *
 * Pure: the same pipeline as routes/schedule.ts, no DB, no network, seeded.
 */

import { generateSchedule, replan } from '../src/lib/scheduler/replan.js';
import { questsToTasks, type QuestLike } from '../src/lib/scheduler/adapter.js';
import * as schedulerConfig from '../src/lib/scheduler/config.js';
import { eventsToFixedBlocks, isCalendarBlock } from '../src/lib/calendar/ics.js';
import { placeDailyFillers, type DailyFiller } from '../src/lib/scheduler/dailyFiller.js';
import { calibrateEstimates, type Calibration } from '../src/lib/scheduler/insights.js';
import * as budget from '../src/lib/scheduler/budget.js';
import { priorityScore } from '../src/lib/scheduler/planner.js';
import type { Block, Task, UserConfig } from '../src/lib/scheduler/types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Optional imports, so the lab still runs against older scheduler builds
// (git stash the scheduler to get a before/after on the same population).
const { defaultConfig, DEFAULT_ENERGY_CURVE } = schedulerConfig;
const CHRONOTYPE_CURVES = (schedulerConfig as { CHRONOTYPE_CURVES?: Record<string, (h: number) => number> }).CHRONOTYPE_CURVES;
const { allocateBudgets, buildDayInfo, workableMin } = budget;
const triage = (budget as { triage?: (...a: unknown[]) => Set<string> }).triage ?? (() => new Set<string>());

/** The judge's own rule: the check-in caps today only (the plan's first day, if that is today). */
function todayCap(days: ReturnType<typeof buildDayInfo>, now: number, cfg: UserConfig): number | undefined {
  if (cfg.todayCapMin === undefined || !days.length) return undefined;
  return ownDayOf(days[0]!.workStart, cfg) === ownDayOf(now, cfg) ? cfg.todayCapMin : undefined;
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (name: string, def: string | null = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? '') : def;
};
const N = Number(arg('n', '1000'));
const SEED = Number(arg('seed', '1'));
const WEEK = argv.includes('--week') || arg('show') !== null;
/**
 * Night-shift people are numbered from here (shown as n0, n1, …). They get
 * their own index range, random streams and quest ids, and run after the
 * ordinary people: adding them to the weighted archetype draw would have
 * re-rolled who everyone else is, and no number could be compared across it.
 */
const NIGHT_BASE = 1_000_000;
/** Night-shift people per ordinary person in the default run. */
const NIGHT_SHARE = 0.06;
const NIGHT_MODE: 'add' | 'none' | 'only' = argv.includes('--no-night-shift') ? 'none' : argv.includes('--only-night-shift') ? 'only' : 'add';
const isNight = (idx: number) => idx >= NIGHT_BASE;
const label = (idx: number) => (isNight(idx) ? `n${idx - NIGHT_BASE}` : `${idx}`);
const showArg = arg('show');
const SHOW = showArg === null ? null : showArg.startsWith('n') ? NIGHT_BASE + Number(showArg.slice(1)) : Number(showArg);
const ONLY_FLAG = arg('flag');
const EXAMPLES = Number(arg('examples', '3'));
/** Route behaviours that are simulated, so fixes can be A/B'd from here. */
const POLICY = {
  /** Before Sep 2026, routes/schedule.ts clipped dailies to 60 min (--clip). */
  clipDailies: argv.includes('--clip'),
  /**
   * The Feed replans on the first open of a new day (since Sep 2026; before,
   * it only generated when the stored plan was empty: --no-morning-refresh).
   */
  morningRefresh: !argv.includes('--no-morning-refresh'),
  /** Estimates are exactly right: every miss left is the planner's alone. */
  exact: argv.includes('--exact'),
  /** A returning user: a dozen finished quests already teach the planner their pace. */
  history: argv.includes('--history'),
  /**
   * The replan route reads today's check-in on every call, so the cap is in
   * force for every replan of that day. (Before Oct 2026 the lab's replans
   * dropped it, and its people worked uncapped from the first minute:
   * --no-replan-cap.)
   */
  replanCap: !argv.includes('--no-replan-cap'),
  /**
   * People also edit: "Not Today" on the next quest, pin a block, lower an
   * estimate, shorten their hours. Off by default so the week's numbers stay
   * comparable; on, it exercises the replan invariants against edits.
   */
  edits: argv.includes('--edits'),
};

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

// ─── People ───────────────────────────────────────────────────────────────────

type OrdinaryArchetype =
  | 'ib-student' | 'uni-student' | 'office' | 'freelancer' | 'parent'
  | 'night-owl' | 'shift-worker' | 'overcommitter' | 'minimalist' | 'procrastinator' | 'newbie';
/** night-shift: working hours that run past midnight. Never drawn from the weights below (see NIGHT_BASE). */
type Archetype = OrdinaryArchetype | 'night-shift';

const ARCHETYPES: ReadonlyArray<readonly [OrdinaryArchetype, number]> = [
  ['ib-student', 18], ['uni-student', 12], ['office', 14], ['freelancer', 8], ['parent', 8],
  ['night-owl', 7], ['shift-worker', 5], ['overcommitter', 9], ['minimalist', 6], ['procrastinator', 8], ['newbie', 5],
];

/** getTimezoneOffset() values: Honolulu … Vancouver … London … Kolkata, Kathmandu … Auckland. */
const TZS = [600, 480, 420, 300, 240, 180, 0, -60, -120, -330, -345, -480, -540, -600, -780];

interface CalEvent { id: string; title: string; start: Date; end: Date }

interface Person {
  idx: number;
  archetype: Archetype;
  tz: number;
  cfg: UserConfig;
  /** How the person's energy really moves through the day (0..1). */
  trueEnergy: (h: number) => number;
  energyLabel: string;
  events: CalEvent[];
  quests: QuestLike[];
  dailies: DailyFiller[];
  /** Daily lengths before the route's clip, by filler id. */
  dailyAsked: Map<string, number>;
  now: number;
  // Life: how the person actually behaves.
  compliance: number;
  /** Real work needed ÷ estimate, per person (quests jitter around it). */
  overrun: number;
  surprisePerDay: number;
}

/** Monday 28 Sep 2026, 00:00 in the person's timezone, as UTC ms. */
const baseMidnight = (tz: number) => Date.UTC(2026, 8, 28) + tz * MIN;
const localHourOf = (t: number, tz: number) => {
  const d = new Date(t - tz * MIN);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};
const dayIndexOf = (t: number, tz: number) => Math.floor((t - baseMidnight(tz)) / DAY);

// The judge's own reading of hours that run past midnight (22–06, 14–02),
// written here rather than imported: the grader must not inherit the
// planner's idea of a day. For ordinary hours every one of these is the
// calendar day, so nothing below changes for them.
/** The window ends on the next date. */
const pastMidnight = (cfg: UserConfig) => cfg.workingHours.endHour < cfg.workingHours.startHour;
/** Hours in the working window. */
const windowLen = (cfg: UserConfig) => cfg.workingHours.endHour - cfg.workingHours.startHour + (pastMidnight(cfg) ? 24 : 0);
/**
 * When this person's day turns over, in ms after midnight. At 01:00 with
 * hours 22–06 they are mid-session and it is still "today" until 06:00:
 * the check-in, Not Today and routines all mean this night, not this date.
 */
const dayTurn = (cfg: UserConfig) => (pastMidnight(cfg) ? cfg.workingHours.endHour * HOUR : 0);
/** Index of the person's own day at `t` (the calendar day, for ordinary hours). */
const ownDayOf = (t: number, cfg: UserConfig) => dayIndexOf(t - dayTurn(cfg), cfg.tzOffsetMin ?? 0);

const fmt =(t: number, tz: number) => new Date(t - tz * MIN).toISOString().slice(11, 16);
const wd = (t: number, tz: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(t - tz * MIN).getUTCDay()]!;

function peakCurve(peak: number, width: number, floor = 0.15): (h: number) => number {
  return (h: number) => {
    // circular distance so an owl peaking at 23 is still awake at 01
    const d = Math.min(Math.abs(h - peak), 24 - Math.abs(h - peak));
    return floor + (1 - floor) * Math.exp(-(d * d) / (2 * width * width));
  };
}

let questSeq = 0;
/** `q` for ordinary people (one running count, as ever); `n<j>q` per night-shift person. */
let questPrefix = 'q';
function makeQuest(r: Rng, p: { tz: number; now: number }, over: Partial<QuestLike> & { title: string }): QuestLike {
  questSeq += 1;
  return {
    id: `${questPrefix}${questSeq}`,
    estimatedMinutes: 60,
    mentalLoad: 5,
    impact: 5,
    deadline: null,
    status: 'ACTIVE',
    tags: [],
    createdAt: new Date(p.now - int(r, 0, 20) * DAY),
    updatedAt: new Date(p.now - int(r, 0, 3) * DAY),
    ...over,
  };
}

/** A deadline `days` after today at a local wall-clock hour. */
function dueAt(p: { tz: number; now: number }, days: number, hour = 23 + 59 / 60) {
  const today = dayIndexOf(p.now, p.tz);
  return new Date(baseMidnight(p.tz) + (today + days) * DAY + hour * HOUR);
}

const SIZES = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600] as const;
const NAMES = {
  deep: ['Essay draft', 'Lab report', 'Problem set', 'Design doc', 'Client proposal', 'Study for exam', 'Code review backlog', 'Research reading', 'Presentation deck', 'Grant section', 'Chapter edit', 'Portfolio piece'],
  admin: ['Email landlord', 'Pay bill', 'Book dentist', 'Expense report', 'Reply to group chat', 'Renew passport form', 'Update CV', 'Order textbooks', 'Call insurance', 'File receipts'],
  light: ['Tidy notes', 'Water plants', 'Clear inbox', 'Back up laptop', 'Plan next week', 'Read article'],
};

type DeadlineMix = { none: number; today: number; soon: number; week: number; far: number; overdue: number; notToday: number };

function questList(r: Rng, p: { tz: number; now: number }, count: number, mix: DeadlineMix, bigBias = 0): QuestLike[] {
  const out: QuestLike[] = [];
  for (let i = 0; i < count; i++) {
    const kind = weighted(r, [['deep', 5 + bigBias * 5], ['admin', 3], ['light', 2]] as const);
    const size =
      kind === 'deep' ? pick(r, SIZES.slice(4 + (bigBias > 0.5 ? 2 : 0))) : kind === 'admin' ? pick(r, SIZES.slice(0, 4)) : pick(r, SIZES.slice(1, 6));
    const load = kind === 'deep' ? int(r, 6, 10) : kind === 'admin' ? int(r, 1, 4) : int(r, 1, 5);
    const when = weighted(r, [
      ['none', mix.none], ['today', mix.today], ['soon', mix.soon], ['week', mix.week], ['far', mix.far], ['overdue', mix.overdue],
    ] as const);
    const hourish = chance(r, 0.25) ? pick(r, [8, 9, 10, 12, 17]) : 23 + 59 / 60;
    const deadline =
      when === 'none' ? null
      : when === 'today' ? dueAt(p, 0, Math.max(localHourOf(p.now, p.tz) + 1, pick(r, [17, 20, 23 + 59 / 60])))
      : when === 'soon' ? dueAt(p, int(r, 1, 2), hourish)
      : when === 'week' ? dueAt(p, int(r, 3, 6), hourish)
      : when === 'far' ? dueAt(p, int(r, 7, 30))
      : dueAt(p, -int(r, 1, 4));
    const tier = weighted(r, [[null, 6], ['HIGH', 1.5], ['LOW', 1], ['MED', 1]] as const);
    const partial = size >= 60 && chance(r, 0.15) ? Math.round(size * (0.2 + r() * 0.5)) : null;
    out.push(
      makeQuest(r, p, {
        title: `${pick(r, NAMES[kind])} ${i + 1}`,
        estimatedMinutes: size,
        mentalLoad: load,
        impact: int(r, 2, 10),
        deadline,
        status: when === 'overdue' ? 'RESCUE' : chance(r, mix.notToday) ? 'NOT_TODAY' : 'ACTIVE',
        actualMinutes: partial,
        priorityTier: tier,
        ...(kind === 'admin' ? { category: 'admin', tediousness: 0.5 + r() * 0.4 } : {}),
        ...(kind === 'light' ? { category: 'light', tediousness: 0.3 + r() * 0.4 } : {}),
        ...(chance(r, 0.06) ? { preferredHour: int(r, 7, 21) } : {}),
      }),
    );
  }
  return out;
}

/** Busy time for 14 days from the person's Monday. */
function calendar(r: Rng, a: Archetype, tz: number): CalEvent[] {
  const ev: CalEvent[] = [];
  let n = 0;
  const add = (day: number, h0: number, h1: number, title: string) => {
    n += 1;
    ev.push({ id: `e${n}`, title, start: new Date(baseMidnight(tz) + day * DAY + h0 * HOUR), end: new Date(baseMidnight(tz) + day * DAY + h1 * HOUR) });
  };
  const weekdayOf = (d: number) => (d + 1) % 7; // day 0 is Monday → 1
  const shiftPattern = int(r, 0, 2);
  const clubDays = [int(r, 1, 5), int(r, 1, 5)];
  for (let d = 0; d < 14; d++) {
    const w = weekdayOf(d);
    const weekend = w === 0 || w === 6;
    switch (a) {
      case 'ib-student':
      case 'procrastinator':
        if (!weekend) add(d, 8 + 40 / 60, 15 + 10 / 60, 'School');
        if (!weekend && clubDays.includes(w)) add(d, 15.5, 17, 'Club / sport');
        if (w === 6 && chance(r, 0.5)) add(d, 10, 14, 'Part-time job');
        break;
      case 'uni-student':
        if (!weekend) for (let k = 0; k < int(r, 1, 3); k++) { const h = pick(r, [9, 10.5, 12, 13.5, 15, 16.5]); add(d, h, h + pick(r, [50, 80, 110]) / 60, 'Lecture'); }
        if (chance(r, 0.25)) add(d, 18, 21, 'Shift at café');
        break;
      case 'office':
      case 'overcommitter':
        if (!weekend) for (let k = 0; k < int(r, 1, 6); k++) { const h = int(r, 18, 33) / 2; add(d, h, h + pick(r, [0.5, 0.5, 1, 1.5]), 'Meeting'); }
        if (!weekend && a === 'office') add(d, 12, 13, 'Lunch');
        break;
      case 'freelancer':
        if (!weekend && chance(r, 0.6)) { const h = int(r, 18, 32) / 2; add(d, h, h + 1, 'Client call'); }
        break;
      case 'parent':
        if (!weekend) { add(d, 7.5, 8.75, 'School run'); add(d, 15, 16, 'Pick-up'); }
        add(d, 17.5, 19.5, 'Dinner + bedtime');
        break;
      case 'shift-worker': {
        if (d % 7 < 5 || chance(r, 0.2)) {
          const [s, e] = [[7, 15], [15, 23], [10, 18]][(shiftPattern + Math.floor(d / 3)) % 3]!;
          add(d, s, e, 'Shift');
        }
        break;
      }
      case 'night-owl':
        if (!weekend && chance(r, 0.5)) add(d, 13, 14, 'Standup');
        break;
      case 'night-shift':
        // A job in the day or the evening, before their own hours; and now
        // and then something inside the night, on either side of midnight.
        if (d % 7 < 5 || chance(r, 0.2)) {
          const [s, e] = ([[8, 16], [13, 21], [16, 21.5]] as const)[shiftPattern]!;
          add(d, s, e, 'Shift');
        }
        if (chance(r, 0.15)) add(d, 23.5, 24.75, 'Night class');
        if (chance(r, 0.1)) { const h = pick(r, [24.5, 26, 27.5]); add(d, h, h + 1, 'Call across timezones'); }
        break;
      default:
        if (chance(r, 0.15)) { const h = int(r, 9, 18); add(d, h, h + 1, 'Appointment'); }
    }
    if (chance(r, 0.08)) { const h = int(r, 9, 19); add(d, h, h + 0.5, 'Doctor'); }
  }
  return ev;
}

const DAILY_POOL: Array<{ name: string; min: [number, number]; pref: number | null }> = [
  { name: 'Morning meds', min: [5, 10], pref: null },
  { name: 'Workout', min: [45, 90], pref: null },
  { name: 'Duolingo', min: [10, 20], pref: null },
  { name: 'Practice piano', min: [30, 60], pref: null },
  { name: 'Evening walk', min: [20, 45], pref: null },
  { name: 'Read before bed', min: [20, 30], pref: 21 },
  { name: 'Journal', min: [10, 15], pref: null },
  { name: 'Revision flashcards', min: [20, 30], pref: null },
  { name: 'Guitar', min: [60, 120], pref: 19 },
];

function makePerson(idx: number): Person {
  const r = mulberry32(SEED * 100_003 + idx * 7919);
  // Night-shift people are picked by index, not by this draw (it still
  // happens, so an ordinary person's stream is what it always was).
  const night = isNight(idx);
  const drawn = weighted(r, ARCHETYPES);
  const archetype: Archetype = night ? 'night-shift' : drawn;
  const tz = pick(r, TZS);
  const cfg: UserConfig = { ...defaultConfig(), tzOffsetMin: tz };

  // Most people never open Settings; the rest set roughly their real window.
  // (Night-shift people all have: hours past midnight are what makes them one.)
  const tunedHours = chance(r, archetype === 'newbie' ? 0 : 0.6) || night;
  // A night shift, the small hours, or an afternoon that runs into the night.
  const nightHours = night
    ? weighted(r, [[[22, 6], 5], [[14, 2], 2.5], [[20, 4], 1.5], [[18, 1.5], 1], [[23, 7], 1]] as const)
    : ([22, 6] as const);
  const hoursFor: Record<Archetype, readonly [number, number]> = {
    'ib-student': [15.5, 21.5], 'uni-student': [10, 22], office: [9, 17.5], freelancer: [8, 19], parent: [8.5, 21],
    'night-owl': [13, 24], 'shift-worker': [8, 23], overcommitter: [7, 22], minimalist: [9, 18], procrastinator: [15.5, 23], newbie: [9, 18],
    'night-shift': nightHours,
  };
  if (tunedHours) {
    const [s, e] = hoursFor[archetype];
    const js = pick(r, [-1, -0.5, 0, 0, 0.5]);
    const je = pick(r, [-0.5, 0, 0, 0.5, 1]);
    cfg.workingHours = { startHour: Math.max(0, s + js), endHour: Math.min(24, e + je) };
  }

  // Most night-shift people are owls, but not all: some bodies never agree to the rota.
  const energy = weighted(r, [['default', 4], ['lark', 2], ['afternoon', 2], ['owl', archetype === 'night-owl' ? 20 : night ? 10 : 1.5]] as const);
  const trueEnergy =
    energy === 'default' ? DEFAULT_ENERGY_CURVE
    : energy === 'lark' ? peakCurve(8.5, 3)
    : energy === 'afternoon' ? peakCurve(15.5, 3)
    : peakCurve(22.5, 3.5);

  // Settings → "Sharpest time of day": most people who tune hours pick theirs.
  // (Before Sep 2026 everyone had the standard curve: --no-chronotype.)
  // (The draw happens either way, so both runs simulate the same people.)
  const picksChronotype = tunedHours && chance(r, 0.7);
  if (picksChronotype && CHRONOTYPE_CURVES && !argv.includes('--no-chronotype'))
    cfg.energyCurve = CHRONOTYPE_CURVES[energy === 'default' ? 'standard' : energy]!;

  // "Now" is when they open the Feed: a real, unrounded moment of a random day.
  const openDay = int(r, 0, 6);
  // Night-shift people open it mid-session after midnight far more often,
  // just after the session, and in the afternoon before the next one.
  const openHour = night
    ? weighted(r, [[0.6, 2], [2.4, 2], [4.5, 1.5], [6.3, 1], [12.4, 1], [16.8, 2], [20.6, 2], [22.1, 3], [23.0, 2]] as const)
    : weighted(r, [[7.2, 2], [8.6, 3], [12.4, 2], [15.8, 3], [19.3, 3], [22.7, 1.5], [0.8, 0.5]] as const);
  const now = baseMidnight(tz) + openDay * DAY + (openHour + r() * 0.9) * HOUR;
  const p = { tz, now };

  const mixes: Record<OrdinaryArchetype, [number, DeadlineMix, number]> = {
    'ib-student': [int(r, 5, 14), { none: 2, today: 1, soon: 3, week: 3, far: 2, overdue: 0.3, notToday: 0.04 }, 0.6],
    'uni-student': [int(r, 6, 15), { none: 3, today: 0.7, soon: 2, week: 3, far: 2, overdue: 0.3, notToday: 0.04 }, 0.5],
    office: [int(r, 4, 12), { none: 4, today: 1, soon: 2, week: 2, far: 1, overdue: 0.2, notToday: 0.03 }, 0.3],
    freelancer: [int(r, 5, 10), { none: 2, today: 0.5, soon: 2, week: 3, far: 2, overdue: 0.2, notToday: 0.03 }, 0.8],
    parent: [int(r, 4, 10), { none: 5, today: 1, soon: 2, week: 1, far: 1, overdue: 0.3, notToday: 0.05 }, 0.1],
    'night-owl': [int(r, 4, 12), { none: 3, today: 1, soon: 2, week: 2, far: 2, overdue: 0.3, notToday: 0.04 }, 0.5],
    'shift-worker': [int(r, 3, 9), { none: 4, today: 0.5, soon: 2, week: 2, far: 1, overdue: 0.2, notToday: 0.04 }, 0.3],
    overcommitter: [int(r, 15, 30), { none: 3, today: 1.5, soon: 4, week: 4, far: 2, overdue: 0.5, notToday: 0.04 }, 0.8],
    minimalist: [int(r, 1, 3), { none: 3, today: 1, soon: 2, week: 2, far: 1, overdue: 0, notToday: 0.02 }, 0.3],
    procrastinator: [int(r, 6, 14), { none: 2, today: 3, soon: 4, week: 1, far: 0.5, overdue: 1.5, notToday: 0.1 }, 0.5],
    newbie: [int(r, 2, 6), { none: 6, today: 0.3, soon: 1, week: 1, far: 0.5, overdue: 0, notToday: 0 }, 0.2],
  };
  // (Not a row of the table above: every row draws, and one more draw would
  // re-roll every ordinary person's quests.)
  const nightMix: [number, DeadlineMix, number] | null = night
    ? [int(r, 4, 12), { none: 3, today: 1, soon: 2.5, week: 2.5, far: 2, overdue: 0.3, notToday: 0.08 }, 0.4]
    : null;
  const [count, mix, big] = nightMix ?? mixes[archetype as OrdinaryArchetype];
  const quests = questList(r, p, count, mix, big);

  // Dailies: recurring quests, clipped by the route the way it does today.
  const dailyAsked = new Map<string, number>();
  const dailies: DailyFiller[] = [];
  const nDailies = weighted(r, [[0, 4], [1, 3], [2, 3], [3, 2], [5, 1]] as const);
  const pool = [...DAILY_POOL].sort(() => r() - 0.5).slice(0, nDailies);
  for (const d of pool) {
    const asked = int(r, d.min[0], d.min[1]);
    const id = `recurring:${d.name}`;
    dailyAsked.set(id, asked);
    dailies.push({
      id,
      name: d.name,
      durationMin: POLICY.clipDailies ? Math.min(60, Math.max(5, asked)) : asked,
      preferredHour: d.pref ?? (chance(r, 0.3) ? int(r, 7, 21) : null),
      enabled: true,
    });
  }
  // A routine at an hour after midnight, inside the night's window.
  if (night && chance(r, 0.4)) {
    const id = 'recurring:Shift meal';
    dailyAsked.set(id, 30);
    dailies.push({ id, name: 'Shift meal', durationMin: 30, preferredHour: pick(r, [0, 1, 2, 3]), enabled: true });
  }

  // A third check in: energy scales their curve, available minutes caps today.
  if (chance(r, 0.35)) {
    const level = int(r, 1, 5);
    const scale = 0.65 + 0.09 * level;
    const base = cfg.energyCurve;
    cfg.energyCurve = (h: number) => Math.min(1, Math.max(0, base(h) * scale));
    if (chance(r, 0.7)) cfg.todayCapMin = pick(r, [30, 60, 90, 120, 180, 240, 360]);
  }

  return {
    idx, archetype, tz, cfg, trueEnergy, energyLabel: energy,
    events: calendar(r, archetype, tz),
    quests, dailies, dailyAsked, now,
    compliance: archetype === 'procrastinator' ? 0.4 + r() * 0.3 : archetype === 'overcommitter' ? 0.55 + r() * 0.3 : 0.6 + r() * 0.35,
    overrun: weighted(r, [[0.8, 1], [1, 3], [1.25, 3], [1.6, 2], [2, 1]] as const),
    surprisePerDay: archetype === 'minimalist' || archetype === 'newbie' ? 0.1 : 0.35,
  };
}

// ─── The pipeline (same as routes/schedule.ts) ───────────────────────────────

interface Built {
  tasks: Task[];
  fixed: Block[];
  schedule: Block[];
  issues: Array<{ taskId: string; shortfallMin: number }>;
  ms: number;
}

function fillersFor(p: Person, now: number, cal: Block[], quests: QuestLike[], doneToday: Set<string>) {
  void quests;
  return placeDailyFillers({
    fillers: p.dailies.filter((d) => !doneToday.has(d.id)),
    now,
    horizonDays: p.cfg.horizonDays,
    workingHours: p.cfg.workingHours,
    existingFixed: cal,
    tzOffsetMin: p.tz,
  });
}

type Sample = { category: string | null; estimatedMinutes: number; actualMinutes: number };

/** Finished quests from before the simulated week, at the person's real pace. */
function history(p: Person): Sample[] {
  if (!POLICY.history || POLICY.exact) return [];
  const r = mulberry32(SEED * 7 + p.idx * 17);
  return Array.from({ length: 12 }, () => {
    const est = pick(r, [15, 30, 45, 60, 90, 120]);
    return { category: pick(r, ['deep_work', 'deep_work', 'admin', 'light']), estimatedMinutes: est, actualMinutes: Math.round(est * p.overrun * (0.8 + r() * 0.5)) };
  });
}

function build(p: Person, quests: QuestLike[], now: number, cfg: UserConfig = p.cfg, calibration: Calibration | null = calibrateEstimates(history(p))): Built {
  const cal = eventsToFixedBlocks(p.events, now).filter((b) => b.start < now + (cfg.horizonDays + 1) * DAY);
  const fixed = [...cal, ...fillersFor(p, now, cal, quests, new Set())];
  const tasks = questsToTasks(quests, {}, now, p.tz, calibration, cfg.workingHours);
  const t0 = performance.now();
  const { schedule, feasibilityReport } = generateSchedule(tasks, fixed, cfg, now);
  return { tasks, fixed, schedule, issues: feasibilityReport.issues, ms: performance.now() - t0 };
}

// ─── Grading one plan ─────────────────────────────────────────────────────────

interface Finding { flag: string; detail: string; weight?: number }

const isWork = (b: Block) => b.type === 'work' && !!b.taskId;
const mins = (b: { start: number; end: number }) => Math.round((b.end - b.start) / MIN);

/**
 * Most deadline work that could possibly fit: earliest-deadline-first into
 * the same free time the planner sees (after fixed blocks, dailies, the
 * transition after long blocks, the break policy and today's check-in cap).
 * EDF with preemption is optimal for "meet every deadline" on one person.
 */
function oracle(tasks: Task[], cfg: UserConfig, now: number, fixed: Block[]) {
  const days = buildDayInfo(cfg, now, fixed);
  const horizonEnd = days.length ? days[days.length - 1]!.workEnd : now;
  const slots: Array<{ start: number; end: number; cap: number; day: number }> = [];
  days.forEach((d, i) => {
    for (const iv of d.freeIntervals) slots.push({ start: iv.start, end: iv.end, cap: workableMin((iv.end - iv.start) / MIN, cfg.breakPolicy), day: i });
  });
  const cap = todayCap(days, now, cfg);
  if (cap !== undefined) {
    let left = cap;
    for (const s of slots.filter((x) => x.day === 0)) { const c = Math.min(s.cap, left); left -= c; s.cap = c; }
  }
  const capacity = slots.reduce((a, s) => a + s.cap, 0);
  const due = tasks
    .filter((t) => t.status !== 'done' && t.remainingMin > 0.5 && t.deadline > now && t.deadline <= horizonEnd)
    .sort((a, b) => a.deadline - b.deadline);
  let fits = 0;
  let need = 0;
  const shortBy = new Map<string, number>();
  for (const t of due) {
    let left = t.remainingMin;
    need += left;
    for (const s of slots) {
      if (left <= 0) break;
      if (s.cap <= 0 || s.start >= t.deadline || s.end <= (t.notBefore ?? 0)) continue;
      // Only the part of the slot before the deadline (and after notBefore).
      const usable = Math.min(s.cap, workableMin((Math.min(s.end, t.deadline) - Math.max(s.start, t.notBefore ?? 0)) / MIN, cfg.breakPolicy));
      const take = Math.max(0, Math.min(left, usable));
      s.cap -= take;
      left -= take;
      fits += take;
    }
    if (left > 0.5) shortBy.set(t.id, left);
  }
  return { capacity, need, fits, shortBy, days };
}

/** Most quests that can all be on time in this free time (Moore–Hodgson). */
function mostOnTime(due: Task[], days: ReturnType<typeof buildDayInfo>, cfg: UserConfig, now = 0): number {
  const cap = todayCap(days, now, cfg);
  const capBefore = (deadline: number) =>
    days.reduce((m, d, i) => {
      let c = 0;
      for (const iv of d.freeIntervals) {
        const e = Math.min(iv.end, deadline);
        if (e > iv.start) c += workableMin((e - iv.start) / MIN, cfg.breakPolicy);
      }
      return m + (i === 0 && cap !== undefined ? Math.min(c, cap) : c);
    }, 0);
  const kept: Task[] = [];
  let sum = 0;
  for (const t of [...due].sort((a, b) => a.deadline - b.deadline)) {
    kept.push(t);
    sum += t.remainingMin;
    while (sum > capBefore(t.deadline) + 0.5) {
      kept.sort((a, b) => b.remainingMin - a.remainingMin);
      sum -= kept.shift()!.remainingMin;
    }
  }
  return kept.length;
}

function gradePlan(p: Person, b: Built): Finding[] {
  const f: Finding[] = [];
  const { tasks, schedule, fixed, issues } = b;
  const cfg = p.cfg;
  const now = p.now;
  const tz = p.tz;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const work = schedule.filter(isWork).sort((x, y) => x.start - y.start);
  const at = (t: number) => `${wd(t, tz)} ${fmt(t, tz)}`;

  if (b.ms > 250) f.push({ flag: 'slow', detail: `${b.ms.toFixed(0)} ms for ${tasks.length} quests` });

  // ── Hard invariants ──
  // Not Today on the judge's own clock: nothing until the person's day is
  // over. For hours that run past midnight that is the end of the session,
  // so the planner's own `notBefore` is not taken on trust there (a quest
  // waved off at 23:00 and planned again at 00:10 is the bug to catch).
  const heldUntil = baseMidnight(tz) + (ownDayOf(now, cfg) + 1) * DAY + dayTurn(cfg);
  for (const w of work) {
    const t = byId.get(w.taskId!)!;
    if (w.end > t.deadline + 1000) f.push({ flag: 'INV past-deadline', detail: `"${t.name}" at ${at(w.start)} after its deadline` });
    if (w.start < now - 1000) f.push({ flag: 'INV before-now', detail: `"${t.name}" at ${at(w.start)}` });
    if (t.notBefore && w.start < Math.max(t.notBefore, pastMidnight(cfg) ? heldUntil : 0)) f.push({ flag: 'INV not-today-ignored', detail: `"${t.name}" today at ${at(w.start)}` });
    const fx = fixed.find((x) => x.start < w.end && w.start < x.end);
    if (fx) f.push({ flag: 'INV overlaps-fixed', detail: `"${t.name}" ${at(w.start)} on "${fx.note}"` });
    const h0 = localHourOf(w.start, tz);
    const h1 = localHourOf(w.end, tz) || 24;
    // A window that ends tomorrow is measured from its start: 23:30–00:20
    // is inside 22–06, 21:40 and 06:10 are not. (The clock comparison in
    // the other branch calls every block of a night shift outside its hours.)
    const outside = pastMidnight(cfg)
      ? ((h0 - cfg.workingHours.startHour + 24.01) % 24) - 0.01 + (w.end - w.start) / HOUR > windowLen(cfg) + 0.01
      : h0 < cfg.workingHours.startHour - 0.01 || h1 > cfg.workingHours.endHour + 0.01;
    if (outside)
      f.push({ flag: 'INV outside-hours', detail: `"${t.name}" ${at(w.start)}–${fmt(w.end, tz)}` });
  }
  for (let i = 1; i < work.length; i++)
    if (work[i]!.start < work[i - 1]!.end) f.push({ flag: 'INV work-overlap', detail: `${at(work[i]!.start)}` });

  // ── Deadlines vs what could fit ──
  const o = oracle(tasks, cfg, now, fixed);
  const beforeDeadline = (t: Task) =>
    work.filter((w) => w.taskId === t.id && w.end <= t.deadline).reduce((a, w) => a + mins(w), 0);
  const horizonEnd = o.days.length ? o.days[o.days.length - 1]!.workEnd : now;
  const dueIn = tasks.filter((t) => t.status !== 'done' && t.remainingMin > 0.5 && t.deadline > now && t.deadline <= horizonEnd);
  const got = dueIn.reduce((a, t) => a + Math.min(t.remainingMin, beforeDeadline(t)), 0);
  const loss = Math.round(o.fits - got);
  if (loss >= 15) {
    const worst = dueIn
      .map((t) => ({ t, short: t.remainingMin - beforeDeadline(t) - (o.shortBy.get(t.id) ?? 0) }))
      .sort((x, y) => y.short - x.short)[0]!;
    f.push({ flag: 'deadline-loss', detail: `${loss} min of deadline work fit but wasn't planned (worst: "${worst.t.name}" ${worst.t.remainingMin}m due ${at(worst.t.deadline)}, planned ${beforeDeadline(worst.t)})`, weight: loss });
  }
  if (issues.length && o.shortBy.size === 0)
    f.push({ flag: 'false-infeasible', detail: `flagged ${issues.length} quest(s) short but everything fits (oracle ${Math.round(o.fits)}/${Math.round(o.need)})` });
  for (const t of dueIn) {
    const placed = beforeDeadline(t);
    if (placed < t.remainingMin - 1 && !issues.find((i) => i.taskId === t.id))
      f.push({ flag: 'silent-slip', detail: `"${t.name}" ${placed}/${t.remainingMin} min, not flagged` });
  }
  // Something that can't fit anyway: shortfalls should be reported.
  if (o.shortBy.size && !issues.length) f.push({ flag: 'unflagged-overload', detail: `${o.shortBy.size} quest(s) can't fit, nothing flagged` });

  // On time: how many quests due in the plan are fully planned before their
  // deadline, against the most that could be (Moore–Hodgson on the oracle's
  // capacity, an independent implementation from the planner's triage).
  const done = dueIn.filter((t) => beforeDeadline(t) >= t.remainingMin - 1).length;
  const best = mostOnTime(dueIn, o.days, cfg, now);
  if (done < best) f.push({ flag: 'fewer-on-time', detail: `${done}/${dueIn.length} quests fully planned before their deadline; ${best} could be`, weight: best - done });

  // Idle while short: a real sitting's worth of free time before a short
  // quest's deadline that nothing uses (beyond a 10-min break either side).
  for (const is of issues) {
    const t = byId.get(is.taskId);
    if (!t) continue;
    const from = Math.max(now, t.notBefore ?? 0);
    let idle = 0;
    let where = '';
    // Today's time beyond the check-in's "minutes available" isn't idle.
    const todayUsed = work.filter((w) => ownDayOf(w.start, cfg) === ownDayOf(now, cfg)).reduce((a, w) => a + mins(w), 0);
    const capToday = todayCap(o.days, now, cfg);
    const todayFull = capToday !== undefined && todayUsed >= capToday - 5;
    for (const d of o.days) for (const iv of d.freeIntervals) {
      if (todayFull && ownDayOf(d.workStart, cfg) === ownDayOf(now, cfg)) continue;
      const s0 = Math.max(iv.start, from);
      const e0 = Math.min(iv.end, t.deadline);
      if (e0 <= s0) continue;
      let cursor = s0;
      const inside = work.filter((w) => w.end > s0 && w.start < e0);
      for (const w of [...inside, { start: e0, end: e0 }]) {
        const gap = (Math.min(w.start, e0) - cursor) / MIN - (cursor > s0 ? 10 : 0) - (w.start < e0 ? 10 : 0);
        if (gap >= 30) { idle += gap; where ||= at(cursor); }
        cursor = Math.max(cursor, w.end);
      }
    }
    if (idle >= 30) { f.push({ flag: 'idle-while-short', detail: `"${t.name}" short ${is.shortfallMin}m (due ${at(t.deadline)}) with ${Math.round(idle)} min unused before it (from ${where})`, weight: idle }); break; }
  }

  // ── Today ──
  // "Today" is the person's own day: at 01:00 mid-session it is the night
  // that began on yesterday's date, and its work runs on past midnight.
  const today = o.days[0] && o.days[0].key === (o.days[0]?.key ?? '') && ownDayOf(o.days[0].workStart, cfg) === ownDayOf(now, cfg) ? o.days[0] : null;
  const todayWork = work.filter((w) => ownDayOf(w.start, cfg) === ownDayOf(now, cfg));
  // (Past midnight, a Not Today quest is held however few hours of the day are left.)
  const heldToday = (t: Task) => (pastMidnight(cfg) ? t.notBefore !== undefined : !!(t.notBefore && t.notBefore > now + 12 * HOUR));
  const eligibleToday = tasks.filter((t) => t.remainingMin > 0.5 && t.deadline > now && !heldToday(t));
  const todayFree = today ? today.freeIntervals.reduce((a, iv) => a + (iv.end - iv.start) / MIN, 0) : 0;
  const checkInCap = cfg.todayCapMin ?? Infinity;
  if (today && todayFree >= 60 && checkInCap >= 30 && eligibleToday.reduce((a, t) => a + t.remainingMin, 0) >= 30 && todayWork.length === 0)
    f.push({ flag: 'empty-today', detail: `${Math.round(todayFree)} min free today, ${eligibleToday.length} quests waiting, nothing planned today` });
  if (today && todayWork.length) {
    const firstFree = today.freeIntervals[0]!;
    const first = todayWork[0]!;
    const idle = (first.start - firstFree.start) / MIN;
    if (first.start <= firstFree.end && idle >= 90)
      f.push({ flag: 'idle-start', detail: `free from ${fmt(firstFree.start, tz)}, first quest at ${fmt(first.start, tz)} (${Math.round(idle)} min idle)` });
  }
  if (cfg.todayCapMin !== undefined) {
    const t = todayWork.reduce((a, w) => a + mins(w), 0);
    if (t > cfg.todayCapMin + 5) f.push({ flag: 'INV over-checkin-cap', detail: `${t} min today vs check-in ${cfg.todayCapMin}` });
  }

  // ── Horizon coverage ──
  const planDays = o.days.length;
  const wantDays = cfg.horizonDays;
  // (This used to excuse hours with the end before the start, which planned
  // nothing at all. They are a night shift now and owe a full horizon too.)
  if (planDays < wantDays - 1)
    f.push({ flag: 'short-horizon', detail: `${planDays}/${wantDays} days planned` });

  // ── Day shape ──
  // One night's work is one day, though it lies on two dates.
  const byDay = new Map<number, Block[]>();
  for (const w of work) {
    const k = ownDayOf(w.start, cfg);
    byDay.set(k, [...(byDay.get(k) ?? []), w]);
  }
  const loadRatio = o.need / Math.max(1, o.capacity);
  for (const [k, ws] of byDay) {
    const total = ws.reduce((a, w) => a + mins(w), 0);
    const info = o.days.find((d) => ownDayOf(d.workStart, cfg) === k);
    const cap = info ? info.freeIntervals.reduce((a, iv) => a + workableMin((iv.end - iv.start) / MIN, cfg.breakPolicy), 0) : 0;
    // Only work that could have gone elsewhere counts: due two or more days later.
    const movable = ws.filter((w) => byId.get(w.taskId!)!.deadline - w.end > 2 * DAY).reduce((a, w) => a + mins(w), 0);
    if (total > 480) f.push({ flag: 'overload-day', detail: `${wd(ws[0]!.start, tz)}: ${total} min of quests` });
    else if (loadRatio < 0.6 && cap > 0 && movable / cap > 0.6 && total > 240)
      f.push({ flag: 'crowded-day', detail: `${wd(ws[0]!.start, tz)} ${total}/${Math.round(cap)} min used (${movable} movable) on a light week (${Math.round(loadRatio * 100)}% load)` });
    const switches = ws.slice(1).filter((w, i) => w.taskId !== ws[i]!.taskId).length;
    if (switches >= 8) f.push({ flag: 'thrash', detail: `${wd(ws[0]!.start, tz)}: ${switches} quest switches` });
    // Interleaved: the same quest picked up again after another one (A B A B A).
    const runs = new Map<string, number>();
    ws.forEach((w, i) => { if (i === 0 || ws[i - 1]!.taskId !== w.taskId) runs.set(w.taskId!, (runs.get(w.taskId!) ?? 0) + 1); });
    const [tid, c] = [...runs].sort((x, y) => y[1] - x[1])[0]!;
    if (c >= 3) f.push({ flag: 'interleaved', detail: `"${byId.get(tid)!.name}" picked up ${c} separate times on ${wd(ws[0]!.start, tz)}` });
  }
  const tiny = work.filter((w) => mins(w) < 20 && byId.get(w.taskId!)!.totalMin >= 30);
  if (tiny.length) f.push({ flag: 'tiny-block', detail: `${tiny.length} block(s) under 20 min, e.g. "${byId.get(tiny[0]!.taskId!)!.name}" ${mins(tiny[0]!)}m at ${at(tiny[0]!.start)}` });
  const huge = work.filter((w) => mins(w) > 150);
  if (huge.length) f.push({ flag: 'huge-block', detail: `${huge.length} block(s) over 150 min (longest ${Math.max(...huge.map(mins))})` });

  let streak = 0;
  let worst = 0;
  for (let i = 0; i < work.length; i++) {
    const gap = i === 0 ? Infinity : work[i]!.start - work[i - 1]!.end;
    streak = gap < 5 * MIN ? streak + mins(work[i]!) : mins(work[i]!);
    worst = Math.max(worst, streak);
  }
  if (worst > 110) f.push({ flag: 'no-break', detail: `${worst} min without a 5-min break` });

  // ── Energy, graded against the person's real curve ──
  const eTrue = (w: Block) => p.trueEnergy(localHourOf(w.start + (w.end - w.start) / 2, tz));
  const hardLow = work.filter((w) => byId.get(w.taskId!)!.cognitiveLoad >= 0.7 && eTrue(w) < 0.35);
  const hardMin = work.filter((w) => byId.get(w.taskId!)!.cognitiveLoad >= 0.7).reduce((a, w) => a + mins(w), 0);
  const hardLowMin = hardLow.reduce((a, w) => a + mins(w), 0);
  if (hardMin >= 60 && hardLowMin / hardMin > 0.4)
    f.push({ flag: `energy-misfit (${p.energyLabel})`, detail: `${Math.round((hardLowMin / hardMin) * 100)}% of heavy work at the person's low-energy hours` });
  // Past midnight is later still than 21:30 (the clock test alone passes
  // 01:00); and hours that only begin at 21:30 or after have nowhere
  // earlier to put heavy work, so there is nothing to hold against the plan.
  const isLate = (h: number) =>
    pastMidnight(cfg) ? cfg.workingHours.startHour < 21.5 && (h >= 21.5 || h < cfg.workingHours.endHour) : h >= 21.5;
  const hardLate = work.filter((w) => byId.get(w.taskId!)!.cognitiveLoad >= 0.7 && isLate(localHourOf(w.start, tz)) && p.energyLabel !== 'owl');
  if (hardLate.length) f.push({ flag: 'heavy-late', detail: `${hardLate.length} heavy block(s) from 21:30 for a non-owl` });

  // ── Routines ──
  for (const d of p.dailies) {
    const asked = p.dailyAsked.get(d.id)!;
    if (asked > d.durationMin) f.push({ flag: 'daily-clipped', detail: `"${d.name}" ${asked} min → ${d.durationMin}` });
  }
  const dailyBlocks = fixed.filter((x) => x.note?.startsWith('Daily:'));
  // Days with real free time (calendar only) where a routine didn't land.
  // Today is exempt for routines with a time: once it's long gone, skipping is right.
  const calendarOnly = fixed.filter((x) => !x.note?.startsWith('Daily:'));
  for (const info of o.days.length ? buildDayInfo(cfg, now, calendarOnly) : []) {
    const k = ownDayOf(info.workStart, cfg);
    for (const d of p.dailies) {
      if (k === ownDayOf(now, cfg) && (d.preferredHour !== null || /morning|evening|night|bed|lunch|afternoon/i.test(d.name))) continue;
      const on = dailyBlocks.some((x) => x.note === `Daily: ${d.name}` && ownDayOf(x.start, cfg) === k);
      const room = info.freeIntervals.reduce((a, iv) => Math.max(a, (iv.end - iv.start) / MIN), 0);
      if (!on && room >= d.durationMin + 60) { f.push({ flag: 'daily-dropped', detail: `"${d.name}"${d.preferredHour !== null ? ` @${d.preferredHour}` : ''} ${d.durationMin}m missing on ${wd(info.workStart, tz)} (hours ${cfg.workingHours.startHour}–${cfg.workingHours.endHour}, opened ${at(now)})` }); break; }
    }
  }
  const late = dailyBlocks.filter((x) => /meds/i.test(x.note!) && localHourOf(x.start, tz) >= 12 && p.dailies.find((d) => x.note === `Daily: ${d.name}`)?.preferredHour == null);
  if (late.length) f.push({ flag: 'meds-afternoon', detail: `Morning meds at ${fmt(late[0]!.start, tz)}` });

  // ── Why-now ──
  // HIGH-tier quest with nothing in the plan while others got time.
  for (const t of tasks) {
    if (t.urgencyMultiplier < 1.39 || t.remainingMin < 1 || t.deadline <= now || (t.notBefore ?? 0) > now + 2 * DAY || o.shortBy.has(t.id)) continue;
    const mine = work.filter((w) => w.taskId === t.id).length;
    if (mine === 0 && work.length >= 3) { f.push({ flag: 'high-tier-unplanned', detail: `HIGH "${t.name}" ${t.remainingMin}m due ${at(t.deadline)} got nothing` }); break; }
  }
  return f;
}

// ─── Living the week ──────────────────────────────────────────────────────────

interface Life {
  findings: Finding[];
  due: number;
  met: number;
  /** Of the quests known at the start and due this week: met, and the most that could be. */
  initialMet: number;
  initialBest: number;
  missedFixable: number;
  workedMin: number;
  plannedMin: number;
  replans: number;
  /** Per replan trigger: blocks that were still valid going in, and how many of them moved. */
  churn: Map<Trigger, { valid: number; moved: number; replans: number }>;
  log: string[];
}

/** Why the plan was rebuilt: the Feed opened, a focus session ended, a quest was added, the person edited. */
type Trigger = 'open' | 'session' | 'new quest' | 'edit';

const blockKey = (b: Block) => `${b.taskId}@${b.start}-${b.end}`;

function liveWeek(p: Person, verbose = false, compliance = p.compliance): Life {
  const r = mulberry32(SEED * 31 + p.idx * 131);
  const tz = p.tz;
  const quests: QuestLike[] = p.quests.map((q) => ({ ...q }));
  // What each quest really takes this person (unknown to the planner).
  const trueLeft = new Map(quests.map((q) => [q.id, Math.max(5, Math.round((q.estimatedMinutes * (POLICY.exact ? 1 : p.overrun * (0.8 + r() * 0.5))) - (q.actualMinutes ?? 0)))]));
  const life: Life = { findings: [], due: 0, met: 0, initialMet: 0, initialBest: 0, missedFixable: 0, workedMin: 0, plannedMin: 0, replans: 0, churn: new Map(), log: [] };
  const log = (s: string) => { if (verbose) life.log.push(s); };
  const cfgNoCap = { ...p.cfg, todayCapMin: undefined };
  // The check-in belongs to the day it was made on, and the route passes its
  // cap to every plan of that day, replans included.
  const cfgAt = (t: number): UserConfig =>
    POLICY.replanCap && ownDayOf(t, p.cfg) === ownDayOf(p.now, p.cfg) ? p.cfg : cfgNoCap;

  let schedule: Block[] = [];
  let lastFixed: Block[] = [];
  // The route calibrates from finished quests with logged focus time.
  const samples = history(p);
  const calibration = () => calibrateEstimates([
    ...samples,
    ...quests.filter((q) => q.status === 'COMPLETE' && (q.actualMinutes ?? 0) > 0)
      .map((q) => ({ category: q.category ?? null, estimatedMinutes: q.estimatedMinutes, actualMinutes: q.actualMinutes! })),
  ]);
  const tasksAt = (t: number) => questsToTasks(quests.filter((q) => q.status !== 'RESCUE'), {}, t, tz, calibration(), p.cfg.workingHours);
  // ── Invariants: every plan of the week is held to them, not only the first ──
  const inv = new Map<string, { n: number; detail: string }>();
  const bad = (name: string, detail: string) => {
    const e = inv.get(name) ?? { n: 0, detail };
    e.n += 1;
    inv.set(name, e);
  };
  /**
   * Check the plan as it stands at `t`. `before` is the plan the replan
   * started from (null after a full generate), for the churn measure.
   */
  const audit = (t: number, cfg: UserConfig, tasks: Task[], before: Block[] | null, trigger: Trigger) => {
    const byId = new Map(tasks.map((x) => [x.id, x]));
    const at = (x: number) => `${wd(x, tz)} ${fmt(x, tz)}`;
    const ahead = schedule.filter((b) => b.end > t);
    const work = ahead.filter(isWork).sort((a, b) => a.start - b.start);
    const fixedAhead = ahead.filter((b) => b.type === 'fixed');
    const onFixed = (b: Block) => fixedAhead.find((x) => x.start < b.end && b.start < x.end);
    const aheadMin = new Map<string, number>();

    for (let i = 0; i < work.length; i++) {
      const w = work[i]!;
      const task = byId.get(w.taskId!);
      const label = `"${task?.name ?? w.taskId}" ${at(w.start)}–${fmt(w.end, tz)} (plan of ${at(t)})`;
      if (i > 0 && w.start < work[i - 1]!.end - 1000) bad('work overlaps work', label);
      const fx = onFixed(w);
      if (fx) bad('work on a fixed block', `${label} on "${fx.note}"`);
      // Nobody in this lab is mid-block when a replan runs: a block that
      // began before now is one the person never started.
      if (w.start < t - 1000) bad('work started before now', label);
      if (!task) { bad('block for a quest that is gone', label); continue; }
      if (w.end > task.deadline + 1000) bad('past deadline', label);
      if (task.notBefore && w.start < task.notBefore) bad('before notBefore', label);
      const h0 = localHourOf(w.start, tz);
      const h1 = localHourOf(w.end, tz) || 24;
      const outside = pastMidnight(cfg)
        ? ((h0 - cfg.workingHours.startHour + 24.01) % 24) - 0.01 + (w.end - w.start) / HOUR > windowLen(cfg) + 0.01
        : h0 < cfg.workingHours.startHour - 0.01 || h1 > cfg.workingHours.endHour + 0.01;
      if (outside) bad('outside working hours', label);
      aheadMin.set(task.id, (aheadMin.get(task.id) ?? 0) + (w.end - Math.max(w.start, t)) / MIN);
    }
    for (const [id, m] of aheadMin) {
      const task = byId.get(id)!;
      if (m > task.remainingMin + 1) bad('quest over-committed', `"${task.name}" ${Math.round(m)} min planned ahead, ${Math.round(task.remainingMin)} left (plan of ${at(t)})`);
    }
    for (const r of fixedAhead.filter((x) => x.note?.startsWith('Daily:'))) {
      const c = fixedAhead.find((x) => !x.note?.startsWith('Daily:') && x.start < r.end && r.start < x.end);
      if (c) bad('routine on a calendar block', `"${r.note}" ${at(r.start)} on "${c.note}"`);
    }

    // Today's quests, done or still to do, against the check-in's minutes.
    if (cfg.todayCapMin !== undefined) {
      const today = schedule.filter((b) => isWork(b) && ownDayOf(b.start, cfg) === ownDayOf(t, cfg)).reduce((a, b) => a + mins(b), 0);
      if (today > cfg.todayCapMin + 5) bad('over check-in cap', `${today} min of quests today vs check-in ${cfg.todayCapMin} (plan of ${at(t)})`);
    }

    // The same replan again, at the same instant, changes nothing.
    const again = replan(schedule, tasks, cfg, t).schedule.filter((b) => b.end > t && isWork(b)).map(blockKey).sort();
    const first = work.map(blockKey).sort();
    if (again.length !== first.length || again.some((k, i) => k !== first[i])) {
      const gone = first.filter((k) => !again.includes(k)).length;
      bad('replan twice differs', `${gone} of ${first.length} blocks moved, ${again.length - first.length + gone} added (plan of ${at(t)})`);
    }

    // Breaks are real after a replan too.
    let streak = 0;
    let worst = 0;
    for (let i = 0; i < work.length; i++) {
      const gap = i === 0 ? Infinity : work[i]!.start - work[i - 1]!.end;
      streak = gap < 5 * MIN ? streak + mins(work[i]!) : mins(work[i]!);
      worst = Math.max(worst, streak);
    }
    if (worst > 110) bad('no-break', `${worst} min without a 5-min break (plan of ${at(t)})`);

    // Churn: of the blocks that were still good going in, how many moved.
    // A block is still good when it lies ahead, its quest is open and still
    // needs it, it ends before the deadline and nothing fixed landed on it.
    if (before) {
      const c = life.churn.get(trigger) ?? { valid: 0, moved: 0, replans: 0 };
      c.replans += 1;
      const now = new Set(work.map(blockKey));
      const left = new Map(tasks.map((x) => [x.id, x.remainingMin]));
      let valid = 0;
      let moved = 0;
      for (const b of before.filter((x) => isWork(x) && x.start >= t).sort((x, y) => x.start - y.start)) {
        const task = byId.get(b.taskId!);
        if (!task || b.end > task.deadline || (task.notBefore && b.start < task.notBefore) || onFixed(b)) continue;
        left.set(task.id, left.get(task.id)! - mins(b));
        if (left.get(task.id)! < -1) continue;
        valid += 1;
        if (!now.has(blockKey(b))) moved += 1;
      }
      c.valid += valid;
      c.moved += moved;
      life.churn.set(trigger, c);
      // Opening the Feed the moment the plan was made changes nothing at all.
      if (t === p.now && trigger === 'open' && (moved || work.length !== valid))
        bad('no-change replan changed the plan', `${moved} of ${valid} blocks moved, ${work.length - (valid - moved)} added (plan of ${at(t)})`);
    }
  };

  const regen = (t: number) => {
    const cfg = t === p.now ? p.cfg : cfgNoCap;
    const b = build(p, quests.filter((q) => q.status !== 'RESCUE'), t, cfg, calibration());
    schedule = b.schedule;
    lastFixed = b.fixed;
    life.replans++;
    audit(t, cfg, b.tasks, null, 'open');
  };
  const re = (t: number, trigger: Trigger) => {
    const cal = eventsToFixedBlocks(p.events, t).filter((b) => b.start < t + (p.cfg.horizonDays + 1) * DAY);
    const current = [...schedule.filter((b) => !isCalendarBlock(b)), ...cal];
    // routes/schedule.ts topUpRoutines: routines for days that lack them.
    // (By the person's own day: a 02:00 routine belongs to the night before.)
    const dayOf = (x: Block) => `${x.note}|${ownDayOf(x.start, p.cfg)}`;
    const have = new Set(current.filter((b) => b.note?.startsWith('Daily:')).map(dayOf));
    const routines = POLICY.morningRefresh
      ? placeDailyFillers({ fillers: p.dailies, now: t, horizonDays: p.cfg.horizonDays, workingHours: p.cfg.workingHours, existingFixed: current.filter((b) => b.end > t), tzOffsetMin: tz, idPrefix: `f${t}` }).filter((b) => !have.has(dayOf(b)))
      : [];
    const before = schedule;
    const cfg = cfgAt(t);
    const tasks = tasksAt(t);
    schedule = replan([...current, ...routines], tasks, cfg, t).schedule;
    life.replans++;
    audit(t, cfg, tasks, before, trigger);
  };

  // Deadlines that fall inside the lived week are what we score.
  const weekEnd = p.now + 7 * DAY;
  const tracked = new Set(quests.filter((q) => q.deadline && q.deadline.getTime() > p.now && q.deadline.getTime() <= weekEnd && q.status !== 'RESCUE').map((q) => q.id));
  const idleByQuest = new Map<string, number>();
  const initial = new Set(tracked);

  regen(p.now);
  // Benchmark: the most of these that anyone could finish in this week's
  // free time, knowing exactly how long each really takes.
  {
    const truth = tasksAt(p.now)
      .filter((t) => initial.has(t.id))
      .map((t) => ({ ...t, remainingMin: trueLeft.get(t.id)!, notBefore: undefined }));
    life.initialBest = mostOnTime(truth, buildDayInfo(cfgNoCap, p.now, lastFixed), cfgNoCap);
  }
  let t = p.now;
  let stale = 0;
  let vanished = new Set<string>();
  let noDailyDays = 0;
  let qn = 0;

  // Seven of the person's own days. For hours that run past midnight a day
  // is a night: it starts on one date and ends when the session closes on
  // the next, and everything that used to say "midnight" below (Not Today
  // ending, the day's blocks, deadlines passing) follows that instead.
  // Walking calendar dates cut each night in two at 00:00 and never lived
  // the hours after it.
  for (let d = 0; d < 7; d++) {
    const dayIdx = ownDayOf(p.now, p.cfg) + d;
    /** Midnight of the date this day's window starts on. */
    const midnight = baseMidnight(tz) + dayIdx * DAY;
    const dayStart = midnight + dayTurn(p.cfg);
    const wake = Math.max(t, midnight + Math.max(6.5, p.cfg.workingHours.startHour - 0.5) * HOUR);
    t = wake;
    // lib/deferral.ts reviveDeferred: "Not Today" ends when the person's day does.
    if (d > 0) for (const q of quests) if (q.status === 'NOT_TODAY') q.status = 'ACTIVE';

    // Opening the Feed: fetch; generate only when the stored plan is empty.
    const future = schedule.filter((b) => b.end > t);
    if (POLICY.morningRefresh) re(t, 'open');
    else if (future.length === 0) regen(t);
    const todayEnd = dayStart + 24 * HOUR;
    const todays = () => schedule.filter((b) => isWork(b) && b.start >= t - 1 && b.start < todayEnd).sort((a, b) => a.start - b.start);
    const pending = quests.filter((q) => q.status === 'ACTIVE' && (trueLeft.get(q.id) ?? 0) > 0);
    if (d > 0 && todays().length === 0 && pending.length) stale++;
    if (p.dailies.length && !schedule.some((b) => b.note?.startsWith('Daily:') && b.start >= dayStart && b.start < todayEnd)) noDailyDays++;

    // Surprise homework / a new ask lands mid-day.
    const surpriseAt = chance(r, p.surprisePerDay) ? midnight + (p.cfg.workingHours.startHour + r() * Math.max(1, windowLen(p.cfg))) * HOUR : Infinity;

    // Walk the day's blocks as they come.
    let guard = 0;
    while (guard++ < 60) {
      const next = todays().find((b) => b.start >= t - 1);
      if (surpriseAt < (next?.start ?? todayEnd) && surpriseAt > t) {
        t = surpriseAt;
        qn++;
        const q = makeQuest(r, { tz, now: t }, {
          title: `Surprise ${d}.${qn}`,
          estimatedMinutes: pick(r, [30, 45, 60, 90, 120, 180]),
          mentalLoad: int(r, 3, 9),
          impact: int(r, 5, 9),
          deadline: dueAt({ tz, now: t }, int(r, 1, 3)),
          createdAt: new Date(t),
          updatedAt: new Date(t),
        });
        quests.push(q);
        trueLeft.set(q.id, Math.round(q.estimatedMinutes * (POLICY.exact ? 1 : p.overrun)));
        if (q.deadline!.getTime() <= weekEnd) tracked.add(q.id);
        log(`${wd(t, tz)} ${fmt(t, tz)}  + new quest "${q.title}" ${q.estimatedMinutes}m due ${wd(q.deadline!.getTime(), tz)}`);
        re(t, 'new quest');
        continue;
      }
      if (!next) break;
      const q = quests.find((x) => x.id === next.taskId);
      if (!q || q.status !== 'ACTIVE') { t = next.end; continue; }
      life.plannedMin += mins(next);
      if (!chance(r, compliance)) {
        log(`${wd(next.start, tz)} ${fmt(next.start, tz)}  skipped "${q.title}" (${mins(next)}m)`);
        t = next.end;
        continue;
      }
      const need = trueLeft.get(q.id)!;
      // Nearly there when the block ends: people just finish.
      const worked = need - mins(next) <= Math.max(10, 0.3 * mins(next)) ? need : Math.min(mins(next), need);
      life.workedMin += worked;
      trueLeft.set(q.id, need - worked);
      q.actualMinutes = (q.actualMinutes ?? 0) + worked;
      t = next.start + worked * MIN;
      if (need - worked <= 0) {
        q.status = 'COMPLETE';
        log(`${wd(next.start, tz)} ${fmt(next.start, tz)}  did "${q.title}" ${worked}m → DONE`);
      } else {
        log(`${wd(next.start, tz)} ${fmt(next.start, tz)}  did "${q.title}" ${worked}m (${need - worked}m really left, plan thinks ${Math.max(0, q.estimatedMinutes - q.actualMinutes)})`);
      }
      re(t, 'session');
      // Overran its estimate, still open, a day or more to go, and nothing left for it in the plan.
      if (q.status === 'ACTIVE' && q.actualMinutes >= q.estimatedMinutes && (!q.deadline || q.deadline.getTime() > t + DAY) && !schedule.some((b) => b.taskId === q.id && b.end > t))
        vanished.add(q.id);
    }

    // Deadlines passing tonight: a missed quest was fixable if the person had
    // idle, unplanned free time before it and kept following the plan.
    t = Math.max(t, todayEnd - 1);
    for (const q of quests) {
      if (!tracked.has(q.id) || !q.deadline || q.deadline.getTime() > todayEnd) continue;
      tracked.delete(q.id);
      life.due++;
      if (q.status === 'COMPLETE') { life.met++; if (initial.has(q.id)) life.initialMet++; continue; }
      q.status = 'RESCUE';
      idleByQuest.set(q.id, 0);
      life.findings.push({ flag: 'week: missed deadline', detail: `"${q.title}" (${trueLeft.get(q.id)}m really left${vanished.has(q.id) ? ', vanished from the plan after overrunning its estimate' : ''})` });
    }
  }
  for (const id of vanished) {
    const q = quests.find((x) => x.id === id)!;
    if (q.status !== 'COMPLETE') life.findings.push({ flag: 'week: overran estimate → dropped from plan', detail: `"${q.title}" est ${q.estimatedMinutes}m, did ${q.actualMinutes}m, ${trueLeft.get(id)}m really left` });
  }
  if (stale) life.findings.push({ flag: 'week: stale morning (no work today)', detail: `${stale} morning(s) opened to nothing today while quests were pending` });
  if (noDailyDays >= 2) life.findings.push({ flag: 'week: dailies missing', detail: `${noDailyDays}/7 days without routines in the plan` });
  // One finding per broken invariant, weighted by how many plans broke it.
  for (const [name, e] of inv)
    life.findings.push({ flag: name === 'no-break' ? 'week: no-break after a replan' : `week INV: ${name}`, detail: `${e.n}×, e.g. ${e.detail}`, weight: e.n });
  void lastFixed;
  void idleByQuest;
  return life;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

function timeline(p: Person, b: Built): string {
  const byId = new Map(b.tasks.map((t) => [t.id, t]));
  const days = [...new Set(b.schedule.filter((x) => x.end > p.now).map((x) => ownDayOf(x.start, p.cfg)))].sort((x, y) => x - y).slice(0, 3);
  return days
    .map((k) => {
      const rows = b.schedule
        .filter((x) => ownDayOf(x.start, p.cfg) === k && x.end > p.now)
        .map((x) => {
          const t = x.taskId ? byId.get(x.taskId) : null;
          const label = t ? `${t.name} [${t.remainingMin}m left, load ${Math.round(t.cognitiveLoad * 10)}, due ${wd(t.deadline, p.tz)} ${fmt(t.deadline, p.tz)}]` : x.note ?? x.type;
          return `     ${fmt(x.start, p.tz)}–${fmt(x.end, p.tz)} ${String(mins(x)).padStart(3)}m  ${label}`;
        });
      return `   ${wd(b.schedule.find((x) => ownDayOf(x.start, p.cfg) === k)!.start, p.tz)}\n${rows.join('\n')}`;
    })
    .join('\n');
}

function describe(p: Person) {
  const h = p.cfg.workingHours;
  return `#${label(p.idx)} ${p.archetype}, UTC${p.tz <= 0 ? '+' : '-'}${Math.abs(p.tz / 60)}, hours ${h.startHour}–${h.endHour}, energy ${p.energyLabel}, ${p.quests.length} quests, ${p.dailies.length} dailies, ${p.events.length} events, opened ${wd(p.now, p.tz)} ${fmt(p.now, p.tz)}${p.cfg.todayCapMin !== undefined ? `, check-in cap ${p.cfg.todayCapMin}m` : ''}`;
}

const flagCount = new Map<string, { people: Set<number>; weight: number; examples: string[]; byArch: Map<string, number> }>();
const archCount = new Map<string, number>();
const times: number[] = [];
let crashes = 0;
const newWeek = () => ({ due: 0, met: 0, worked: 0, planned: 0, idealDue: 0, idealMet: 0, initialMet: 0, initialBest: 0 });
const week = newWeek();
/** The same totals over the ordinary people only, to set beside a run from before night-shift people existed. */
const weekOrdinary = newWeek();
const weekChurn = new Map<Trigger, { valid: number; moved: number; replans: number }>();
let weekReplans = 0;
const weekByArch = new Map<string, { due: number; met: number }>();
/**
 * The same outcomes by the person's hidden overrun factor. An estimate fix
 * must help the ×1.6 and ×2 rows without costing the ×0.8 and ×1 rows, and
 * the totals alone can't show that.
 */
const weekByOverrun = new Map<number, { people: number; due: number; met: number; idealDue: number; idealMet: number; initialMet: number; initialBest: number }>();

const range = (k: number, from = 0) => Array.from({ length: k }, (_, j) => from + j);
const everyone =
  SHOW !== null ? [SHOW]
  : [
      ...(NIGHT_MODE === 'only' ? [] : range(N)),
      ...(NIGHT_MODE === 'none' ? [] : range(NIGHT_MODE === 'only' ? N : Math.round(N * NIGHT_SHARE), NIGHT_BASE)),
    ];
for (const i of everyone) {
  // A night-shift person's quest ids are their own (n3q1, n3q2, …), so
  // `--show n3` is the same person, with the same tie-breaks, as in a full run.
  if (isNight(i)) { questPrefix = `${label(i)}q`; questSeq = 0; }
  const p = makePerson(i);
  archCount.set(p.archetype, (archCount.get(p.archetype) ?? 0) + 1);
  let findings: Finding[] = [];
  let built: Built | null = null;
  let weekLog: string[] = [];
  try {
    built = build(p, p.quests, p.now);
    times.push(built.ms);
    findings = gradePlan(p, built);
    if (WEEK) {
      // The same week followed perfectly: every miss left is the planner's.
      const ideal = liveWeek(p, false, 1);
      for (const f of ideal.findings) if (f.flag === 'week: missed deadline') findings.push({ flag: 'week: missed even when followed perfectly', detail: f.detail });
      for (const w of isNight(i) ? [week] : [week, weekOrdinary]) {
        w.idealDue += ideal.due;
        w.idealMet += ideal.met;
        w.initialMet += ideal.initialMet;
        w.initialBest += ideal.initialBest;
      }
      if (ideal.initialMet < ideal.initialBest)
        findings.push({ flag: 'week: fewer on time than possible (perfect follower)', detail: `${ideal.initialMet} of the week's starting deadlines met; ${ideal.initialBest} were possible`, weight: ideal.initialBest - ideal.initialMet });
      const life = liveWeek(p, SHOW !== null);
      findings.push(...life.findings);
      weekReplans += life.replans;
      for (const [k, c] of life.churn) {
        const w = weekChurn.get(k) ?? { valid: 0, moved: 0, replans: 0 };
        weekChurn.set(k, { valid: w.valid + c.valid, moved: w.moved + c.moved, replans: w.replans + c.replans });
      }
      for (const w of isNight(i) ? [week] : [week, weekOrdinary]) {
        w.due += life.due;
        w.met += life.met;
        w.worked += life.workedMin;
        w.planned += life.plannedMin;
      }
      const wa = weekByArch.get(p.archetype) ?? { due: 0, met: 0 };
      wa.due += life.due;
      wa.met += life.met;
      weekByArch.set(p.archetype, wa);
      const wo = weekByOverrun.get(p.overrun) ?? { people: 0, due: 0, met: 0, idealDue: 0, idealMet: 0, initialMet: 0, initialBest: 0 };
      wo.people++;
      wo.due += life.due;
      wo.met += life.met;
      wo.idealDue += ideal.due;
      wo.idealMet += ideal.met;
      wo.initialMet += ideal.initialMet;
      wo.initialBest += ideal.initialBest;
      weekByOverrun.set(p.overrun, wo);
      if (SHOW !== null) { console.log('\n   The week:'); for (const l of life.log) console.log(`     ${l}`); }
    }
  } catch (e) {
    crashes++;
    findings.push({ flag: 'CRASH', detail: String((e as Error).stack ?? e).split('\n').slice(0, 3).join(' | ') });
  }
  if (SHOW !== null) {
    console.log(`\n${describe(p)}`);
    for (const q of p.quests) console.log(`   · ${q.title} ${q.estimatedMinutes}m load ${q.mentalLoad} ${q.status}${q.priorityTier ? ' ' + q.priorityTier : ''}${q.deadline ? ` due ${wd(q.deadline.getTime(), p.tz)} ${fmt(q.deadline.getTime(), p.tz)} (+${dayIndexOf(q.deadline.getTime(), p.tz) - dayIndexOf(p.now, p.tz)}d)` : ''}${q.actualMinutes ? ` done ${q.actualMinutes}` : ''}`);
    for (const d of p.dailies) console.log(`   ↻ ${d.name} ${d.durationMin}m${d.preferredHour !== null ? ` @${d.preferredHour}` : ''}`);
    if (built) console.log(timeline(p, built));
    if (built && argv.includes('--debug')) {
      const live = built.tasks.filter((t) => t.remainingMin > 0.5 && t.deadline > p.now)
        .sort((a, b) => priorityScore(b, p.now) - priorityScore(a, p.now));
      const days = buildDayInfo(p.cfg, p.now, built.fixed);
      const dropped = triage(live, days, p.cfg.todayCapMin, p.cfg.breakPolicy);
      console.log(`   triage drops: ${[...dropped].map((id) => built!.tasks.find((t) => t.id === id)!.name).join(', ') || 'none'}`);
      for (const b of allocateBudgets(live, days, p.now, p.cfg.todayCapMin, p.cfg.breakPolicy, dropped))
        console.log(`   budget ${wd(b.day.workStart, p.tz)} (${Math.round(b.day.freeMinutes)} free): ${b.quotas.map((q) => `${q.task.name} ${q.targetMin}`).join(', ')}`);
    }
    if (weekLog.length) { console.log('   The week:'); for (const l of weekLog) console.log(`     ${l}`); }
    for (const f of findings) console.log(`   ✗ [${f.flag}] ${f.detail}`);
  }
  const seen = new Set<string>();
  for (const f of findings) {
    const e = flagCount.get(f.flag) ?? { people: new Set(), weight: 0, examples: [], byArch: new Map() };
    if (!seen.has(f.flag)) {
      e.byArch.set(p.archetype, (e.byArch.get(p.archetype) ?? 0) + 1);
      if (e.examples.length < EXAMPLES) e.examples.push(`#${label(i)} ${p.archetype}: ${f.detail}`);
    }
    e.people.add(i);
    e.weight += f.weight ?? 0;
    flagCount.set(f.flag, e);
    seen.add(f.flag);
  }
}

if (SHOW === null) {
  const n = everyone.length;
  const nights = everyone.filter(isNight).length;
  const sorted = [...times].sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]?.toFixed(1);
  console.log(`\nPopulation lab · ${n} people${nights && nights < n ? ` (${n - nights} + ${nights} night-shift)` : ''} · seed ${SEED}${WEEK ? ' · lived one week each' : ''}${POLICY.morningRefresh ? '' : ' · no morning refresh'}${POLICY.clipDailies ? ' · dailies clipped to 60' : ''}`);
  console.log(`archetypes: ${[...archCount].map(([a, c]) => `${a} ${c}`).join(', ')}`);
  console.log(`plan time: p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · max ${pct(1)} ms · crashes ${crashes}`);
  if (WEEK) {
    console.log(`week: deadlines met ${week.met}/${week.due} (${((week.met / Math.max(1, week.due)) * 100).toFixed(1)}%) · followed perfectly ${week.idealMet}/${week.idealDue} (${((week.idealMet / Math.max(1, week.idealDue)) * 100).toFixed(1)}%) · worked ${Math.round(week.worked / 60)} h of ${Math.round(week.planned / 60)} h planned-and-reached`);
    console.log(`      starting deadlines, perfect follower: ${week.initialMet} met of ${week.initialBest} possible (${((week.initialMet / Math.max(1, week.initialBest)) * 100).toFixed(1)}% of the best any plan could do)`);
    console.log(`      replans: ${(weekReplans / Math.max(1, n)).toFixed(1)} per person · still-valid blocks moved by a replan: ${[...weekChurn].map(([k, c]) => `${k} ${((c.moved / Math.max(1, c.valid)) * 100).toFixed(1)}% (${c.replans})`).join(' · ')}`);
    console.log(`      by archetype: ${[...weekByArch].map(([a, w]) => `${a} ${((w.met / Math.max(1, w.due)) * 100).toFixed(0)}%`).join(' · ')}`);
    // The line to hold against a baseline from before the night-shift people.
    if (nights && nights < n) {
      const o = weekOrdinary;
      console.log(`      without night-shift: deadlines met ${o.met}/${o.due} (${((o.met / Math.max(1, o.due)) * 100).toFixed(1)}%) · followed perfectly ${o.idealMet}/${o.idealDue} (${((o.idealMet / Math.max(1, o.idealDue)) * 100).toFixed(1)}%) · ${o.initialMet} met of ${o.initialBest} possible (${((o.initialMet / Math.max(1, o.initialBest)) * 100).toFixed(1)}%)`);
    }
    const share = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
    console.log('      by real work ÷ estimate (met · followed perfectly · of the best possible):');
    for (const [o, w] of [...weekByOverrun].sort((a, b) => a[0] - b[0]))
      console.log(`        ×${String(o).padEnd(4)} ${String(w.people).padStart(4)} people: ${share(w.met, w.due).padStart(6)} · ${share(w.idealMet, w.idealDue).padStart(6)} · ${share(w.initialMet, w.initialBest).padStart(6)}`);
  }
  console.log('');
  const rows = [...flagCount].filter(([k]) => !ONLY_FLAG || k.includes(ONLY_FLAG)).sort((a, b) => b[1].people.size - a[1].people.size);
  for (const [flag, e] of rows) {
    const share = ((e.people.size / n) * 100).toFixed(1).padStart(5);
    const arch = [...e.byArch].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, c]) => `${a} ${((c / archCount.get(a)!) * 100).toFixed(0)}%`).join(', ');
    console.log(`${share}%  ${flag}${e.weight ? ` (${Math.round(e.weight / e.people.size)} avg)` : ''}   [${arch}]`);
    for (const ex of e.examples) console.log(`          ${ex}`);
  }
}
