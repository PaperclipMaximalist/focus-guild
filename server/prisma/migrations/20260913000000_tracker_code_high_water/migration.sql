-- Per-prefix high-water mark for tracker item codes, so a deleted item's code
-- is never reissued. Idempotent, like the tracker migration before it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trackerCodeHighWater" JSONB;
