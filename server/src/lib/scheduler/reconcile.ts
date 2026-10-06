/**
 * Reconcile: the constructor is the truth about what fits.
 *
 * The budget hands out minutes per day by arithmetic (free time less
 * breaks). The constructor then builds the real day, with whole sittings,
 * rests, starter pushes and the peak guard, and on a full day some of the
 * granted minutes don't fit. Which ones used to come down to beam scores:
 * the population lab found a portfolio due tomorrow losing 50 minutes while
 * an essay due in three weeks kept its hour, in over a third of simulated
 * people with a busy week.
 *
 * Two passes, only for quests due inside the plan that came up short:
 *
 *   1. Swap. On days before the deadline, minutes the constructor actually
 *      placed for work that may give way (`canDonate`) move to the short
 *      quest, and the day is rebuilt. The day's quotas are first settled at
 *      what was really placed, so the rebuilt day asks no more of itself
 *      than the one before. A rebuild that doesn't help is rolled back.
 *   2. Fill. Whatever is still short goes into gaps the day left over,
 *      keeping a break beside other work. A quest that can finish in the gap
 *      goes first; a partial sitting has to be a real one. Then work that
 *      gave time away in the swap gets it back where there's room, so an
 *      essay due in two weeks that lent Tuesday to tomorrow's lab report
 *      picks it up on Saturday instead of falling behind.
 *
 * Pure and deterministic, like the rest of the pipeline.
 */

import { canDonate, dueWithinPlan, MIN_SITTING_MIN, minSitting, type DayBudget } from './budget.js';
import { buildDay, workBefore, type ConstructedDay } from './constructor.js';
import type { PlacedRef } from './planner.js';
import { composeWhy } from './explain.js';
import type { Block, Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
const EPSILON_MIN = 0.5;
const MAX_ROUNDS = 4;
const SNAP_MS = 5 * MS_PER_MIN;
/** No block shorter than this for a quest that isn't small itself. */
const SHARD_MIN = 20;
/** A quest this long or longer is "not small": its pieces must be real sittings. */
const REAL_QUEST_MIN = 30;

type Placed = Omit<Block, 'id'>;

const minutesOf = (b: { start: number; end: number }) => (b.end - b.start) / MS_PER_MIN;

function placedFor(built: ConstructedDay[], taskId: string): number {
  let m = 0;
  for (const d of built) for (const b of d.blocks) if (b.taskId === taskId) m += minutesOf(b);
  return m;
}

function byNeed(dropped: ReadonlySet<string>) {
  return (a: { t: Task }, b: { t: Task }) =>
    Number(dropped.has(a.t.id)) - Number(dropped.has(b.t.id)) ||
    a.t.deadline - b.t.deadline ||
    (a.t.id < b.t.id ? -1 : 1);
}

/** Free gaps a day's blocks leave, with a break's margin beside other work. */
function gapsOf(day: DayBudget['day'], blocks: Placed[], breakMin: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  for (const iv of day.freeIntervals) {
    const inside = sorted.filter((b) => b.start < iv.end && b.end > iv.start);
    let cursor = iv.start;
    let afterWork = false;
    for (const b of [...inside, null]) {
      const end = b ? b.start : iv.end;
      let s = cursor + (afterWork ? breakMin * MS_PER_MIN : 0);
      s = Math.ceil(s / SNAP_MS) * SNAP_MS;
      const e = end - (b ? breakMin * MS_PER_MIN : 0);
      if (e - s >= 5 * MS_PER_MIN) out.push([s, e]);
      if (b) { cursor = Math.max(cursor, b.end); afterWork = true; }
    }
  }
  return out;
}

export function reconcile(
  budgets: DayBudget[],
  built: ConstructedDay[],
  tasks: Task[],
  taskMap: Map<string, Task>,
  config: UserConfig,
  dropped: ReadonlySet<string>,
  now: number,
): ConstructedDay[] {
  const days = budgets.map((b) => b.day);
  const due = tasks.filter((t) => dueWithinPlan(t, days));
  if (!due.length) return built;
  const out = [...built];

  const shortList = () =>
    due
      .map((t) => ({ t, need: t.remainingMin - placedFor(out, t.id) }))
      .filter((x) => x.need > EPSILON_MIN)
      .sort(byNeed(dropped));

  // Minutes each quest lost to the swap, to pay back in the fill.
  const lent = new Map<string, number>();
  const perTask = (d: ConstructedDay) => {
    const m = new Map<string, number>();
    for (const b of d.blocks) if (b.taskId) m.set(b.taskId, (m.get(b.taskId) ?? 0) + minutesOf(b));
    return m;
  };

  // ── 1. Swap ──
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const short = shortList();
    if (!short.length) break;
    const snapshot = new Map<number, { quotas: DayBudget['quotas']; built: ConstructedDay }>();
    const receivers = new Map<number, Set<string>>();

    for (const { t, need: startNeed } of short) {
      let need = startNeed;
      for (let i = 0; i < days.length && need > EPSILON_MIN; i += 1) {
        const day = days[i]!;
        if (day.workStart >= t.deadline) break;
        const notBefore = t.notBefore ?? 0;
        if (notBefore >= day.workEnd) continue;
        // A few minutes only go where the quest already has a sitting to grow;
        // on their own they'd be a 7-minute block nobody starts.
        const hasSitting = out[i]!.blocks.some((b) => b.taskId === t.id);
        if (need < SHARD_MIN && t.totalMin >= REAL_QUEST_MIN && !hasSitting) continue;

        // What each possible donor really got here, in time this quest could use.
        const donorMin = new Map<string, number>();
        for (const b of out[i]!.blocks) {
          if (!b.taskId || b.taskId === t.id || b.end > t.deadline || b.start < notBefore) continue;
          donorMin.set(b.taskId, (donorMin.get(b.taskId) ?? 0) + minutesOf(b));
        }
        const donors = [...donorMin]
          .map(([id, m]) => ({ task: taskMap.get(id)!, m }))
          .filter((d) => d.task && canDonate(d.task, t, days, dropped))
          .sort(
            (a, b) =>
              Number(dropped.has(b.task.id)) - Number(dropped.has(a.task.id)) ||
              b.task.deadline - a.task.deadline ||
              (a.task.id < b.task.id ? -1 : 1),
          );
        if (!donors.length) continue;

        const budget = budgets[i]!;
        if (!snapshot.has(i)) {
          snapshot.set(i, { quotas: budget.quotas.map((q) => ({ ...q })), built: out[i]! });
          // Settle at what the constructor really placed on this day.
          const placedHere = new Map<string, number>();
          for (const b of out[i]!.blocks) if (b.taskId) placedHere.set(b.taskId, (placedHere.get(b.taskId) ?? 0) + minutesOf(b));
          for (const q of budget.quotas) q.targetMin = Math.floor(placedHere.get(q.task.id) ?? 0);
        }

        for (const d of donors) {
          if (need <= EPSILON_MIN) break;
          const dq = budget.quotas.find((q) => q.task.id === d.task.id);
          if (!dq || dq.targetMin < 1) continue;
          let take = Math.floor(Math.min(need, d.m, dq.targetMin));
          // Don't leave the donor a crumb nobody would sit down for.
          const rest = dq.targetMin - take;
          if (rest > 0 && rest < minSitting(d.task, dq.targetMin)) take = dq.targetMin;
          if (take < 1) continue;
          dq.targetMin -= take;
          const gain = Math.min(take, Math.ceil(need));
          const mine = budget.quotas.find((q) => q.task.id === t.id);
          if (mine) mine.targetMin += gain;
          else budget.quotas.push({ task: t, targetMin: gain });
          need -= gain;
          if (!receivers.has(i)) receivers.set(i, new Set());
          receivers.get(i)!.add(t.id);
        }
      }
    }
    if (!snapshot.size) break;

    let improved = false;
    for (const [i, snap] of snapshot) {
      budgets[i]!.quotas = budgets[i]!.quotas.filter((q) => q.targetMin >= 1);
      const rebuilt = buildDay(budgets[i]!, taskMap, config, now);
      const gainedFor = (d: ConstructedDay) =>
        d.blocks.filter((b) => b.taskId && receivers.get(i)!.has(b.taskId)).reduce((m, b) => m + minutesOf(b), 0);
      if (gainedFor(rebuilt) > gainedFor(snap.built) + EPSILON_MIN) {
        const before = perTask(snap.built);
        const after = perTask(rebuilt);
        for (const [id, m] of before) {
          const lost = m - (after.get(id) ?? 0);
          if (lost > EPSILON_MIN && !receivers.get(i)!.has(id)) lent.set(id, (lent.get(id) ?? 0) + lost);
        }
        out[i] = rebuilt;
        improved = true;
      } else {
        budgets[i]!.quotas = snap.quotas;
      }
    }
    if (!improved) break;
  }

  // ── 2. Fill ──
  // Short quests due in the plan first; then paying back what was lent.
  const short: Array<{ t: Task; need: number }> = shortList();
  const shortIds = new Set(short.map((x) => x.t.id));
  for (const [id, m] of lent) {
    const t = taskMap.get(id);
    // Never more than the quest still lacks: one rebuilt day can take a block
    // that another day's rebuild already gave back, and a 45-minute errand
    // was then planned twice.
    const owed = t ? Math.min(m, t.remainingMin - placedFor(out, id)) : 0;
    if (t && !shortIds.has(id) && owed > EPSILON_MIN) short.push({ t, need: owed });
  }
  if (!short.length) return out;
  const need = new Map(short.map((x) => [x.t.id, x.need]));
  const breakMin = config.breakPolicy.shortBreakDurationMin;

  for (let i = 0; i < days.length; i += 1) {
    if (![...need.values()].some((v) => v > EPSILON_MIN)) break;
    const day = days[i]!;
    const blocks: Placed[] = [...out[i]!.blocks].sort((a, b) => a.start - b.start);
    // The check-in cap still holds for today.
    let capLeft = i === 0 && config.todayCapMin !== undefined
      ? config.todayCapMin - blocks.reduce((m, b) => m + minutesOf(b), 0)
      : Infinity;
    const added: Placed[] = [];
    // All of the day's work, kept blocks of a replan included, so a filled
    // block's reason knows what came before it (it used to be told "nothing",
    // and called a 16:00 block "an easy start").
    const dayRefs = (): PlacedRef[] => {
      const refs: PlacedRef[] = [];
      for (const b of [...day.immovableThisDay, ...blocks, ...added]) {
        const t = b.type === 'work' && b.taskId ? taskMap.get(b.taskId) : undefined;
        if (t) refs.push({ block: { ...b, id: 'tmp' } as Block, task: t });
      }
      return refs;
    };

    for (const [gapStart, ge] of gapsOf(day, blocks, breakMin)) {
      let gs = gapStart;
      while (ge - gs >= 5 * MS_PER_MIN && capLeft >= 5) {
        const room = (end: number) => Math.min(ge, end, gs + capLeft * MS_PER_MIN);
        const open = short.filter(
          ({ t }) => (need.get(t.id) ?? 0) > EPSILON_MIN && t.deadline > gs && (t.notBefore ?? 0) <= gs,
        );
        const fits = (t: Task) => (room(t.deadline) - gs) / MS_PER_MIN;
        // A quest that can finish here, first; otherwise a real sitting on one that can't.
        const shard = (t: Task) => need.get(t.id)! < SHARD_MIN && t.totalMin >= REAL_QUEST_MIN;
        const finish = open.find(({ t }) => need.get(t.id)! <= fits(t) + EPSILON_MIN && !shard(t));
        // (Not a shard here either: `partial` used to take one, since a gap of
        // 25 minutes "fits a sitting" of a 7-minute need, and placed the 7.)
        const partial = finish ? null : open.find(({ t }) => !shard(t) && fits(t) >= Math.max(MIN_SITTING_MIN, minSitting(t, need.get(t.id)!)));
        const pick = finish ?? partial;
        if (!pick) break;
        const t = pick.t;
        let chunk = Math.floor(Math.min(need.get(t.id)!, fits(t), config.softMaxBlockMin));
        // Don't leave a shard behind: take it all if it nearly fits, else leave a real piece.
        const after = need.get(t.id)! - chunk;
        if (after > EPSILON_MIN && after < SHARD_MIN && t.totalMin >= REAL_QUEST_MIN) chunk = Math.floor(chunk - (SHARD_MIN - after));
        if (chunk < Math.min(SHARD_MIN, need.get(t.id)!)) break;
        const end = gs + chunk * MS_PER_MIN;
        const why = composeWhy({ task: t, start: gs, end, prev: workBefore(dayRefs(), gs), config });
        added.push({
          start: gs,
          end,
          type: 'work',
          taskId: t.id,
          locked: false,
          note: JSON.stringify({ term: 'urgency', sign: '+', total: 0, why: why ?? 'fitted into a free gap so it’s done in time' }),
        });
        need.set(t.id, need.get(t.id)! - chunk);
        capLeft -= chunk;
        const rest = chunk >= MIN_SITTING_MIN || t.cognitiveLoad >= 0.7 ? breakMin : 0;
        gs = Math.ceil((end + rest * MS_PER_MIN) / SNAP_MS) * SNAP_MS;
      }
    }
    // Shards: a few minutes still owed lengthen a sitting the quest already
    // has today, where the time after it is free. On their own they were a
    // 7-minute block; unplaced, a deadline missed by 7 minutes.
    const all: Placed[] = [...blocks, ...added].sort((a, b) => a.start - b.start);
    let grew = false;
    for (const { t } of short) {
      const owed = need.get(t.id) ?? 0;
      if (owed <= EPSILON_MIN || owed >= SHARD_MIN || capLeft < owed) continue;
      for (let k = 0; k < all.length; k += 1) {
        const b = all[k]!;
        if (b.taskId !== t.id || minutesOf(b) + owed > config.softMaxBlockMin) continue;
        const end = b.end + Math.ceil(owed) * MS_PER_MIN;
        const iv = day.freeIntervals.find((x) => x.start <= b.start && x.end >= b.end);
        const next = all[k + 1];
        if (!iv || end > iv.end || end > t.deadline) continue;
        if (next && next.start < end + breakMin * MS_PER_MIN) continue;
        // Nor straight on from the block before it: the longer sitting must
        // still start after a break, or the stretch runs past the break policy.
        const before = all[k - 1];
        if (before && b.start - before.end < 5 * MS_PER_MIN && minutesOf(before) + minutesOf(b) + owed > config.breakPolicy.shortBreakAfterMin + 2 * SHARD_MIN) continue;
        all[k] = { ...b, end };
        need.set(t.id, 0);
        capLeft -= owed;
        grew = true;
        break;
      }
    }
    if (added.length || grew) out[i] = { ...out[i]!, blocks: all };
  }

  // Last resort, for quests due in the plan only: a shard that found no
  // sitting to lengthen gets a short block of its own. A 15-minute block is
  // a poor block; a deadline missed by 15 minutes with the afternoon free
  // is worse.
  for (const { t } of short) {
    const owed = Math.ceil(need.get(t.id) ?? 0);
    if (owed < 1 || !dueWithinPlan(t, days)) continue;
    for (let i = 0; i < days.length && (need.get(t.id) ?? 0) > EPSILON_MIN; i += 1) {
      if (days[i]!.workStart >= t.deadline) break;
      const blocks = out[i]!.blocks;
      if (i === 0 && config.todayCapMin !== undefined && blocks.reduce((m, b) => m + minutesOf(b), 0) + owed > config.todayCapMin) continue;
      const gap = gapsOf(days[i]!, blocks, breakMin).find(
        ([s, e]) => s >= (t.notBefore ?? 0) && Math.min(e, t.deadline) - s >= owed * MS_PER_MIN,
      );
      if (!gap) continue;
      const [start] = gap;
      const end = start + owed * MS_PER_MIN;
      const refs: PlacedRef[] = [];
      for (const b of [...days[i]!.immovableThisDay, ...blocks]) {
        const bt = b.type === 'work' && b.taskId ? taskMap.get(b.taskId) : undefined;
        if (bt) refs.push({ block: { ...b, id: 'tmp' } as Block, task: bt });
      }
      const why = composeWhy({ task: t, start, end, prev: workBefore(refs, start), config });
      const block: Placed = {
        start, end, type: 'work', taskId: t.id, locked: false,
        note: JSON.stringify({ term: 'urgency', sign: '+', total: 0, why: why ?? 'fitted into a free gap so it’s done in time' }),
      };
      out[i] = { ...out[i]!, blocks: [...blocks, block].sort((a, b) => a.start - b.start) };
      need.set(t.id, 0);
    }
  }
  return out;
}
