/**
 * Quest ↔ Task adapter. Maps the Focus Guild Quest model (and a few
 * scheduler-specific fields stored on the user) into the Task shape
 * the scheduler module consumes.
 *
 * The scheduler is intentionally decoupled from Prisma; this adapter
 * is where the impedance mismatch lives.
 */

import type { Task, TaskStatus } from './types.js';

/**
 * Subset of Prisma Quest we need. Decoupled from the generated client so
 * tests can use plain objects.
 */
export interface QuestLike {
  id: string;
  title: string;
  estimatedMinutes: number;
  /** 1..10 in the Quest model → mapped to 0..1 cognitiveLoad. */
  mentalLoad: number;
  /** 1..10 → 0..1 importance. */
  impact: number;
  deadline: Date | null;
  status: 'ACTIVE' | 'COMPLETE' | 'NOT_TODAY' | 'RESCUE';
  tags: string[];
  /** Optional actual elapsed minutes when partially complete. */
  actualMinutes?: number | null;
  createdAt: Date;
  /** Last edit; not always last-worked but the best proxy we have. */
  updatedAt: Date;
  // ── Scheduler hints stored on the Quest row ──────────────────────────
  tediousness?: number | null;
  category?: string | null;
  preferredHour?: number | null;
  minChunkMin?: number | null;
  maxChunkMin?: number | null;
  setupCost?: number | null;
  urgencyMult?: number | null;
  isRecurring?: boolean;
}

/** Per-quest scheduler overrides — stored alongside the Quest (future column or sidecar). */
export interface QuestSchedulerOverrides {
  tediousness?: number;       // 0..1
  setupCost?: number;         // 0..1
  minChunkMin?: number;
  maxChunkMin?: number;
  category?: string;
  preferredHour?: number | null;
  dependencies?: string[];
  /** 1.0 = default; >1 boosts, <1 dampens the urgency contribution. */
  urgencyMultiplier?: number;
  /** If true, this quest is a short daily-filler — handled by daily-filler module. */
  isDailyFiller?: boolean;
}

/** Default values when a quest hasn't been configured for the scheduler yet. */
export const ADAPTER_DEFAULTS = {
  tediousness: 0.4,
  setupCost: 0.3,
  minChunkMin: 15,
  maxChunkMin: 50,
  category: 'deep_work',
  preferredHour: null as number | null,
  // Tasks with no deadline are slotted far in the future so urgency stays low
  // but they still rank via staleness.
  fallbackDeadlineDays: 14,
};

function statusToTaskStatus(s: QuestLike['status']): TaskStatus {
  if (s === 'COMPLETE') return 'done';
  if (s === 'NOT_TODAY') return 'pending'; // still pending — just deferred today
  if (s === 'RESCUE') return 'in_progress';
  return 'pending';
}

/**
 * Map a Quest (+ optional overrides) to a scheduler Task.
 *
 * Field mapping:
 *   estimatedMinutes  → totalMin, remainingMin (less actualMinutes if any)
 *   mentalLoad (1-10) → cognitiveLoad (0..1)
 *   impact     (1-10) → importance (0..1)
 *   deadline          → deadline (or now + fallback)
 *   updatedAt         → lastWorkedAt
 *   status            → status
 *   all other Task fields → from overrides or ADAPTER_DEFAULTS
 */
export function questToTask(
  q: QuestLike,
  overrides: QuestSchedulerOverrides = {},
  now: number = Date.now(),
): Task {
  const total = Math.max(1, q.estimatedMinutes);
  const remaining = Math.max(0, total - (q.actualMinutes ?? 0));
  const deadline = q.deadline
    ? q.deadline.getTime()
    : now + ADAPTER_DEFAULTS.fallbackDeadlineDays * 24 * 60 * 60_000;

  // Priority: explicit `overrides` argument > Quest row column > ADAPTER_DEFAULTS.
  const pick = <T,>(o: T | undefined, row: T | null | undefined, def: T): T =>
    o !== undefined ? o : row !== undefined && row !== null ? row : def;

  return {
    id: q.id,
    name: q.title,
    remainingMin: remaining,
    totalMin: total,
    deadline,
    tediousness: pick(overrides.tediousness, q.tediousness, ADAPTER_DEFAULTS.tediousness),
    cognitiveLoad: clamp01(q.mentalLoad / 10),
    importance: clamp01(q.impact / 10),
    setupCost: pick(overrides.setupCost, q.setupCost, ADAPTER_DEFAULTS.setupCost),
    minChunkMin: pick(overrides.minChunkMin, q.minChunkMin, ADAPTER_DEFAULTS.minChunkMin),
    maxChunkMin: pick(overrides.maxChunkMin, q.maxChunkMin, ADAPTER_DEFAULTS.maxChunkMin),
    category: pick(overrides.category, q.category, ADAPTER_DEFAULTS.category),
    preferredHour: pick(overrides.preferredHour, q.preferredHour, ADAPTER_DEFAULTS.preferredHour),
    dependencies: overrides.dependencies ?? [],
    createdAt: q.createdAt.getTime(),
    lastWorkedAt: q.updatedAt.getTime(),
    status: statusToTaskStatus(q.status),
    urgencyMultiplier: pick(overrides.urgencyMultiplier, q.urgencyMult, 1.0),
  };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Convenience: map many at once, skipping completed quests. */
export function questsToTasks(
  quests: QuestLike[],
  overridesById: Record<string, QuestSchedulerOverrides> = {},
  now: number = Date.now(),
): Task[] {
  return quests
    .filter((q) => q.status !== 'COMPLETE')
    .map((q) => questToTask(q, overridesById[q.id] ?? {}, now));
}
