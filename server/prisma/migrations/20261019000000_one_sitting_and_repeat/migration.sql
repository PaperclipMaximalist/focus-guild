-- Quests done in one go (never split), and routines that don't come round
-- every day (weekly on chosen days, or every few days).
-- Idempotent and additive only, like the migrations before it.

ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "oneSitting" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "repeat" JSONB;
