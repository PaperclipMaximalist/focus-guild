/**
 * Pure scoring functions for the auto-scheduler.
 *
 * Each sub-score normalizes to ~0..1 before weighting.
 * Score = w_urgency·U_eff + w_staleness·S + w_time_fit·T + w_energy_fit·E + w_chunk_fit·C
 *       − w_adjacency·A − w_switch·X − w_fragmentation·F
 */

import { EPSILON } from './config.js';
import type {
  ScheduleContext,
  ScoreBreakdown,
  ScoreResult,
  Task,
  UserConfig,
} from './types.js';

const MS_PER_MIN = 60_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Slack in minutes: deadline − now − remainingMin. Negative = infeasible. */
export function slackMin(task: Task, now: number): number {
  const deadlineMin = (task.deadline - now) / MS_PER_MIN;
  return deadlineMin - task.remainingMin;
}

/**
 * Importance-modulated urgency, optionally amplified by the per-task
 * `urgencyMultiplier`. Returns roughly 0..1.5 (multiplier can push above 1).
 */
export function urgencyScore(task: Task, now: number): number {
  const deadlineMin = (task.deadline - now) / MS_PER_MIN;
  const load = task.remainingMin / Math.max(deadlineMin, EPSILON);
  const uRaw = Math.min(load * load, 5);
  const u = uRaw / 5;
  const base = u * (0.5 + 0.5 * task.importance);
  return base * (task.urgencyMultiplier ?? 1.0);
}

/** Staleness 0..1 — log-scaled days since creation, saturating around 30 days. */
export function stalenessScore(task: Task, now: number): number {
  const daysSinceCreated = Math.max(0, (now - task.createdAt) / (MS_PER_MIN * 60 * 24));
  return clamp(Math.log(1 + daysSinceCreated) / Math.log(1 + 30), 0, 1);
}

/** Time-of-day fit (gaussian around preferredHour, σ=2). */
export function timeFitScore(task: Task, blockStart: number): number {
  if (task.preferredHour === null) return 1;
  const currentHour = new Date(blockStart).getHours();
  const diff = currentHour - task.preferredHour;
  return Math.exp(-(diff * diff) / (2 * 2 * 2));
}

/** Energy fit: 1 − |cognitive_load − energy_curve(hour)|. */
export function energyFitScore(task: Task, blockStart: number, config: UserConfig): number {
  const currentHour = new Date(blockStart).getHours();
  const e = config.energyCurve(currentHour);
  return clamp(1 - Math.abs(task.cognitiveLoad - e), 0, 1);
}

/**
 * Chunk fit. Hard constraint enforced upstream (block < minChunk → exclude).
 * Larger blocks score higher up to maxChunk; setupCost rewards longer chunks.
 */
export function chunkFitScore(task: Task, blockDurationMin: number): number {
  const ratio = Math.min(1, blockDurationMin / Math.max(task.maxChunkMin, EPSILON));
  return clamp((ratio * (1 + task.setupCost)) / 2, 0, 1);
}

/** Windowed adjacency: tediousness × Σ prev tediousness × 0.6^(i−1) / 2. */
export function adjacencyPenalty(task: Task, recentWorkTasks: Task[]): number {
  if (recentWorkTasks.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < recentWorkTasks.length && i < 3; i += 1) {
    acc += recentWorkTasks[i]!.tediousness * Math.pow(0.6, i);
  }
  return clamp((task.tediousness * acc) / 2, 0, 1);
}

/** Context-switch penalty: 1 if category changed, else 0. */
export function switchPenalty(task: Task, prevTask: Task | null): number {
  if (!prevTask) return 0;
  return prevTask.category === task.category ? 0 : 1;
}

/**
 * Dynamic per-day chunk target.
 *
 * "Steady on a single topic" by default → 2 chunks/day. But if there are
 * many hours of work and the deadline is closing in, we raise the target
 * so the algorithm allows more blocks per day for that task.
 *
 *   typicalChunkMin = 60 (one solid hour)
 *   daysLeft        = max(1, (deadline - now) / 1 day)
 *   need_per_day    = remainingMin / daysLeft
 *   target          = clamp( round(need_per_day / typicalChunkMin), 2, 6 )
 */
export function dynamicChunkTarget(task: Task, now: number): number {
  const TYPICAL_CHUNK_MIN = 60;
  const MS_PER_DAY = MS_PER_MIN * 60 * 24;
  const daysLeft = Math.max(1, (task.deadline - now) / MS_PER_DAY);
  const needPerDay = task.remainingMin / daysLeft;
  const target = Math.round(needPerDay / TYPICAL_CHUNK_MIN);
  return clamp(target, 2, 6);
}

/**
 * Fragmentation: quadratic distance from the dynamic per-day chunk target.
 *
 * If now/deadline are not supplied, falls back to the static target of 2.
 */
export function fragmentationPenalty(
  task: Task,
  chunksTodayForTask: number,
  now?: number,
): number {
  const target = now != null ? dynamicChunkTarget(task, now) : 2;
  const delta = chunksTodayForTask - target;
  return clamp((delta * delta) / 4, 0, 1);
}

/**
 * Oversize penalty: discourages blocks longer than `softMaxBlockMin`.
 *
 * Returns 0 below the cap, grows linearly above it, saturating at 1 after
 * 2× the cap. "Special circumstances" — high setupCost (long warmup) and
 * high urgency multiplier dampen the penalty (a task that hates getting
 * interrupted or is rushing a deadline can still get a long block).
 */
export function oversizePenalty(
  task: Task,
  blockDurationMin: number,
  softMaxBlockMin: number,
): number {
  if (blockDurationMin <= softMaxBlockMin) return 0;
  const over = blockDurationMin - softMaxBlockMin;
  const raw = clamp(over / softMaxBlockMin, 0, 1);
  // Mitigations: each can independently reduce penalty by up to 50%.
  // setupCost ≥ 0.7 → −0.5×, urgencyMultiplier ≥ 1.5 → −0.5×
  const setupRelief = task.setupCost >= 0.7 ? 0.5 : 0;
  const rushRelief = (task.urgencyMultiplier ?? 1) >= 1.5 ? 0.5 : 0;
  const mitigated = raw * (1 - Math.min(setupRelief + rushRelief, 0.85));
  return clamp(mitigated, 0, 1);
}

/**
 * Compose the full score. Pure — no side effects, depends only on inputs.
 */
export function scoreTask(
  task: Task,
  context: ScheduleContext,
  config: UserConfig,
  now: number,
): ScoreResult {
  const blockDurationMin = (context.blockEnd - context.blockStart) / MS_PER_MIN;
  const w = config.weights;

  const u = urgencyScore(task, now);
  const s = stalenessScore(task, now);
  const t = timeFitScore(task, context.blockStart);
  const e = energyFitScore(task, context.blockStart, config);
  const c = chunkFitScore(task, blockDurationMin);
  const a = adjacencyPenalty(task, context.recentWorkTasks);
  const x = switchPenalty(task, context.prevTask);
  const f = fragmentationPenalty(task, context.chunksTodayByTaskId[task.id] ?? 0, now);
  const o = oversizePenalty(task, blockDurationMin, config.softMaxBlockMin);

  const breakdown: ScoreBreakdown = {
    urgency: w.urgency * u,
    staleness: w.staleness * s,
    timeFit: w.timeFit * t,
    energyFit: w.energyFit * e,
    chunkFit: w.chunkFit * c,
    adjacency: w.adjacency * a,
    switch: w.switch * x,
    fragmentation: w.fragmentation * f,
    oversize: w.oversize * o,
  };

  const total =
    breakdown.urgency +
    breakdown.staleness +
    breakdown.timeFit +
    breakdown.energyFit +
    breakdown.chunkFit -
    breakdown.adjacency -
    breakdown.switch -
    breakdown.fragmentation -
    breakdown.oversize;

  return { total, breakdown };
}

/**
 * Format the top contributors (positive and negative) for a block's note.
 * Used to explain why a task was placed in a given slot.
 */
export function summarizeBreakdown(breakdown: ScoreBreakdown, topN = 2): string {
  const positives: Array<[string, number]> = [
    ['urgency', breakdown.urgency],
    ['staleness', breakdown.staleness],
    ['timeFit', breakdown.timeFit],
    ['energyFit', breakdown.energyFit],
    ['chunkFit', breakdown.chunkFit],
  ];
  const negatives: Array<[string, number]> = [
    ['adjacency', breakdown.adjacency],
    ['switch', breakdown.switch],
    ['fragmentation', breakdown.fragmentation],
    ['oversize', breakdown.oversize],
  ];
  positives.sort((a, b) => b[1] - a[1]);
  negatives.sort((a, b) => b[1] - a[1]);
  const top = positives.slice(0, topN).map(([k, v]) => `${k}=${v.toFixed(2)}`);
  const worst = negatives[0];
  if (worst && worst[1] > 0.01) top.push(`-${worst[0]}=${worst[1].toFixed(2)}`);
  return top.join(', ');
}
