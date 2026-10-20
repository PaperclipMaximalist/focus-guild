/**
 * Intense-week lab: one overloaded week, lived through the scheduler exactly
 * as the app runs it (lib/userConfig.ts: a 5-minute gap, a 30-minute break
 * about every two hours, days filled in order, the "time available" slider).
 *
 *   npm run lab:week                 the week, a day-by-day report and the checks
 *   npm run lab:week -- --plans      also print each morning's plan
 *   npm run lab:week -- --seed 7     a different person's pace (how long things really take)
 *   npm run lab:week -- --no-rotate  sessions instead of rotation (the app before 2026-10-19)
 *
 * The person: a graduate student who also freelances, hours 08:00–23:00 in
 * Vancouver, classes and a lab on the calendar, four routines, about 70 hours
 * of quests against roughly 60 free, with deadlines bunched midweek, two
 * quests already overdue, steps on the thesis chapter, and two surprises that
 * arrive mid-week. They follow the plan block by block, take longer than they
 * said on some quests, finish others early, drag one quest a day to a new
 * place, and set the slider on two days.
 *
 * Every plan the week produces is held to the rules: nothing overlaps, no work
 * before now or past its deadline or outside the day, the gap between quests
 * is the gap, a break sits between two quests and only after about two hours
 * of work, no quest holds more than it has left, and a replan run twice is the
 * same plan. Then the week is graded: deadlines met (and whether they could
 * have been), hours filled, fragments, switches, late heavy work, and how long
 * each replan took.
 *
 * Pure: the scheduler, the adapter and the routine placer, no DB, no network.
 */

import { writeFileSync } from 'node:fs';
import { generateSchedule, replan } from '../src/lib/scheduler/replan.js';
import { applyEdit } from '../src/lib/scheduler/edits.js';
import { questsToTasks, type QuestLike } from '../src/lib/scheduler/adapter.js';
import { placeDailyFillers, type DailyFiller } from '../src/lib/scheduler/dailyFiller.js';
import { getUserConfig } from '../src/lib/userConfig.js';
import type { Block, Task, UserConfig } from '../src/lib/scheduler/types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TZ = 420; // Vancouver in October: UTC-7

const argv = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? def) : def;
};
const SEED = Number(arg('seed', '1'));
const SHOW_PLANS = argv.includes('--plans');

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED * 7919);

// ── Time, in Vancouver ──────────────────────────────────────────────────
/** Monday 19 October 2026, local midnight, as UTC ms. */
const MON = Date.UTC(2026, 9, 19) + TZ * MIN;
/** Local time on day `d` (0 = Monday) at hour `h` (may be fractional). */
const at = (d: number, h: number) => MON + d * DAY + h * HOUR;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayIdx = (t: number) => Math.floor((t - MON) / DAY);
const clock = (t: number) => {
  const local = new Date(t - TZ * MIN);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
};
const when = (t: number) => `${DAYS[dayIdx(t)] ?? `+${dayIdx(t)}`} ${clock(t)}`;
const mins = (b: { start: number; end: number }) => Math.round((b.end - b.start) / MIN);

// ── The person ─────────────────────────────────────────────────────────
const cfg: UserConfig = {
  ...getUserConfig({ schedulerSettings: { workingHours: { startHour: 8, endHour: 23 } } }, TZ),
  ...(argv.includes('--no-rotate') ? { rotate: false } : {}),
};

interface Q extends QuestLike {
  /** How long it really takes, against the estimate (the person doesn't know this). */
  pace: number;
  /** Minutes it really takes: the first estimate times the pace. */
  truth?: number;
  /** Arrives part-way through the week. */
  arrives?: number;
  doneAt?: number;
}
let qid = 0;
const created = at(-3, 10);
function quest(title: string, estimatedMinutes: number, deadline: number | null, o: Partial<Q> = {}): Q {
  qid += 1;
  return {
    id: `q${qid}`,
    title,
    estimatedMinutes,
    mentalLoad: 5,
    impact: 5,
    deadline: deadline === null ? null : new Date(deadline),
    status: 'ACTIVE',
    tags: [],
    actualMinutes: 0,
    createdAt: new Date(created),
    updatedAt: new Date(created),
    category: 'deep_work',
    pace: 1,
    ...o,
  };
}
const heavy = { mentalLoad: 8, category: 'deep_work' } as const;
const light = { mentalLoad: 3, category: 'admin' } as const;
const pace = (lo: number, hi: number) => lo + rnd() * (hi - lo);

const QUESTS: Q[] = [
  // Due today and tomorrow.
  quest('Review paper for journal', 180, at(0, 18), { ...heavy, priorityTier: 'HIGH', pace: pace(0.9, 1.2) }),
  quest('Reply to advisor about chapter', 20, at(0, 12), { ...light, category: 'comms' }),
  quest('Lab report 3', 240, at(1, 23.99), { ...heavy, pace: pace(1, 1.4) }),
  quest('Submit timesheet', 15, at(1, 17), light),
  // Midweek pile-up.
  quest('Grant application: budget', 120, at(2, 23.99), { ...heavy, pace: pace(0.9, 1.3) }),
  quest('Grant application: narrative', 240, at(2, 23.99), { ...heavy, priorityTier: 'HIGH', pace: pace(1, 1.5) }),
  quest('Team meeting slides', 150, at(2, 17), { mentalLoad: 6, category: 'creative', pace: pace(0.8, 1.2) }),
  quest('Statistics midterm prep', 480, at(3, 9), { ...heavy, priorityTier: 'HIGH', pace: pace(1, 1.2) }),
  quest('Book flights for conference', 30, at(3, 23.99), light),
  // End of the week.
  quest('Thesis ch.3: methods', 300, at(4, 17), { ...heavy, pace: pace(1, 1.3) }),
  quest('Thesis ch.3: results', 240, at(4, 17), { ...heavy, pace: pace(1, 1.4) }),
  quest('Thesis ch.3: figures', 120, at(4, 17), { mentalLoad: 6, category: 'creative' }),
  quest('Client milestone: landing page', 300, at(5, 12), { mentalLoad: 7, category: 'creative', pace: pace(0.9, 1.3) }),
  quest('Pay rent', 10, at(4, 12), light),
  quest('Expense claims', 45, at(4, 23.99), { ...light, tediousness: 0.9 }),
  quest('Reading group paper', 90, at(3, 16), { mentalLoad: 6, category: 'learning' }),
  // Small things all week.
  ...['Email landlord', 'Update CV', 'Order printer ink', 'Renew library books', 'Call bank', 'Schedule dentist'].map((t, i) =>
    quest(t, [15, 45, 10, 15, 20, 10][i]!, at(1 + (i % 5), 20), { ...light, category: i === 4 ? 'comms' : 'admin' }),
  ),
  // No deadline.
  quest('Side project: parser', 400, null, { mentalLoad: 7, priorityTier: 'LOW' }),
  quest('Background reading', 300, null, { mentalLoad: 5, category: 'learning', priorityTier: 'LOW' }),
  // Already overdue (stragglers): the planner leaves these to the Stragglers page.
  quest('Conference registration', 30, at(-1, 17), { ...light, status: 'RESCUE' }),
  quest('Return borrowed equipment', 20, at(-2, 12), { ...light, status: 'RESCUE' }),
  // Surprises.
  quest('Fix production bug for client', 120, at(1, 20), { ...heavy, priorityTier: 'HIGH', arrives: at(1, 14) }),
  quest('Peer review for classmate', 90, at(4, 12), { mentalLoad: 6, category: 'learning', arrives: at(3, 10) }),
];

const FILLERS: DailyFiller[] = [
  { id: 'r-inbox', name: 'Clear the inbox', durationMin: 20, preferredHour: 9 },
  { id: 'r-spanish', name: 'Spanish practice', durationMin: 20, preferredHour: 21 },
  { id: 'r-walk', name: 'Walk', durationMin: 30, preferredHour: 18 },
  { id: 'r-tidy', name: 'Tidy desk', durationMin: 10, preferredHour: null },
];

const cal = (d: number, from: number, to: number, what: string): Block => ({
  id: `cal-${d}-${from}`,
  start: at(d, from),
  end: at(d, to),
  type: 'fixed',
  taskId: null,
  locked: true,
  note: `Calendar: ${what}`,
});
const CALENDAR: Block[] = [
  ...[0, 2, 4].map((d) => cal(d, 10, 11.5, 'Lecture')),
  ...[1, 3].map((d) => cal(d, 13, 16, 'Lab')),
  cal(2, 17, 18, 'Team meeting'),
  cal(3, 8.5, 9.5, 'Dentist'),
  cal(4, 19, 21, 'Dinner with friends'),
  cal(5, 10, 13, 'Volunteering'),
];

/** The slider, on the days it was set: hours from the first open. */
const SLIDER: Record<number, number> = { 2: 9, 5: 5 };

// ── The app's loop ─────────────────────────────────────────────────────
const live = (now: number) => QUESTS.filter((q) => (q.arrives ?? 0) <= now && q.status !== 'COMPLETE');
const tasksAt = (now: number, c: UserConfig): Task[] => questsToTasks(live(now), {}, now, TZ, null, c.workingHours);
function routinesFor(schedule: Block[], now: number, c: UserConfig): Block[] {
  const dayKey = (b: Block) => `${b.note}|${dayIdx(b.start)}`;
  const have = new Set(schedule.filter((b) => b.note?.startsWith('Daily:')).map(dayKey));
  return placeDailyFillers({
    fillers: FILLERS,
    now,
    horizonDays: c.horizonDays,
    workingHours: c.workingHours,
    existingFixed: schedule.filter((b) => b.end > now),
    tzOffsetMin: TZ,
    idPrefix: `filler-${now}`,
  }).filter((b) => !have.has(dayKey(b)));
}

const findings: string[] = [];
const bad = (what: string, detail: string) => findings.push(`${what}: ${detail}`);
const timings: number[] = [];
let lastIssues: Array<{ taskId: string; shortfallMin: number }> = [];
let replans = 0;

function check(schedule: Block[], tasks: Task[], now: number, c: UserConfig, label: string) {
  // (Plans are made in whole minutes: a block ending within this minute is behind.)
  const ahead = schedule.filter((b) => b.end > Math.ceil(now / MIN) * MIN).sort((a, b) => a.start - b.start);
  const ids = new Set<string>();
  for (const b of schedule) {
    if (ids.has(b.id)) bad('id twice', `${b.id} (${label})`);
    ids.add(b.id);
  }
  for (let i = 1; i < ahead.length; i += 1) {
    const p = ahead[i - 1]!, b = ahead[i]!;
    if (b.start < p.end - 1000 && !(p.type === 'fixed' && b.type === 'fixed')) bad('overlap', `${p.type} ${when(p.start)}-${clock(p.end)} and ${b.type} ${when(b.start)} (${label})`);
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const work = ahead.filter((b) => b.type === 'work');
  const placed = new Map<string, number>();
  for (let i = 0; i < ahead.length; i += 1) {
    const b = ahead[i]!;
    if (b.type === 'break' && b.start > now) {
      const before = ahead[i - 1], after = ahead[i + 1];
      if (mins(b) !== (c.breakMin ?? 0)) bad('break length', `${mins(b)} min at ${when(b.start)} (${label})`);
      if (!after || after.type !== 'work' || after.start !== b.end) bad('break not followed by a quest', `${when(b.start)} (${label})`);
      // (What it follows may be behind already: a sitting finished a moment ago, the break taken on the next minute.)
      const prior = before ?? schedule.filter((x) => x !== b && x.end <= b.start).sort((x, y) => y.end - x.end)[0];
      if (!prior || b.start - prior.end >= MIN || (prior.type !== 'work' && prior.type !== 'fixed')) bad('break not after a quest or a routine', `${when(b.start)} (${label})`);
    }
    if (b.type !== 'work') continue;
    const t = byId.get(b.taskId!);
    if (!t) { bad('block for a quest that is gone', `${when(b.start)} (${label})`); continue; }
    if (b.start < now - 1000) bad('work before now', `${t.name} ${when(b.start)} (${label})`);
    if (b.end > t.deadline + 1000) bad('past its deadline', `${t.name} ${when(b.start)}-${clock(b.end)}, due ${when(t.deadline)} (${label})`);
    if (t.notBefore && b.start < t.notBefore) bad('before Not Today ends', `${t.name} (${label})`);
    const h0 = (b.start - MON) / HOUR % 24, h1 = h0 + mins(b) / 60;
    if (h0 < c.workingHours.startHour - 0.01 || h1 > c.workingHours.endHour + 0.01) {
      const slid = c.todayEndsAt !== undefined && dayIdx(b.start) === dayIdx(now);
      if (!slid) bad('outside working hours', `${t.name} ${when(b.start)} (${label})`);
    }
    placed.set(t.id, (placed.get(t.id) ?? 0) + (b.end - Math.max(b.start, now)) / MIN);
    const prev = ahead[i - 1];
    if (prev?.type === 'work' && prev.start >= now && b.start - prev.end < (c.gapMin ?? 0) * MIN - 1000) {
      bad('gap too short', `${clock(prev.end)}→${clock(b.start)} ${when(b.start)} (${label})`);
    }
  }
  for (const [id, m] of placed) {
    const t = byId.get(id)!;
    if (m > t.remainingMin + 5) bad('over-placed', `${t.name}: ${Math.round(m)} min planned, ${t.remainingMin} left (${label})`);
  }
  // Runs of quest work without a pause of a break's length.
  let run = 0, last = -Infinity;
  for (const b of ahead) {
    if (b.type !== 'work') continue;
    if (b.start - last >= (c.breakMin ?? 30) * MIN) run = 0;
    run += mins(b);
    last = b.end;
    if (run > 200) { bad('long run without a break', `${run} min to ${when(b.end)} (${label})`); run = 0; }
  }
  void work;
}

function shape(schedule: Block[], now: number) {
  return schedule.filter((b) => b.end > now && (b.type === 'work' || b.type === 'break')).map((b) => `${b.type}${b.taskId}@${b.start}-${b.end}`).sort().join('|');
}

function plan(schedule: Block[] | null, now: number, c: UserConfig, label: string, opts: { add?: string[] } = {}): Block[] {
  const tasks = tasksAt(now, c);
  const t0 = performance.now();
  let out: Block[];
  // DUMP_LABEL=<part of a label> DUMP=<file>: write what that plan starts from, to replay it.
  if (process.env.DUMP_LABEL && process.env.DUMP && label.includes(process.env.DUMP_LABEL)) {
    const current = schedule ? [...schedule.filter((b) => !b.id.startsWith('cal-')), ...CALENDAR.filter((b) => b.end > now)] : [...CALENDAR.filter((b) => b.end > now)];
    const input = [...current, ...routinesFor(current, now, c)];
    writeFileSync(process.env.DUMP, JSON.stringify({ input, tasks, config: { ...c, energyCurve: undefined }, now, add: opts.add ?? [], fillers: FILLERS, fresh: !schedule }));
    process.env.DUMP = '';
  }
  if (!schedule) {
    const fixed = [...CALENDAR.filter((b) => b.end > now)];
    out = generateSchedule(tasks, [...fixed, ...routinesFor(fixed, now, c)], c, now, FILLERS).schedule;
  } else {
    const current = [...schedule.filter((b) => !b.id.startsWith('cal-')), ...CALENDAR.filter((b) => b.end > now)];
    const input = [...current, ...routinesFor(current, now, c)];
    if (opts.add && process.env.DUMP) {
      writeFileSync(process.env.DUMP, JSON.stringify({ input, tasks, config: { ...c, energyCurve: undefined }, now, add: opts.add, fillers: FILLERS }));
      process.env.DUMP = '';
    }
    const r = replan(input, tasks, c, now, { routines: FILLERS, ...(opts.add ? { addTaskIds: opts.add } : {}) });
    lastIssues = r.feasibilityReport.issues;
    out = r.schedule;
  }
  timings.push(performance.now() - t0);
  replans += 1;
  check(out, tasks, now, c, label);
  // The same replan again changes nothing.
  const again = replan(out, tasks, c, now, { routines: FILLERS }).schedule;
  if (shape(again, now) !== shape(out, now)) bad('replan twice differs', label);
  return out;
}

// ── Living the week ────────────────────────────────────────────────────
interface DayLog { planned: number; worked: number; breaks: number; available: number; fragments: number; switches: number; repeats: number; quests: number; lateHeavy: number; idle: number }
const days: DayLog[] = DAYS.map(() => ({ planned: 0, worked: 0, breaks: 0, available: 0, fragments: 0, switches: 0, repeats: 0, quests: 0, lateHeavy: 0, idle: 0 }));
const events: string[] = [];
const workedBlocks: Array<{ id: string; title: string; start: number; end: number; heavy: boolean }> = [];

function printPlan(schedule: Block[], d: number) {
  const day = schedule.filter((b) => dayIdx(b.start) === d && b.end > at(d, 0)).sort((a, b) => a.start - b.start);
  console.log(`  ${DAYS[d]} plan:`);
  for (const b of day) {
    const q = QUESTS.find((x) => x.id === b.taskId);
    const what = b.type === 'work' ? q?.title ?? '?' : b.type === 'break' ? '— break —' : b.note ?? b.type;
    console.log(`    ${clock(b.start)}–${clock(b.end)} ${String(mins(b)).padStart(3)}m  ${what}`);
  }
}

let schedule: Block[] | null = null;
let surprisesSeen = new Set<string>();
for (let d = 0; d < 7; d += 1) {
  let now = at(d, 8);
  const c: UserConfig = SLIDER[d] ? { ...cfg, todayEndsAt: now + SLIDER[d]! * HOUR } : cfg;
  const end = c.todayEndsAt ?? at(d, 23);
  schedule = plan(schedule, now, c, `${DAYS[d]} morning`);
  if (SHOW_PLANS) printPlan(schedule, d);
  days[d]!.planned = schedule.filter((b) => b.type === 'work' && dayIdx(b.start) === d).reduce((m, b) => m + mins(b), 0);
  days[d]!.breaks = schedule.filter((b) => b.type === 'break' && dayIdx(b.start) === d).length;

  // One drag a day: the third quest of the day goes first.
  const upcoming = schedule.filter((b) => b.type === 'work' && b.start > now && dayIdx(b.start) === d).sort((a, b) => a.start - b.start);
  const dragged = upcoming.find((b, i) => i >= 2 && b.taskId !== upcoming[0]!.taskId && b.taskId !== upcoming[1]!.taskId);
  if (dragged) {
    schedule = applyEdit(schedule, { kind: 'reorder_block', blockId: dragged.id, beforeId: upcoming[0]!.id });
    schedule = plan(schedule, now, c, `${DAYS[d]} drag`);
    const ahead = schedule.filter((b) => b.type === 'work' && b.start > now).sort((a, b) => a.start - b.start);
    const title = (id: string | null) => QUESTS.find((q) => q.id === id)?.title;
    const mine = ahead.find((b) => b.taskId === dragged.taskId);
    const where = !mine ? 'gone from the plan' : mine === ahead[0] ? 'first now' : `now at ${clock(mine.start)}, after ${ahead.indexOf(mine)} block(s) (first slot it fits whole: ${mins(mine)} min)`;
    events.push(`${DAYS[d]} 08:00: dragged "${title(dragged.taskId)}" to the top; ${where}`);
  }

  // Follow the plan, block by block.
  for (let guard = 0; guard < 80; guard += 1) {
    // A surprise arrives: the app adds it and replans.
    const surprise = QUESTS.find((q) => q.arrives !== undefined && q.arrives <= now && !surprisesSeen.has(q.id));
    if (surprise) {
      surprisesSeen.add(surprise.id);
      schedule = plan(schedule, now, c, `${when(now)} new quest`, { add: [surprise.id] });
      events.push(`${when(now)}: "${surprise.title}" arrives, due ${when(surprise.deadline!.getTime())}`);
      if (argv.includes('--debug')) {
        const title = (id: string | null) => QUESTS.find((q) => q.id === id)?.title ?? '';
        console.log(`after "${surprise.title}" arrives at ${when(now)}:`);
        for (const b of schedule.filter((x) => x.end > now).sort((x, y) => x.start - y.start).slice(0, 10)) {
          console.log(`  ${when(b.start)}-${clock(b.end)} ${b.type} ${b.type === 'work' ? title(b.taskId) : b.note ?? ''}`);
        }
        const t = tasksAt(now, c).find((x) => x.id === surprise.id);
        console.log(`  short: ${lastIssues.map((i) => `${QUESTS.find((q) => q.id === i.taskId)?.title} ${i.shortfallMin}m`).join(', ')}`);
        console.log(`  task: remaining ${t?.remainingMin} due ${t ? when(t.deadline) : '-'} status ${t?.status} notBefore ${t?.notBefore ? when(t.notBefore) : '-'}`);
      }
    }
    // (Not the last seconds of a block for a quest just finished: plans are in whole minutes.)
    const next = schedule
      .filter((b) => b.type === 'work' && b.end > Math.ceil(now / MIN) * MIN && b.start < end && QUESTS.find((q) => q.id === b.taskId)?.status !== 'COMPLETE')
      .sort((a, b) => a.start - b.start)[0];
    if (!next || next.start >= end) break;
    const q = QUESTS.find((x) => x.id === next.taskId)!;
    // Idle time the plan left in a free stretch is counted below; here, work it.
    const start = Math.max(now, next.start);
    const length = (next.end - start) / MIN;
    q.truth ??= q.estimatedMinutes * q.pace;
    const trueTotal = q.truth;
    const left = trueTotal - (q.actualMinutes ?? 0);
    const spent = Math.min(length, Math.max(0, left));
    q.actualMinutes = (q.actualMinutes ?? 0) + spent;
    now = start + spent * MIN;
    workedBlocks.push({ id: next.id, title: q.title, start, end: now, heavy: q.mentalLoad >= 7 });
    days[d]!.worked += spent;
    if (left <= length) {
      q.status = 'COMPLETE';
      q.doneAt = now;
    } else if ((q.actualMinutes ?? 0) >= q.estimatedMinutes) {
      // Ran over: the person adds half an hour to the estimate and carries on.
      q.estimatedMinutes += 30;
      events.push(`${when(now)}: "${q.title}" runs over; estimate raised to ${q.estimatedMinutes} min`);
    }
    schedule = plan(schedule, now, c, `${when(now)} after a block`);
  }
}

// ── The grade ──────────────────────────────────────────────────────────
// --worked <day index>: what the person actually did that day.
if (argv.includes('--worked')) {
  const d = Number(arg('worked', '0'));
  for (const b of workedBlocks.filter((x) => dayIdx(x.start) === d)) console.log(`  worked ${clock(b.start)}–${clock(b.end)} ${String(Math.round(mins(b))).padStart(3)}m ${b.title}`);
}
for (let d = 0; d < 7; d += 1) {
  const blocks = workedBlocks.filter((b) => dayIdx(b.start) === d).sort((a, b) => a.start - b.start);
  days[d]!.fragments = blocks.filter((b) => mins(b) < 20).length;
  days[d]!.switches = blocks.slice(1).filter((b, i) => b.title !== blocks[i]!.title).length;
  // The same quest straight after itself (a gap, a break or a routine between still counts).
  days[d]!.repeats = blocks.slice(1).filter((b, i) => b.title === blocks[i]!.title).length;
  days[d]!.quests = new Set(blocks.map((b) => b.title)).size;
  days[d]!.lateHeavy = blocks.filter((b) => b.heavy && (b.start - MON) / HOUR % 24 >= 21.5).length;
  const end = SLIDER[d] ? at(d, 8) + SLIDER[d]! * HOUR : at(d, 23);
  const busy = [...CALENDAR.filter((b) => dayIdx(b.start) === d), ...workedBlocks.filter((b) => dayIdx(b.start) === d)];
  days[d]!.available = Math.round((end - at(d, 8)) / MIN - CALENDAR.filter((b) => dayIdx(b.start) === d && b.end <= end).reduce((m, b) => m + mins(b), 0));
  void busy;
}

console.log(`Intense-week lab · seed ${SEED} · ${QUESTS.length} quests, ${Math.round(QUESTS.reduce((m, q) => m + q.estimatedMinutes, 0) / 60)} h estimated · hours 08:00–23:00 · gap ${cfg.gapMin} min · break ${cfg.breakMin} min every ${cfg.breakEveryMin} min`);
console.log('');
console.log('day   free   planned  worked  breaks  <20m  switches  repeats  quests  heavy after 21:30');
for (let d = 0; d < 7; d += 1) {
  const x = days[d]!;
  const h = (m: number) => `${(m / 60).toFixed(1)}h`.padStart(6);
  console.log(`${DAYS[d]}  ${h(x.available)}  ${h(x.planned)}  ${h(x.worked)}  ${String(x.breaks).padStart(6)}  ${String(x.fragments).padStart(4)}  ${String(x.switches).padStart(8)}  ${String(x.repeats).padStart(7)}  ${String(x.quests).padStart(6)}  ${String(x.lateHeavy).padStart(4)}${SLIDER[d] ? `   (slider: ${SLIDER[d]} h)` : ''}`);
}
console.log('');

const dated = QUESTS.filter((q) => q.deadline && q.status !== 'RESCUE' && q.deadline.getTime() > MON);
const met = dated.filter((q) => q.doneAt !== undefined && q.doneAt <= q.deadline!.getTime());
console.log(`deadlines met ${met.length}/${dated.length}`);
for (const q of dated.filter((x) => !met.includes(x))) {
  const due = q.deadline!.getTime();
  // Could it have been met? All work due by then, against the free time
  // before it (less a fifth for gaps and breaks). And by each later deadline:
  // when the work due by Thursday 09:00 doesn't fit before it, something due
  // by then misses whatever the order, and which one is a choice.
  const needBy = (t: number) => dated.filter((x) => x.deadline!.getTime() <= t && (x.arrives ?? 0) < t).reduce((m, x) => m + (x.truth ?? x.estimatedMinutes * x.pace), 0);
  const freeBy = (t: number) => {
    let free = 0;
    for (let d = 0; d < 7; d += 1) {
      const from = at(d, 8), to = Math.min(t, SLIDER[d] ? from + SLIDER[d]! * HOUR : at(d, 23));
      if (to <= from) continue;
      free += (to - from) / MIN - CALENDAR.filter((b) => b.start >= from && b.end <= to).reduce((m, b) => m + mins(b), 0);
    }
    return free * 0.8;
  };
  const later = dated.map((x) => x.deadline!.getTime()).filter((t) => t > due).sort((a, b) => a - b).find((t) => needBy(t) > freeBy(t));
  const blocker = later !== undefined ? dated.find((x) => x.deadline!.getTime() === later)!.title : '';
  const verdict = needBy(due) > freeBy(due)
    ? 'impossible (more work due by then than free time, with rests)'
    : later !== undefined
      ? `a trade-off (the work due by ${when(later)}, "${blocker}" among it, doesn't all fit)`
      : 'could have been met';
  console.log(`  missed: "${q.title}" due ${when(due)} — ${q.doneAt ? `done ${when(q.doneAt)}` : `${Math.round((q.truth ?? q.estimatedMinutes * q.pace) - (q.actualMinutes ?? 0))} min left`} · ${verdict}`);
}
const sorted = [...timings].sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!.toFixed(0);
console.log(`replans: ${replans} · time per plan p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · max ${pct(1)} ms`);
console.log('');
console.log('events:');
for (const e of events) console.log(`  ${e}`);
console.log('');
const counts = new Map<string, { n: number; first: string }>();
for (const f of findings) {
  const [k, ...rest] = f.split(': ');
  const e = counts.get(k!) ?? { n: 0, first: rest.join(': ') };
  e.n += 1;
  counts.set(k!, e);
}
console.log(findings.length ? 'problems:' : 'problems: none');
for (const [k, e] of counts) console.log(`  ${k} ×${e.n}, e.g. ${e.first}`);
if (findings.length) process.exitCode = 1;
