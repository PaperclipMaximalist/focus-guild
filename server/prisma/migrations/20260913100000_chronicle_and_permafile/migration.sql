-- Chronicle (activity log) + versioned permafile. Idempotent, additive only.

CREATE TABLE IF NOT EXISTS "activity_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "subjectId" TEXT,
    "data" JSONB,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "permafile_versions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permafile_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_log_userId_at_idx" ON "activity_log"("userId", "at");

CREATE INDEX IF NOT EXISTS "permafile_versions_userId_createdAt_idx" ON "permafile_versions"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "permafile_versions" ADD CONSTRAINT "permafile_versions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
