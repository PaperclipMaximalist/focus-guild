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

import { buildDayInfo, todayCap, triage } from './budget.js';
import { plan } from './planner.js';
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
  const inHours = (b: Block) => windows.some((d) => b.start >= d.workStart && b.end <= d.workEnd);

  // ── Which unlocked blocks stay ──
  // In time order, so when a quest holds more than it needs the latest
  // blocks are the ones to go. Pinned blocks count first: they never move.
  const need = new Map<string, number>(tasks.map((t) => [t.id, t.remainingMin]));
  for (const b of userLockedFuture) {
    if (isWork(b) && need.has(b.taskId!)) need.set(b.taskId!, need.get(b.taskId!)! - pinCounts(b));
  }
  const stableFuture: Block[] = [];
  for (const raw of [...candidates].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const t = taskMap.get(raw.taskId!);
    if (!t || t.status === 'done' || !depsMet(t, taskMap)) continue;
    let b = raw;
    // Began before now: nobody can start it at its start any more.
    if (b.start < now) {
      if (b.end - now < STRADDLE_KEEP_MIN * MS_PER_MIN) continue;
      b = { ...b, start: now };
    }
    if (b.end > t.deadline) continue;
    // "Not Today" hit after the plan was made: today's blocks of it go.
    if (t.notBefore !== undefined && b.start < t.notBefore) continue;
    if (!inHours(b)) continue;
    // A fixed block can arrive after the plan was made (a meeting synced
    // from a calendar), and the user can drag a block onto another.
    if (overlaps(b, fixedFuture) || overlaps(b, userLockedFuture) || overlaps(b, stableFuture)) continue;
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
  const plannedToday = currentSchedule.some((b) => isWork(b) && isToday(b));
  const added = new Set(options.addTaskIds ?? []);
  const urgentBy = now + URGENT_WITHIN_DAYS * MS_PER_DAY;
  /** May wait for another day: not due soon, and not the quest just added. */
  const canWait = (t: Task) => t.deadline > urgentBy && !added.has(t.id);

  const run = (stable: Block[], necessary: ReadonlySet<string>) => {
    // Subtract minutes already committed by stable + user-locked work blocks
    // from each task's remainingMin so the planner doesn't double-book.
    const consumed = new Map<string, number>();
    for (const b of stable) consumed.set(b.taskId!, (consumed.get(b.taskId!) ?? 0) + ahead(b));
    for (const b of userLockedFuture) {
      if (isWork(b)) consumed.set(b.taskId!, (consumed.get(b.taskId!) ?? 0) + pinCounts(b));
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
      lockedBlocks: [...userLockedFuture, ...stable],
      config: { ...config, todayCapMin: capLeft },
      now,
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
  const settle = (stable: Block[]) => {
    const first = run(stable, new Set());
    if (!first.pinched) return first.result;
    const necessary = new Set(first.result.feasibilityReport.issues.map((i) => i.taskId));
    const second = run(stable, necessary).result;
    const short = (r: SchedulerResult) => r.feasibilityReport.issues.reduce((m, i) => m + i.shortfallMin, 0);
    return short(second) < short(first.result) ? second : first.result;
  };

  let result = settle(kept);

  // Deadline safety outranks stability. After a skipped block, the work due
  // tomorrow could only use the gaps, while this week's other quests kept
  // their slots, and the population lab watched it miss by 30 minutes with
  // an hour of next week's essay sitting before its deadline. Short quests
  // that can still make it (triage) may take stable blocks of work due later.
  if (result.feasibilityReport.issues.length) {
    const live = tasks.filter((t) => t.status !== 'done' && t.remainingMin > 0.5 && t.deadline > now);
    const dropped = triage(live, days, capForUnpinned, config.breakPolicy);
    const shortOf = (r: SchedulerResult) =>
      r.feasibilityReport.issues.filter((i) => !dropped.has(i.taskId)).reduce((m, i) => m + i.shortfallMin, 0);

    for (let round = 0; round < 3; round += 1) {
      const release = new Set<string>();
      for (const issue of result.feasibilityReport.issues) {
        const t = taskMap.get(issue.taskId);
        if (!t || dropped.has(t.id)) continue;
        let short = issue.shortfallMin;
        const from = Math.max(now, t.notBefore ?? 0);
        const movable = kept
          .filter((b) => !release.has(b.id) && b.taskId !== t.id && b.start >= from && b.end <= t.deadline)
          .map((b) => ({ b, owner: taskMap.get(b.taskId!)! }))
          .filter((x) => x.owner && x.owner.deadline > t.deadline)
          .sort((x, y) => y.owner.deadline - x.owner.deadline || x.b.start - y.b.start);
        for (const { b } of movable) {
          if (short <= 0) break;
          release.add(b.id);
          short -= (b.end - b.start) / MS_PER_MIN;
        }
      }
      if (!release.size) break;
      const nextKept = kept.filter((b) => !release.has(b.id));
      const next = settle(nextKept);
      if (shortOf(next) >= shortOf(result)) break;
      kept = nextKept;
      result = next;
    }
  }

  // Strip our temporary `locked=true` off the stable blocks so they look the
  // same to the client as they did before reflow. User-locked blocks keep
  // their locked flag (they were genuinely pinned).
  const stableIds = new Set(kept.map((b) => b.id));
  const restored: Block[] = result.schedule.map((b) =>
    stableIds.has(b.id) ? { ...b, locked: false } : b,
  );

  // Stitch past at the front.
  const merged = [...past, ...restored].sort((a, b) => a.start - b.start);
  return { schedule: merged, feasibilityReport: result.feasibilityReport };
}
