/**
 * Scenario lab: run the real scheduler on realistic weeks and grade the
 * result against what the Project Bible promises the Feed will feel like.
 *
 *   npm run lab            all scenarios, summary + day-one timelines
 *   npm run lab -- crunch  one scenario by id
 *
 * Unlike the unit tests (which pin single properties with tiny inputs), this
 * looks at whole plans the way a person would: is the first thing today
 * doable, does anything hard land at 8pm, does the essay sit for four hours
 * straight, does a test tomorrow actually get studied for.
 *
 * Pure: same pipeline the /schedule routes use (questsToTasks → calendar
 * fixed blocks → generateSchedule / replan), no DB, no network.
 */

import { generateSchedule, replan } from '../src/lib/scheduler/replan.js';
import { explainBlock } from '../src/lib/scheduler/explain.js';
import { questsToTasks, type QuestLike } from '../src/lib/scheduler/adapter.js';
import { defaultConfig } from '../src/lib/scheduler/config.js';
import { eventsToFixedBlocks } from '../src/lib/calendar/ics.js';
import { placeDailyFillers, type DailyFiller } from '../src/lib/scheduler/dailyFiller.js';
import type { Block, Task, UserConfig } from '../src/lib/scheduler/types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Vancouver in September: getTimezoneOffset() = 420. */
const TZ = 420;

/** A local wall-clock time in Vancouver as a UTC instant. */
const local = (y: number, mo: number, d: number, h: number, mi = 0) =>
  Date.UTC(y, mo - 1, d, h, mi) + TZ * MIN;
const localHour = (t: number) => {
  const d = new Date(t - TZ * MIN);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};
const fmt = (t: number) => new Date(t - TZ * MIN).toISOString().slice(11, 16);
const dayKey = (t: number) => new Date(t - TZ * MIN).toISOString().slice(0, 10);
const weekday = (t: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(t - TZ * MIN).getUTCDay()];

// Monday 28 Sep 2026, 07:30 local.
const MONDAY = local(2026, 9, 28, 7, 30);

let seq = 0;
function quest(title: string, minutes: number, load: number, dueInDays: number | null, extra: Partial<QuestLike> = {}): QuestLike {
  seq += 1;
  const now = new Date(MONDAY);
  return {
    id: `q${String(seq).padStart(2, '0')}`,
    title,
    estimatedMinutes: minutes,
    mentalLoad: load,
    impact: 6,
    // Deadlines at 23:59 local on the due day, like a date picker would set.
    deadline: dueInDays === null ? null : new Date(local(2026, 9, 28 + dueInDays, 23, 59)),
    status: 'ACTIVE',
    tags: [],
    createdAt: new Date(now.getTime() - 3 * DAY),
    updatedAt: now,
    ...extra,
  };
}

/** School, Mon–Fri 08:40–15:10, as calendar busy blocks. */
function schoolWeek(from: number): Array<{ id: string; title: string; start: Date; end: Date }> {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const day = from + i * DAY;
    const wd = new Date(day - TZ * MIN).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const d = new Date(day - TZ * MIN);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    out.push({ id: `school-${dd}`, title: 'School', start: new Date(local(y, mo, dd, 8, 40)), end: new Date(local(y, mo, dd, 15, 10)) });
  }
  return out;
}

function cfgWith(over: Partial<UserConfig> = {}): UserConfig {
  return { ...defaultConfig(), tzOffsetMin: TZ, ...over };
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

interface Scenario {
  id: string;
  title: string;
  quests: QuestLike[];
  cfg: UserConfig;
  now: number;
  calendar: ReturnType<typeof schoolWeek>;
  /** Recurring dailies, placed the way the /schedule route places them. */
  dailies?: DailyFiller[];
  /** Anything this scenario specifically must get right. */
  expect?: (r: Report) => string[];
}

function scenarios(): Scenario[] {
  seq = 0;
  const studentHours = cfgWith({ workingHours: { startHour: 15.5 as number, endHour: 21.5 as number } });
  const normal: QuestLike[] = [
    quest('Extended essay: draft section 2', 360, 8, 12, { impact: 9 }),
    quest('Chem IA: data analysis', 240, 8, 4, { impact: 8 }),
    quest('Maths test revision', 180, 7, 2, { impact: 8, priorityTier: 'HIGH' }),
    quest('History: read two sources', 120, 5, 5),
    quest('CAS reflection write-up', 45, 3, 7, { impact: 4 }),
    quest('Email the CAS coordinator', 15, 2, 1, { tediousness: 0.8, category: 'admin' }),
    quest('Uni personal statement', 300, 7, 20, { impact: 9 }),
    quest('Clear the downloads folder', 30, 1, null, { tediousness: 0.9, category: 'admin', impact: 2 }),
  ];

  return [
    {
      id: 'week',
      title: 'Normal school week, student hours 15:30–21:30, school on the calendar',
      quests: normal,
      cfg: studentHours,
      now: MONDAY,
      calendar: schoolWeek(MONDAY),
      expect: (r) => {
        const out: string[] = [];
        const maths = r.minutesByTaskBefore('Maths test revision', local(2026, 9, 30, 23, 59));
        if (maths < 180) out.push(`Maths test (due Wed) only got ${maths}/180 min before the test`);
        const email = r.minutesByTaskBefore('Email the CAS coordinator', local(2026, 9, 29, 23, 59));
        if (email < 15) out.push('The 15-min email due tomorrow was not planned before its deadline');
        return out;
      },
    },
    {
      id: 'default-hours',
      title: 'Same week on the DEFAULT 9–18 working hours (what a new user gets)',
      quests: normal.map((q) => ({ ...q })),
      cfg: cfgWith(),
      now: MONDAY,
      calendar: schoolWeek(MONDAY),
    },
    {
      id: 'crunch',
      title: 'Crunch: 16h of work due within 48h, plus the normal load',
      quests: [
        quest('Chem IA: final write-up', 420, 9, 1, { impact: 10, priorityTier: 'HIGH' }),
        quest('Physics lab report', 300, 8, 2, { impact: 8 }),
        quest('Spanish oral prep', 240, 6, 2, { impact: 7 }),
        quest('Reply to group chat about CAS project', 10, 1, 1, { category: 'admin' }),
        quest('History reading', 120, 5, 6),
      ],
      cfg: studentHours,
      now: MONDAY,
      calendar: schoolWeek(MONDAY),
      expect: (r) => (r.feasibility.length === 0 ? ['16h in 48h with ~6h/day free should be flagged infeasible, and was not'] : []),
    },
    {
      id: 'one-giant',
      title: 'One giant task: 12h extended essay due in 3 days, nothing else',
      quests: [quest('Extended essay: full draft', 720, 9, null, { impact: 10, deadline: new Date(local(2026, 10, 6, 23, 59)) })],
      cfg: cfgWith({ workingHours: { startHour: 9, endHour: 21 } }),
      now: local(2026, 10, 3, 8, 0), // a Saturday: no school
      calendar: [],
    },
    {
      id: 'deadline-morning',
      title: 'Due tomorrow at 10:00 — must be done tonight, not tomorrow morning',
      quests: [
        quest('Submit TOK essay outline', 90, 7, null, { impact: 9, deadline: new Date(local(2026, 9, 29, 10, 0)) }),
        quest('Biology reading', 120, 5, 6),
      ],
      cfg: studentHours,
      now: MONDAY,
      calendar: schoolWeek(MONDAY),
      expect: (r) => {
        const got = r.minutesByTaskBefore('Submit TOK essay outline', local(2026, 9, 29, 10, 0));
        return got < 90 ? [`TOK outline (due Tue 10:00) only got ${got}/90 min before its deadline`] : [];
      },
    },
    {
      id: 'routine',
      title: 'Normal week plus three dailies (meds, Duolingo, evening walk) on a free Saturday',
      quests: [
        quest('Extended essay: draft section 2', 240, 8, null, { impact: 9, deadline: new Date(local(2026, 10, 6, 23, 59)) }),
        quest('History: read two sources', 120, 5, null, { deadline: new Date(local(2026, 10, 5, 23, 59)) }),
        quest('Email the CAS coordinator', 15, 2, null, { category: 'admin', deadline: new Date(local(2026, 10, 4, 23, 59)) }),
      ],
      cfg: cfgWith({ workingHours: { startHour: 9, endHour: 21 } }),
      now: local(2026, 10, 3, 8, 0),
      calendar: [],
      dailies: [
        { id: 'meds', name: 'Morning meds', durationMin: 10, preferredHour: null, enabled: true },
        { id: 'duo', name: 'Duolingo', durationMin: 15, preferredHour: null, enabled: true },
        { id: 'walk', name: 'Evening walk', durationMin: 30, preferredHour: null, enabled: true },
      ],
      expect: (r) => {
        const out: string[] = [];
        const hourOf = (note: string) => r.schedule.filter((b) => b.note === note).map((b) => localHour(b.start));
        if (hourOf('Daily: Morning meds').some((h) => h > 10)) out.push('Morning meds placed after 10:00');
        if (hourOf('Daily: Evening walk').some((h) => h < 18)) out.push('Evening walk placed before 18:00');
        return out;
      },
    },
    {
      id: 'many-small',
      title: 'A pile of 14 small admin tasks — does it batch them or scatter them?',
      quests: Array.from({ length: 14 }, (_, i) =>
        quest(`Admin chore ${i + 1}`, 10 + (i % 3) * 5, 2, 3 + (i % 4), { category: 'admin', tediousness: 0.7 }),
      ),
      cfg: studentHours,
      now: MONDAY,
      calendar: schoolWeek(MONDAY),
    },
  ];
}

// ─── Grading ──────────────────────────────────────────────────────────────────

interface Report {
  id: string;
  ms: number;
  schedule: Block[];
  tasks: Task[];
  feasibility: Array<{ taskId: string; shortfallMin: number }>;
  findings: string[];
  stats: Record<string, string | number>;
  minutesByTaskBefore: (title: string, before: number) => number;
}

const isWork = (b: Block) => b.type === 'work' && !!b.taskId;
const mins = (b: Block) => Math.round((b.end - b.start) / MIN);
const overlaps = (a: Block, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

function grade(s: Scenario, schedule: Block[], tasks: Task[], feasibility: Report['feasibility'], ms: number, fixed: Block[]): Report {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const work = schedule.filter(isWork).sort((a, b) => a.start - b.start);
  const findings: string[] = [];

  // 1. Hard invariants.
  for (const b of work) {
    const t = byId.get(b.taskId!)!;
    if (b.end > t.deadline + 1000) findings.push(`INVARIANT: "${t.name}" scheduled past its deadline (${weekday(b.start)} ${fmt(b.start)})`);
    for (const f of fixed) if (overlaps(b, f)) findings.push(`INVARIANT: "${t.name}" overlaps calendar "${f.note}" at ${weekday(b.start)} ${fmt(b.start)}`);
    const h = localHour(b.start);
    const eh = localHour(b.end) || 24;
    if (h < s.cfg.workingHours.startHour - 0.01 || eh > s.cfg.workingHours.endHour + 0.01)
      findings.push(`Outside working hours: "${t.name}" ${weekday(b.start)} ${fmt(b.start)}–${fmt(b.end)}`);
  }
  const placed = new Map<string, number>();
  for (const b of work) placed.set(b.taskId!, (placed.get(b.taskId!) ?? 0) + mins(b));
  const horizonEnd = s.now + s.cfg.horizonDays * DAY;
  for (const t of tasks) {
    const got = placed.get(t.id) ?? 0;
    const flagged = feasibility.find((f) => f.taskId === t.id);
    if (t.deadline <= horizonEnd) {
      if (got < t.remainingMin - 1 && !flagged)
        findings.push(`SILENT SLIP: "${t.name}" got ${got}/${t.remainingMin} min and is NOT in the feasibility report`);
    } else {
      // Due after the plan: it should be on pace, i.e. roughly its share of
      // the days that are in the plan. Under 70% of that share is falling behind.
      const share = (t.remainingMin * s.cfg.horizonDays) / Math.max(s.cfg.horizonDays, (t.deadline - s.now) / DAY);
      if (got < share * 0.7)
        findings.push(`BEHIND PACE: "${t.name}" (due after the plan) got ${got} min this week; on pace would be ~${Math.round(share)}`);
    }
  }

  // 2. Sitting length: May rule was no session under 20 min or over 3 h.
  const tiny = work.filter((b) => mins(b) < 20 && byId.get(b.taskId!)!.remainingMin >= 20);
  if (tiny.length) findings.push(`${tiny.length} work block(s) under 20 min on tasks that aren't tiny (e.g. "${byId.get(tiny[0]!.taskId!)!.name}" ${mins(tiny[0]!)}m)`);
  const huge = work.filter((b) => mins(b) > 180);
  if (huge.length) findings.push(`${huge.length} block(s) over 3 h (longest ${Math.max(...huge.map(mins))} min)`);

  // 3. Same task continuously: merge back-to-back blocks of one task (gap < 20 min).
  let longestRun = 0;
  let runName = '';
  for (let i = 0; i < work.length; ) {
    let j = i;
    let end = work[i]!.end;
    let total = mins(work[i]!);
    while (j + 1 < work.length && work[j + 1]!.taskId === work[i]!.taskId && work[j + 1]!.start - end < 20 * MIN) {
      j++;
      total += mins(work[j]!);
      end = work[j]!.end;
    }
    if (total > longestRun) {
      longestRun = total;
      runName = byId.get(work[i]!.taskId!)!.name;
    }
    i = j + 1;
  }
  if (longestRun > 150) findings.push(`Same quest for ${longestRun} min nearly straight ("${runName}")`);

  // 4. Brain-killers back to back (both load ≥ 0.7, < 15 min apart).
  let killers = 0;
  for (let i = 1; i < work.length; i++) {
    const a = byId.get(work[i - 1]!.taskId!)!;
    const b = byId.get(work[i]!.taskId!)!;
    if (a.id !== b.id && a.cognitiveLoad >= 0.7 && b.cognitiveLoad >= 0.7 && work[i]!.start - work[i - 1]!.end < 5 * MIN) killers++;
  }
  if (killers) findings.push(`${killers} switch(es) straight from one high-load quest into another with no break`);

  // 5. No real break after long focus: > 100 min of work with every gap < 5 min.
  let streak = 0;
  let worstStreak = 0;
  for (let i = 0; i < work.length; i++) {
    const gap = i === 0 ? Infinity : work[i]!.start - work[i - 1]!.end;
    streak = gap < 5 * MIN ? streak + mins(work[i]!) : mins(work[i]!);
    worstStreak = Math.max(worstStreak, streak);
  }
  if (worstStreak > 100) findings.push(`${worstStreak} min of work with no break longer than 5 min`);

  // 6. Energy fit: hard work should sit at higher energy than easy work.
  const eAt = (b: Block) => s.cfg.energyCurve(localHour(b.start + (b.end - b.start) / 2));
  const hard = work.filter((b) => byId.get(b.taskId!)!.cognitiveLoad >= 0.7);
  const easy = work.filter((b) => byId.get(b.taskId!)!.cognitiveLoad <= 0.4);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const eHard = avg(hard.map(eAt));
  const eEasy = avg(easy.map(eAt));
  // Judge energy fit within each day that has both kinds of work: a chore
  // alone on a Saturday afternoon says nothing about ordering.
  const inverted = [...new Set(work.map((b) => dayKey(b.start)))].filter((d) => {
    const h = hard.filter((b) => dayKey(b.start) === d);
    const e = easy.filter((b) => dayKey(b.start) === d);
    return h.length && e.length && avg(h.map(eAt)) + 0.05 < avg(e.map(eAt));
  });
  if (inverted.length) findings.push(`Energy fit inverted on ${inverted.length} day(s): easy work got better hours than hard work (${inverted.join(', ')})`);
  const lateHard = hard.filter((b) => localHour(b.start) >= 20);
  if (lateHard.length) findings.push(`${lateHard.length} high-load block(s) starting at/after 20:00 (e.g. "${byId.get(lateHard[0]!.taskId!)!.name}" ${weekday(lateHard[0]!.start)} ${fmt(lateHard[0]!.start)})`);

  // 7. Momentum-first: does each day open with something startable?
  const days = [...new Set(work.map((b) => dayKey(b.start)))];
  const heavyOpeners = days.filter((d) => {
    const first = work.find((b) => dayKey(b.start) === d)!;
    const t = byId.get(first.taskId!)!;
    return t.cognitiveLoad >= 0.8 && mins(first) >= 60;
  });
  if (heavyOpeners.length) findings.push(`${heavyOpeners.length}/${days.length} day(s) open with a 60+ min block of a load-8+ quest (no warm-up)`);

  // 8. Front-loading: spread of the loose-deadline work.
  const perDay = days.map((d) => work.filter((b) => dayKey(b.start) === d).reduce((a, b) => a + mins(b), 0));

  // 9. Reasons: are the "why now" strings varied and informative?
  const reasons = work.map((b) => explainBlock(b.id, schedule, tasks));
  const distinct = new Set(reasons).size;
  const generic = reasons.filter((r) => /capacity is high|empty work block/i.test(r)).length;
  if (work.length >= 6 && distinct <= 2) findings.push(`Only ${distinct} distinct "why now" reasons across ${work.length} blocks`);

  const minutesByTaskBefore = (title: string, before: number) => {
    const t = tasks.find((x) => x.name === title);
    if (!t) return 0;
    return work.filter((b) => b.taskId === t.id && b.end <= before).reduce((a, b) => a + mins(b), 0);
  };

  const report: Report = {
    id: s.id,
    ms,
    schedule,
    tasks,
    feasibility,
    findings,
    minutesByTaskBefore,
    stats: {
      blocks: work.length,
      'placed min': [...placed.values()].reduce((a, b) => a + b, 0),
      'needed min': tasks.reduce((a, t) => a + t.remainingMin, 0),
      'min/day': perDay.join(' '),
      'longest same-quest run': longestRun,
      'block min–max': work.length ? `${Math.min(...work.map(mins))}–${Math.max(...work.map(mins))}` : '-',
      'energy hard/easy': `${isNaN(eHard) ? '-' : eHard.toFixed(2)} / ${isNaN(eEasy) ? '-' : eEasy.toFixed(2)}`,
      'reasons distinct': `${distinct}/${work.length}${generic ? ` (${generic} generic)` : ''}`,
      'shortfall flagged': feasibility.map((f) => `${byId.get(f.taskId)?.name ?? f.taskId} −${f.shortfallMin}`).join('; ') || 'none',
    },
  };
  if (s.expect) findings.push(...s.expect(report).map((f) => `EXPECT: ${f}`));
  return report;
}

function timeline(r: Report, day: string): string {
  const byId = new Map(r.tasks.map((t) => [t.id, t]));
  return r.schedule
    .filter((b) => dayKey(b.start) === day && b.type !== 'buffer')
    .sort((a, b) => a.start - b.start)
    .map((b) => {
      const t = b.taskId ? byId.get(b.taskId) : null;
      const label = t ? `${t.name} [load ${Math.round(t.cognitiveLoad * 10)}]` : b.type === 'fixed' ? b.note ?? 'fixed' : b.type;
      const why = t ? `  — ${explainBlock(b.id, r.schedule, r.tasks)}` : '';
      return `   ${fmt(b.start)}–${fmt(b.end)} ${String(mins(b)).padStart(3)}m  ${label}${why}`;
    })
    .join('\n');
}

// ─── Live replan checks ───────────────────────────────────────────────────────

function liveChecks(): string[] {
  const out: string[] = [];
  const sc = scenarios().find((s) => s.id === 'week')!;
  const fixed = eventsToFixedBlocks(sc.calendar, sc.now);
  const tasks = questsToTasks(sc.quests, {}, sc.now);
  const first = generateSchedule(tasks, fixed, sc.cfg, sc.now).schedule;

  // Determinism.
  const again = generateSchedule(tasks, fixed, sc.cfg, sc.now).schedule;
  if (JSON.stringify(first.map((b) => [b.start, b.end, b.taskId])) !== JSON.stringify(again.map((b) => [b.start, b.end, b.taskId])))
    out.push('Determinism: same input produced a different plan');

  // Finish the first work block 30 min early → does the rest of today pull forward?
  const w = first.filter(isWork).sort((a, b) => a.start - b.start);
  const b0 = w[0]!;
  const doneAt = b0.end - 30 * MIN;
  const t0 = tasks.find((t) => t.id === b0.taskId)!;
  const afterDone = tasks.map((t) => (t.id === t0.id ? { ...t, remainingMin: Math.max(0, t.remainingMin - (mins(b0) - 30) - 30) } : t));
  const re = replan(first, afterDone, sc.cfg, doneAt).schedule;
  const nextBefore = w.find((b) => b.start >= b0.end);
  const nextAfter = re.filter(isWork).sort((a, b) => a.start - b.start).find((b) => b.start >= doneAt);
  if (nextBefore && nextAfter) {
    const gain = Math.round((nextBefore.start - nextAfter.start) / MIN);
    out.push(`Finished "${t0.name}" 30 min early → next block now starts ${gain >= 0 ? `${gain} min sooner` : `${-gain} min LATER`} (${fmt(nextBefore.start)} → ${fmt(nextAfter.start)})`);
  }

  // Minimal perturbation: replan with nothing changed moves nothing.
  const same = replan(first, tasks, sc.cfg, sc.now).schedule.filter(isWork);
  const moved = same.filter((b) => !w.some((o) => o.taskId === b.taskId && o.start === b.start && o.end === b.end)).length;
  out.push(`Replan with no changes moved ${moved}/${same.length} work blocks${moved ? '  ← should be 0' : ''}`);

  // "Not Today" on the maths revision: it must leave today and still be done by its test.
  const deferred = sc.quests.map((q) => (q.title === 'Maths test revision' ? { ...q, status: 'NOT_TODAY' as const } : q));
  const dTasks = questsToTasks(deferred, {}, sc.now, TZ);
  const dPlan = generateSchedule(dTasks, fixed, sc.cfg, sc.now).schedule.filter(isWork);
  const mathsId = dTasks.find((t) => t.name === 'Maths test revision')!.id;
  const mBlocks = dPlan.filter((b) => b.taskId === mathsId);
  const today = dayKey(sc.now);
  const onToday = mBlocks.filter((b) => dayKey(b.start) === today).length;
  const beforeTest = mBlocks.filter((b) => b.end <= local(2026, 9, 30, 23, 59)).reduce((a, b) => a + mins(b), 0);
  out.push(`Not Today on "Maths test revision": ${onToday} block(s) today${onToday ? '  ← should be 0' : ''}, ${beforeTest}/180 min still planned before the test`);
  return out;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const only = process.argv[2];
let total = 0;
for (const s of scenarios()) {
  if (only && s.id !== only) continue;
  const cal = eventsToFixedBlocks(s.calendar, s.now);
  const fillers = placeDailyFillers({
    fillers: s.dailies ?? [],
    now: s.now,
    horizonDays: s.cfg.horizonDays,
    workingHours: s.cfg.workingHours,
    existingFixed: cal,
    tzOffsetMin: s.cfg.tzOffsetMin,
  });
  const fixed = [...cal, ...fillers];
  const tasks = questsToTasks(s.quests, {}, s.now, TZ);
  const t0 = performance.now();
  const { schedule, feasibilityReport } = generateSchedule(tasks, fixed, s.cfg, s.now);
  const ms = performance.now() - t0;
  const r = grade(s, schedule, tasks, feasibilityReport.issues, ms, fixed);
  total += r.findings.length;

  console.log(`\n━━ ${s.id}: ${s.title}`);
  console.log(`   ${ms.toFixed(1)} ms · ` + Object.entries(r.stats).map(([k, v]) => `${k}: ${v}`).join(' · '));
  for (const f of r.findings) console.log(`   ✗ ${f}`);
  if (!r.findings.length) console.log('   ✓ no findings');
  const firstDay = [...new Set(schedule.filter(isWork).map((b) => dayKey(b.start)))].sort()[0];
  if (firstDay) console.log(`   ${weekday(Date.parse(firstDay + 'T12:00:00Z'))} ${firstDay}:\n${timeline(r, firstDay)}`);
}

if (!only || only === 'live') {
  console.log('\n━━ live: replanning behaviour on the normal week');
  for (const l of liveChecks()) console.log(`   • ${l}`);
}
console.log(`\n${total} finding(s).`);
