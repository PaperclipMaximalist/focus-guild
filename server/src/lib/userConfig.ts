/**
 * Per-user scheduler config.
 *
 * User-tunable overrides live in `User.schedulerSettings` (JSON).
 * Shape is `Partial<SchedulerOverrides>` — only the fields the user has
 * actually changed are stored; everything else falls back to defaults.
 *
 * This module is the ONLY place where user settings turn into a usable
 * `UserConfig`. All schedule routes call `getUserConfig(user)`.
 */

import { defaultConfig } from './scheduler/index.js';
import type { UserConfig, Weights, BreakPolicy, WorkingHours } from './scheduler/index.js';

/**
 * The subset of UserConfig the user can override via the Settings page.
 * The energyCurve function stays as-is (the default two-peak curve);
 * exposing it as JSON would be ugly. We can add curve presets later.
 */
export interface SchedulerOverrides {
  weights?: Partial<Weights>;
  breakPolicy?: Partial<BreakPolicy>;
  workingHours?: Partial<WorkingHours>;
  horizonDays?: number;
  softMaxBlockMin?: number;
}

/** Type-narrow helper for JSON-from-DB. */
function isOverrides(v: unknown): v is SchedulerOverrides {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Merge user overrides on top of `defaultConfig()`. Pass the User row
 * with its `schedulerSettings` JSON column.
 */
export function getUserConfig(user: { schedulerSettings?: unknown }): UserConfig {
  const base = defaultConfig();
  const overrides = isOverrides(user.schedulerSettings) ? user.schedulerSettings : {};

  return {
    ...base,
    weights: { ...base.weights, ...(overrides.weights ?? {}) },
    breakPolicy: { ...base.breakPolicy, ...(overrides.breakPolicy ?? {}) },
    workingHours: { ...base.workingHours, ...(overrides.workingHours ?? {}) },
    horizonDays: overrides.horizonDays ?? base.horizonDays,
    softMaxBlockMin: overrides.softMaxBlockMin ?? base.softMaxBlockMin,
  };
}

/** Return just the overrides part (what the Settings page binds to). */
export function getOverrides(user: { schedulerSettings?: unknown }): SchedulerOverrides {
  return isOverrides(user.schedulerSettings) ? user.schedulerSettings : {};
}
