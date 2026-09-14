-- ICS calendar feeds, their busy events, and the personal inbox token.
-- Idempotent and additive only, like the migrations before it.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "inboxTokenHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_inboxTokenHash_key" ON "users"("inboxTokenHash");

CREATE TABLE IF NOT EXISTS "calendar_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "external_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "calendar_sources_userId_idx" ON "calendar_sources"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "external_events_sourceId_uid_key" ON "external_events"("sourceId", "uid");

CREATE INDEX IF NOT EXISTS "external_events_userId_start_idx" ON "external_events"("userId", "start");

DO $$ BEGIN
  ALTER TABLE "calendar_sources" ADD CONSTRAINT "calendar_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "external_events" ADD CONSTRAINT "external_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "external_events" ADD CONSTRAINT "external_events_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "calendar_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
