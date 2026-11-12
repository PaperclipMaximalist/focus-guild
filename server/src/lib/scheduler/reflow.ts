/**
 * Minimal-perturbation reflow for `/edit` and `/insert` paths.
 *
 * The old replan() called plan() to rebuild the entire future from scratch
 * on every edit. That's overkill and disruptive — a one-quest add or a
 * single block move should NOT shuffle the rest of the user's day.
 *
 * reflow() instead:
 *   1. Preserves past blocks and immovable (fixed + locked) future blocks
 *      verbatim. They can't move and shouldn't.
 *   2. Keeps every still-valid future unlocked work block exactly where
 *      it is. "Still valid" = its task still exists, hasn't completed and
 *      still needs the minutes, the block ends before the task's deadline,
 *      lies inside working hours and after "Not Today", sits on nothing
 *      fixed or pinned, and the task's dependencies are still met. Treats
 *      those as additional locked blocks so plan() routes around them.
 *   3. Computes leftover task work (each task's remainingMin minus what's
 *      already in stable blocks) and runs plan() ONLY against the gaps
 *      and the leftover work. The constructor naturally fills the empty
 *      time without touching what's stable.
 *   4. Strips the "temporarily locked" flag back off stable blocks in the
 *      output, so the user can still drag/pin/unpin them normally.
 *
 * This preserves the spec invariants AND the implicit "tap a quest, only
 * the new block appears; nothing else moves" UX expectation.
 *
 * A replan runs many times a day (first open, every finished or stopped
 * focus session, every edit), so the plan it starts from is rarely the
 * tidy one generate made. What it does about that:
 *
 *   - A block that began before `now` keeps only the part still ahead
 *     (see STRADDLE_KEEP_MIN).
 *   - A quest never holds more minutes ahead than it has left: the latest
 *     surplus goes (see OVERCOMMIT_SLACK_MIN).
 *   - Today's total stays within the check-in's minutes, counting what
 *     today already holds, not only what this replan adds.
 *   - Today doesn't grow: work that isn't due soon is only added to today
 *     in place of work today already held (see URGENT_WITHIN_DAYS).
 */

import { buildDayInfo, dueWithinPlan, todayCap, todayEndInForce, triage } from './budget.js';
import { restPolicy } from './config.js';
import { packDays } from './pack.js';
import { plan, suggestForShortfall } from './planner.js';
import { workDayEndUtc, workDayStartUtc } from './tz.js';
import type { Block, ReplanOptions, Schedule, SchedulerResult, Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;

/**
 * A block that began before `now` is kept from `now` on when at least this
 * much of it is still ahead; less than that isn't a sitting and is replanned.
 * The whole block used to stay: finish the last quest 20 minutes late and
 * the next block still read 14:00–14:50 and counted for 50 minutes, so its
 * quest was planned 20 minutes short and nothing said so.
 */
const STRADDLE_KEEP_MIN = 15;

/**
 * A quest holding this many minutes more than it has left gives up the
 * surplus. Below it nothing moves: estimates are recalibrated after every
 * finished quest, and shaving two minutes off a block each time is noise.
 */
const OVERCOMMIT_SLACK_MIN = 5;

/**
 * Work due within this many days may always be added to today. Anything
 * later only replaces work today already held: finishing today's last block
 * used to be answered with a fresh block of next week's essay, every time,
 * and the morning after a bad day opened with yesterday's skipped work
 * stacked on top of today's.
 */
const URGENT_WITHIN_DAYS = 2;

/** Refilling today with less than this isn't worth a block. */
const REFILL_MIN = 10;

/** One sitting's worth, for weighing which later day waiting work goes to. */
const SPREAD_SITTING_MIN = 60;

function depsMet(task: Task, taskMap: Map<string, Task>): boolean {
  for (const id of task.dependencies) {
    const dep = taskMap.get(id);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

const overlaps = (a: Block, others: Block[]) => others.some((o) => a.start < o.end && o.start < a.end);
const isWork = (b: Block) => b.type === 'work' && !!b.taskId;

export function reflow(
  currentSchedule: Schedule,
  tasks: Task[],
  config: UserConfig,
  clock: number,
  options: ReplanOptions = {},
): SchedulerResult {
  // Plans are made in whole minutes. The clock comes with seconds: a block in
  // progress was cut at 23:44:30 and read "23:44–00:44, 59.5 min".
  const now = Math.ceil(clock / MS_PER_MIN) * MS_PER_MIN;
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const tz = config.tzOffsetMin ?? 0;
  /** Minutes of a block that are still ahead. */
  const ahead = (b: Block) => (b.end - Math.max(b.start, now)) / MS_PER_MIN;

  // The user's own day (a night, for hours that run past midnight).
  const dayStart = workDayStartUtc(now, tz, config.workingHours);
  const dayEnd = workDayEndUtc(now, tz, config.workingHours);
  const isToday = (b: Block) => b.start >= dayStart && b.start < dayEnd;
  const workToday = (blocks: Block[]) =>
    blocks.reduce((m, b) => (isWork(b) && isToday(b) ? m + (b.end - b.start) / MS_PER_MIN : m), 0);

  const past: Block[] = [];
  const fixedFuture: Block[] = [];
  const userLockedFuture: Block[] = [];
  const candidates: Block[] = [];

  for (const b of currentSchedule) {
    // A block without a time can't be shown, stored or planned around.
    if (!Number.isFinite(b.start) || !Number.isFinite(b.end)) continue;
    if (b.end <= now) past.push(b);
    else if (b.type === 'fixed') fixedFuture.push(b);
    // A break under way is not rerouted over: it stays, like a fixed block.
    else if (b.type === 'break' && b.start <= now) fixedFuture.push(b);
    else if (b.locked) {
      // A pin holds time for a quest. Once the quest is finished or deleted
      // there is nothing to hold it for: pin tomorrow's block, finish the
      // quest today, and tomorrow kept an hour for work that no longer exists.
      const t = isWork(b) ? taskMap.get(b.taskId!) : undefined;
      if (isWork(b) && (!t || t.status === 'done')) continue;
      userLockedFuture.push(b);
    } else if (isWork(b)) candidates.push(b);
    // anything else unlocked (old break/buffer blocks) is dropped
  }

  /**
   * Minutes of a pinned block that count toward its quest: the part still
   * ahead and before the deadline. A swap can leave a pin on the day after
   * its quest is due; counting it as done meant no work was planned before
   * the deadline and no shortfall was reported.
   */
  const pinCounts = (b: Block) => {
    const due = taskMap.get(b.taskId!)?.deadline ?? Infinity;
    return Math.max(0, (Math.min(b.end, due) - Math.max(b.start, now)) / MS_PER_MIN);
  };

  // The working windows ahead. The user may have changed their hours since
  // the plan was made; unpinned work outside them is no longer stable.
  const windows = buildDayInfo(config, now, []);
  // With packing a block only has to start inside a window: where it ends is
  // decided again when the plan is laid out (a block dragged to the end of a
  // short day is cut there, or goes first in the next stretch).
  const laidOutAgain = config.gapMin !== undefined || !!config.fillDays;
  const inHours = (b: Block) =>
    windows.some((d) => b.start >= d.workStart && (laidOutAgain ? b.start < d.workEnd : b.end <= d.workEnd));

  // ── Which unlocked blocks stay ──
  // In time order, so when a quest holds more than it needs the latest
  // blocks are the ones to go. Pinned blocks count first: they never move.
  const need = new Map<string, number>(tasks.map((t) => [t.id, t.remainingMin]));
  for (const b of userLockedFuture) {
    if (isWork(b) && need.has(b.taskId!)) need.set(b.taskId!, need.get(b.taskId!)! - pinCounts(b));
  }
  /** Is the plan laid out again in order at the end (pack.ts)? */
  const packs = config.gapMin !== undefined || !!config.fillDays;
  const stableFuture: Block[] = [];
  for (const raw of [...candidates].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const t = taskMap.get(raw.taskId!);
    if (!t || t.status === 'done' || !depsMet(t, taskMap)) continue;
    let b = raw;
    // Began before now: nobody can start it at its start any more.
    if (b.start < now) {
      // ... unless what is ahead of it is all its quest has left: then it is
      // the end of that sitting, not a scrap. A 10-minute email under way was
      // dropped a minute in, the next block slid up over it, and the email
      // went to the back of the evening.
      const rest = (b.end - now) / MS_PER_MIN;
      if (rest < STRADDLE_KEEP_MIN && !(rest >= 1 && (need.get(t.id) ?? 0) <= rest + 0.5)) continue;
      b = { ...b, start: now };
    }
    if (b.end > t.deadline) continue;
    // "Not Today" hit after the plan was made: today's blocks of it go.
    if (t.notBefore !== undefined && b.start < t.notBefore) continue;
    if (!inHours(b)) continue;
    // A fixed block can arrive after the plan was made (a meeting synced
    // from a calendar), and the user can drag a block onto another.
    // Without packing, a block that now overlaps something has lost its
    // place. With it, the whole plan is laid out again in order at the end,
    // so the block keeps its turn (this is what a drag to reorder relies on).
    if (!packs && (overlaps(b, fixedFuture) || overlaps(b, userLockedFuture) || overlaps(b, stableFuture))) continue;
    const left = need.get(t.id) ?? 0;
    if (left < 1) continue;
    const len = (b.end - b.start) / MS_PER_MIN;
    if (len > left + OVERCOMMIT_SLACK_MIN) b = { ...b, end: b.start + Math.round(left) * MS_PER_MIN };
    need.set(t.id, left - (b.end - b.start) / MS_PER_MIN);
    stableFuture.push(b);
  }

  // ── The check-in's minutes, across the whole of today ──
  // The cap used to bound only the work a replan added, on every replan: do
  // two hours of a two-hour day, finish a session, and two more appeared.
  const immovable = [...fixedFuture, ...userLockedFuture];
  const days = buildDayInfo(config, now, immovable);
  const capTotal = todayCap(days, now, config);
  /** What the cap has left once done-or-passed and pinned work is counted. */
  const capForUnpinned = capTotal === undefined ? undefined : Math.max(0, capTotal - workToday(past) - workToday(userLockedFuture));
  let kept = stableFuture;

  // Quest work behind now with no long pause in it: the first long break is
  // measured from there, not from now. A break under way starts the count afresh.
  const breakLen = (config.breakMin ?? 0) * MS_PER_MIN;
  let runBefore = 0;
  if (breakLen > 0 && !fixedFuture.some((b) => b.type === 'break')) {
    let cursor = now;
    // The sitting under way counts for the part already behind now.
    const begun = currentSchedule.filter((b) => isWork(b) && Number.isFinite(b.start) && b.start < now).sort((x, y) => y.start - x.start);
    for (const b of begun) {
      const end = Math.min(b.end, now);
      if (cursor - end >= breakLen) break;
      runBefore += Math.max(0, end - b.start) / MS_PER_MIN;
      cursor = Math.min(cursor, b.start);
    }
  }
  if (capForUnpinned !== undefined) {
    // The check-in came after the plan, or was lowered: today's blocks give
    // way from the least pressing end, work due soonest stays.
    let room = capForUnpinned;
    const stay = new Set<string>();
    const todays = kept.filter(isToday).sort((a, b) => taskMap.get(a.taskId!)!.deadline - taskMap.get(b.taskId!)!.deadline || a.start - b.start);
    for (const b of todays) {
      const len = (b.end - b.start) / MS_PER_MIN;
      if (len > room + 0.5) continue;
      room -= len;
      stay.add(b.id);
    }
    kept = kept.filter((b) => !isToday(b) || stay.has(b.id));
  }

  // ── Today doesn't grow ──
  // What today held ahead of now when the replan began, pinned or not.
  const heldToday = [...candidates, ...userLockedFuture].reduce((m, b) => (isWork(b) && isToday(b) ? m + ahead(b) : m), 0);
  const plannedToday = !config.fillDays && currentSchedule.some((b) => isWork(b) && isToday(b));
  const added = new Set(options.addTaskIds ?? []);
  const urgentBy = now + URGENT_WITHIN_DAYS * MS_PER_DAY;
  /** May wait for another day: not due soon, and not the quest just added. */
  const canWait = (t: Task) => t.deadline > urgentBy && !added.has(t.id);

  const run = (stable: Block[], necessary: ReadonlySet<string>, breaks: Block[]) => {
    // Subtract minutes already committed by stable + user-locked work blocks
    // from each task's remainingMin so the planner doesn't double-book.
    const consumed = new Map<string, number>();
    for (const b of stable) consumed.set(b.taskId!, (consumed.get(b.taskId!) ?? 0) + ahead(b));
    for (const b of userLockedFuture) {
      if (isWork(b)) consumed.set(b.taskId!, (consumed.get(b.taskId!) ?? 0) + pinCounts(b));
    }
    // A quest done in one go with a sitting kept (under way, or pinned) is in
    // that sitting: none of it is planned again. Counting only the part ahead,
    // the minutes already behind now came back as a 5-minute block of their own.
    for (const b of [...stable, ...userLockedFuture]) {
      const t = isWork(b) ? taskMap.get(b.taskId!) : undefined;
      if (t?.oneGo) consumed.set(t.id, Math.max(consumed.get(t.id) ?? 0, t.remainingMin));
    }

    let capLeft = capForUnpinned === undefined ? undefined : Math.max(0, capForUnpinned - workToday(stable));
    // A day with a plan: later work may only take the place of minutes the
    // plan gave up today (a quest finished early), and only while the day
    // still has work ahead. With the last block done, today is done.
    let hold = false;
    let limited = false;
    if (plannedToday) {
      const keptToday = [...stable, ...userLockedFuture].filter((b) => isWork(b) && isToday(b));
      const refill = keptToday.length ? heldToday - keptToday.reduce((m, b) => m + ahead(b), 0) : 0;
      if (refill >= REFILL_MIN && necessary.size === 0) {
        limited = capLeft === undefined || refill < capLeft;
        capLeft = Math.min(capLeft ?? Infinity, Math.floor(refill));
      } else hold = true;
    }

    // Work that waits doesn't all wait for tomorrow. The budget hands a
    // sitting to the first day with room, so every block skipped on Monday
    // came back on Tuesday, on top of Tuesday's own: a quarter of simulated
    // people opened a morning 1.5x the size it was planned at. Each waiting
    // quest starts again on the lightest day it can use instead, keeping a
    // day in hand before its deadline.
    const from = new Map<string, number>();
    if (hold) {
      const later = buildDayInfo(config, now, [...immovable, ...stable]).filter((d) => d.workStart >= dayEnd);
      const load = later.map((d) =>
        [...stable, ...userLockedFuture].reduce(
          (m, b) => (isWork(b) && b.start >= d.workStart && b.start < d.workEnd ? m + (b.end - b.start) / MS_PER_MIN : m),
          0,
        ),
      );
      const free = later.map((d) => d.freeMinutes);
      const waiting = tasks
        .filter((t) => t.status !== 'done' && canWait(t) && !necessary.has(t.id) && t.remainingMin - (consumed.get(t.id) ?? 0) > 0.5)
        .sort((a, b) => a.deadline - b.deadline || (a.id < b.id ? -1 : 1));
      for (const t of waiting) {
        const want = Math.min(t.remainingMin - (consumed.get(t.id) ?? 0), SPREAD_SITTING_MIN);
        let best = -1;
        later.forEach((d, i) => {
          if (d.workStart >= t.deadline || (t.notBefore ?? 0) >= d.workEnd || free[i]! < want) return;
          if (best >= 0 && d.workEnd > t.deadline - MS_PER_DAY) return;
          if (best < 0 || load[i]! < load[best]!) best = i;
        });
        if (best < 0) continue;
        from.set(t.id, later[best]!.workStart);
        load[best]! += want;
        free[best]! -= want;
      }
    }

    const adjusted = tasks.map((t) => {
      const used = consumed.get(t.id) ?? 0;
      const waits = hold && canWait(t) && !necessary.has(t.id);
      if (used <= 0 && !waits) return t;
      return {
        ...t,
        ...(used > 0 ? { remainingMin: Math.max(0, t.remainingMin - used), committedMin: used } : {}),
        ...(waits ? { notBefore: Math.max(t.notBefore ?? 0, from.get(t.id) ?? dayEnd) } : {}),
      };
    });

    // Run the full planner over the remaining work. Treat stable blocks as
    // ADDITIONAL locked blocks: that's the trick — plan() routes around them
    // exactly as it routes around user-pinned blocks, so the constructor only
    // ever places into the freed gaps.
    const result = plan({
      tasks: adjusted,
      fixedBlocks: fixedFuture,
      lockedBlocks: [...userLockedFuture, ...stable, ...breaks],
      config: { ...config, todayCapMin: capLeft },
      runBefore,
      // The real clock: plan() rounds it the same way, and uses the seconds
      // only to tell which quests are still due.
      now: clock,
      // Past and dropped blocks keep their ids too; a new block takes none of them.
      reservedIds: currentSchedule.map((b) => b.id),
    });
    // Did keeping today as it was leave a quest short of its deadline?
    const pinched = result.feasibilityReport.issues.some((i) => limited || (hold && canWait(taskMap.get(i.taskId)!)));
    return { result, pinched };
  };

  /**
   * Plan around `stable`. Work that was told to wait for another day and
   * then can't make its deadline has become necessary today: plan again
   * with it (and today) released.
   */
  const settle = (stable: Block[], breaks: Block[] = keptBreaks) => {
    const first = run(stable, new Set(), breaks);
    if (!first.pinched) return first.result;
    const necessary = new Set(first.result.feasibilityReport.issues.map((i) => i.taskId));
    const second = run(stable, necessary, breaks).result;
    const short = (r: SchedulerResult) => r.feasibilityReport.issues.reduce((m, i) => m + i.shortfallMin, 0);
    return short(second) < short(first.result) ? second : first.result;
  };

  // ── Laid out before it is planned round ──
  // The blocks that stay are still where the old plan had them: a quest
  // finished early, or a block dragged elsewhere, leaves a hole in the middle
  // of the day, and the planner would fill that hole with some other quest.
  // With packing they first close up in the order they have, breaks and all,
  // so the only free time the planner sees is at the end of a stretch.
  let n = 0;
  const taken = new Set(currentSchedule.map((b) => b.id));
  const freshId = () => {
    let id = `blk-p${(n += 1)}`;
    while (taken.has(id)) id = `blk-p${(n += 1)}`;
    taken.add(id);
    return id;
  };
  /**
   * Lay `movable` out again, in order, in the free time `held` leaves (pack.ts). Breaks come back with it.
   * `pull`: may the slider's today take blocks from the days after it? Not
   * before the planner has seen the plan: see below.
   */
  const sliderToday = todayEndInForce(config, now);
  const layOut = (movable: Block[], held: Block[], pull = true): Block[] => {
    const daysOf = buildDayInfo(config, now, held);
    const groups = daysOf.map((d) => ({
      blocks: movable.filter((b) => b.start >= d.workStart && b.start < d.workEnd),
      totalScore: 0,
      unfulfilledByTaskId: new Map<string, number>(),
    }));
    const grouped = new Set(groups.flatMap((g) => g.blocks.map((b) => b.id)));
    const packed = packDays(daysOf, groups, taskMap, { ...config, todayCapMin: capTotal }, {
      capped: (d) => d === daysOf[0],
      // (With the slider in force today's window opens at now: buildDayInfo.)
      keepsOwn: (d) => !pull && sliderToday && d === daysOf[0] && d.workStart <= now,
      mint: (piece) => ({ ...piece, id: freshId() }),
      runBefore,
      now,
    });
    return [...movable.filter((b) => !grouped.has(b.id)), ...packed.flatMap((g) => g.blocks as Block[])];
  };
  // While the slider sets today, today's blocks close up within today only.
  // The time it gives is the member asking for that much today: the budget
  // shares it out, work due tonight first, and tomorrow's blocks only fill
  // what the planner leaves of it, in the final layout. Pulled in here, the
  // next day's first block took it before anything due tonight was weighed:
  // at 19:34, given 30 minutes, the member got a report due in two days and
  // the email due at 21:00 was reported as not fitting at all. (Without the
  // slider, a quest finished early still has the next block slide up into
  // the time it gave back, as before.)
  /** The breaks between the kept blocks: the planner must not see them as free time. */
  let keptBreaks: Block[] = [];
  if (packs) {
    const underWay = kept.filter((b) => b.start <= now);
    const laid = layOut(kept.filter((b) => b.start > now), [...fixedFuture, ...userLockedFuture, ...underWay], false);
    kept = [...underWay, ...laid.filter(isWork)];
    keptBreaks = laid.filter((b) => b.type === 'break');
  }

  // Strip our temporary `locked=true` off the stable blocks so they look the
  // same to the client as they did before reflow. User-locked blocks keep
  // their locked flag (they were genuinely pinned).
  // With packing, lay the whole plan out again: everything unpinned slides up
  // in the order it had, and the time that opens at the end of a day takes the
  // next day's work. The sitting under way stays where it is.
  const finish = (r: SchedulerResult, stable: Block[]): Block[] => {
    const stableIds = new Set(stable.map((b) => b.id));
    let out = r.schedule.map((b) => (stableIds.has(b.id) ? { ...b, locked: false } : b));
    if (!packs) return out;
    // The breaks go (the inner plan's own, and the ones laid out above): they
    // are placed again with everything else.
    const placeholders = new Set(keptBreaks.map((b) => b.id));
    out = out.filter((b) => !placeholders.has(b.id) && (b.type !== 'break' || b.locked || b.start <= now));
    const held = out.filter((b) => !isWork(b) || b.locked || b.start <= now);
    const heldIds = new Set(held.map((b) => b.id));
    for (const b of out) taken.add(b.id);
    return [...held, ...layOut(out.filter((b) => !heldIds.has(b.id)), held)];
  };

  /**
   * With packing, a plan is judged by what it holds once laid out. Laying it
   * out again can cut a piece at a deadline or leave one out, and the inner
   * plan's report then promised minutes the plan didn't have: one replan kept
   * a plan it thought short of nothing, the next one found it two hours short
   * and moved half the week again.
   */
  const recount = (r: SchedulerResult, laid: Block[]): SchedulerResult['feasibilityReport'] => {
    const minutes = (s: Block[]) => {
      const m = new Map<string, number>();
      for (const b of s) {
        const t = isWork(b) ? taskMap.get(b.taskId!) : undefined;
        if (!t) continue;
        const mins = (Math.min(b.end, t.deadline) - Math.max(b.start, now)) / MS_PER_MIN;
        if (mins > 0) m.set(t.id, (m.get(t.id) ?? 0) + mins);
      }
      return m;
    };
    const before = minutes(r.schedule);
    const after = minutes(laid);
    const short = new Map(r.feasibilityReport.issues.map((i) => [i.taskId, i.shortfallMin]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const lost = (before.get(id) ?? 0) - (after.get(id) ?? 0);
      const t = taskMap.get(id);
      if (Math.abs(lost) < 1 || !t || !dueWithinPlan(t, days)) continue;
      short.set(id, Math.max(0, Math.ceil((short.get(id) ?? 0) + lost)));
    }
    const issues = [...short]
      .filter(([, m]) => m > 0)
      .map(([taskId, m]) => r.feasibilityReport.issues.find((i) => i.taskId === taskId && i.shortfallMin === m) ?? { taskId, shortfallMin: m, suggestions: suggestForShortfall(m) });
    return { ok: issues.length === 0, issues };
  };
  /** A plan around `stable` (and the breaks laid out among it), and what it comes to laid out. */
  const option = (stable: Block[], breaks: Block[] = keptBreaks) => {
    const r = settle(stable, breaks);
    const laid = finish(r, stable);
    return { result: packs ? { schedule: r.schedule, feasibilityReport: recount(r, laid) } : r, laid };
  };
  let best = option(kept);
  let result = best.result;

  // Deadline safety outranks stability. After a skipped block, the work due
  // tomorrow could only use the gaps, while this week's other quests kept
  // their slots, and the population lab watched it miss by 30 minutes with
  // an hour of next week's essay sitting before its deadline. Short quests
  // that can still make it (triage) may take stable blocks of work due later.
  if (result.feasibilityReport.issues.length) {
    const live = tasks.filter((t) => t.status !== 'done' && t.remainingMin > 0.5 && t.deadline > now);
    const dropped = triage(live, days, capForUnpinned, restPolicy(config));
    const shortOf = (r: SchedulerResult) =>
      r.feasibilityReport.issues.filter((i) => !dropped.has(i.taskId)).reduce((m, i) => m + i.shortfallMin, 0);
    /**
     * Is `next` better for deadlines than `prev`? By total minutes short,
     * without packing. With it, the quest due first decides: a plan that
     * gets the work due in three hours done beats one that is a little less
     * short overall but leaves that quest with nothing (the minutes it moves
     * belong to work due days later, which still has those days).
     */
    const better = (next: SchedulerResult, prev: SchedulerResult) => {
      if (!packs) return shortOf(next) < shortOf(prev);
      const a = new Map(prev.feasibilityReport.issues.filter((i) => !dropped.has(i.taskId)).map((i) => [i.taskId, i.shortfallMin]));
      const b = new Map(next.feasibilityReport.issues.filter((i) => !dropped.has(i.taskId)).map((i) => [i.taskId, i.shortfallMin]));
      const ids = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => (taskMap.get(x)?.deadline ?? 0) - (taskMap.get(y)?.deadline ?? 0) || (x < y ? -1 : 1));
      for (const id of ids) {
        const d = (b.get(id) ?? 0) - (a.get(id) ?? 0);
        if (Math.abs(d) >= 1) return d < 0;
      }
      return false;
    };
    /**
     * Does `next` get a quest done by its deadline that `prev` left short,
     * with nothing due before it worse off? Planning from scratch throws away
     * the order the day had (the user's drags among it), so it has to be
     * worth that: a few minutes less short somewhere is not.
     */
    const rescues = (next: SchedulerResult, prev: SchedulerResult) => {
      const a = new Map(prev.feasibilityReport.issues.filter((i) => !dropped.has(i.taskId)).map((i) => [i.taskId, i.shortfallMin]));
      const b = new Map(next.feasibilityReport.issues.map((i) => [i.taskId, i.shortfallMin]));
      const due = (id: string) => taskMap.get(id)?.deadline ?? 0;
      return [...a.keys()].some(
        (id) => (b.get(id) ?? 0) < 1 && [...b.entries()].every(([other, m]) => due(other) > due(id) || m <= (a.get(other) ?? 0)),
      );
    };

    for (let round = 0; round < 3; round += 1) {
      const release = new Set<string>();
      for (const issue of result.feasibilityReport.issues) {
        const t = taskMap.get(issue.taskId);
        if (!t || dropped.has(t.id)) continue;
        // With packing the time freed has to hold the gaps and a break as well
        // as the work: a quest 120 minutes short got 120 minutes of holes, the
        // gaps ate a fifth of them, and the planner gave it nothing.
        let short = packs ? issue.shortfallMin * 1.25 + (config.breakMin ?? 0) + 2 * (config.gapMin ?? 0) : issue.shortfallMin;
        const from = Math.max(now, t.notBefore ?? 0);
        const movable = kept
          // (With packing, a block that runs over the deadline counts too: it holds time before it.)
          .filter((b) => !release.has(b.id) && b.taskId !== t.id && b.start >= from && (packs ? b.start < t.deadline : b.end <= t.deadline))
          .map((b) => ({ b, owner: taskMap.get(b.taskId!)!, day: days.findIndex((d) => b.start < d.workEnd) }))
          .filter((x) => x.owner && x.owner.deadline > t.deadline)
          // With packing, the days nearest the deadline give first: today is
          // the day the user is looking at, and has arranged. (Saturday's
          // quest took Monday morning's chores, the one just dragged first
          // among them, and Thursday's blocks stayed where they were.)
          .sort((x, y) => (packs ? y.day - x.day : 0) || y.owner.deadline - x.owner.deadline || x.b.start - y.b.start);
        for (const { b } of movable) {
          if (short <= 0) break;
          release.add(b.id);
          short -= (b.end - b.start) / MS_PER_MIN;
        }
      }
      if (!release.size) break;
      const nextKept = kept.filter((b) => !release.has(b.id));
      const next = option(nextKept);
      if (better(next.result, result)) {
        kept = nextKept;
        best = next;
        result = next.result;
        continue;
      }
      // Freeing only the blocks before the deadline can be too little: the
      // work they held still needs room later, and that room is held by the
      // blocks of work due later still. (A two-hour fix due at 20:00 arrived
      // at 16:50; the lab report due at midnight it pushed out had nowhere to
      // go, so the planner gave up the fix.) Then the days after today are
      // planned again from scratch, today kept as the user arranged it; and
      // if that doesn't do it either, today with them. From scratch depends
      // only on the quests and the clock, so the next replan comes back to
      // the same plan.
      if (!packs) break;
      const levels = [
        { stable: kept.filter((b) => b.start < dayEnd), breaks: keptBreaks.filter((b) => b.start < dayEnd) },
        // (A block due to start this minute hasn't begun: it moves too.)
        { stable: kept.filter((b) => b.start < now), breaks: [] },
      ];
      for (const level of levels) {
        if (level.stable.length === kept.length) continue;
        const whole = option(level.stable, level.breaks);
        if (!rescues(whole.result, result)) continue;
        kept = level.stable;
        best = whole;
        result = whole.result;
        break;
      }
      break;
    }
  }


  // Stitch past at the front.
  // With packing, the part of a sitting already behind now stays in the plan
  // as a block of its own. Cut away, it was gone from the next replan's view
  // of the day, and that replan measured the run to the next break without
  // it: the same plan, rerouted twice, put its break in two places.
  const elapsed: Block[] = [];
  if (packs) {
    for (const b of currentSchedule) {
      // (One ending within this minute is in `past` already, whole: cut again
      // here it was there twice, and once more on every replan after.)
      if (!isWork(b) || b.locked || !(b.start < clock && b.end > now) || clock - b.start < MS_PER_MIN) continue;
      elapsed.push({ ...b, id: `${b.id}@${Math.round(b.start / MS_PER_MIN)}`, end: clock });
    }
  }
  const merged = [...past, ...elapsed, ...best.laid].sort((a, b) => a.start - b.start);
  return { schedule: merged, feasibilityReport: result.feasibilityReport };
}
