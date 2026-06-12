/**
 * Settings — user-tunable scheduler overrides.
 *
 *   GET  /settings       → { defaults, overrides }
 *   PUT  /settings       → save partial overrides
 *
 * Overrides shape is validated loosely (zod) — anything missing falls
 * back to defaults at scheduler time via `getUserConfig`.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { db } from '../db/client.js';
import { defaultConfig } from '../lib/scheduler/index.js';
import { getOverrides, type SchedulerOverrides } from '../lib/userConfig.js';

export const settings = new Hono();

// Legacy 9-knob weights — still accepted so persisted overrides from the
// pre-revamp scorer don't 400 on save, but the planner ignores them.
const WeightsSchema = z
  .object({
    urgency: z.number().min(0).max(20).optional(),
    staleness: z.number().min(0).max(20).optional(),
    timeFit: z.number().min(0).max(20).optional(),
    energyFit: z.number().min(0).max(20).optional(),
    chunkFit: z.number().min(0).max(20).optional(),
    adjacency: z.number().min(0).max(20).optional(),
    switch: z.number().min(0).max(20).optional(),
    fragmentation: z.number().min(0).max(20).optional(),
    oversize: z.number().min(0).max(20).optional(),
  })
  .strict();

// Live per-decision scoring weights (see scheduler/config.ts for defaults
// and SCHEDULER_PSEUDOCODE.md for what each term does).
const ScoreWeightsSchema = z
  .object({
    energy: z.number().min(0).max(10).optional(),
    urgency: z.number().min(0).max(10).optional(),
    batch: z.number().min(0).max(10).optional(),
    monotony: z.number().min(0).max(10).optional(),
    tedium: z.number().min(0).max(10).optional(),
    cooldown: z.number().min(0).max(10).optional(),
    session: z.number().min(0).max(10).optional(),
  })
  .strict();

const BreakPolicySchema = z
  .object({
    shortBreakAfterMin: z.number().int().min(15).max(240).optional(),
    shortBreakDurationMin: z.number().int().min(1).max(60).optional(),
    longBreakAfterMin: z.number().int().min(30).max(480).optional(),
    longBreakDurationMin: z.number().int().min(5).max(120).optional(),
  })
  .strict();

const WorkingHoursSchema = z
  .object({
    startHour: z.number().int().min(0).max(23).optional(),
    endHour: z.number().int().min(1).max(24).optional(),
  })
  .strict();

const OverridesSchema = z
  .object({
    weights: WeightsSchema.optional(),       // legacy, ignored by planner
    breakPolicy: BreakPolicySchema.optional(), // legacy, ignored by planner
    scoreWeights: ScoreWeightsSchema.optional(),
    workingHours: WorkingHoursSchema.optional(),
    horizonDays: z.number().int().min(1).max(30).optional(),
    softMaxBlockMin: z.number().int().min(15).max(480).optional(),
  })
  .strict();

settings.get('/', (c) => {
  const user = c.get('user');
  const defaults = defaultConfig();
  return c.json({
    success: true,
    data: {
      defaults: {
        scoreWeights: defaults.scoreWeights,
        workingHours: defaults.workingHours,
        horizonDays: defaults.horizonDays,
        softMaxBlockMin: defaults.softMaxBlockMin,
      },
      overrides: getOverrides(user),
    },
  });
});

settings.put('/', async (c) => {
  const user = c.get('user');
  const parsed = OverridesSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: parsed.error.message } },
      400,
    );
  }
  const overrides: SchedulerOverrides = parsed.data;
  await db.user.update({
    where: { id: user.id },
    data: { schedulerSettings: overrides as object },
  });
  return c.json({ success: true, data: { overrides } });
});

settings.delete('/', async (c) => {
  const user = c.get('user');
  await db.user.update({
    where: { id: user.id },
    data: { schedulerSettings: Prisma.JsonNull },
  });
  return c.json({ success: true, data: { overrides: {} } });
});
