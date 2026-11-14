-- The published plan feed gets its own token. Until now the feed link carried
-- the personal access token, which also opens the whole API; a link that is
-- pasted into other companies' calendar apps must not be worth more than the
-- plan it shows. Only the hash is stored, like the personal token's.
-- oldFeedLinkSeenAt: when a calendar last asked for the plan with one of the
-- old links (they no longer work), so the app can tell that member to make a
-- new link and a new personal token.
-- Idempotent and additive only, like the migrations before it.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calendarFeedTokenHash" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oldFeedLinkSeenAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_calendarFeedTokenHash_key" ON "users"("calendarFeedTokenHash");
