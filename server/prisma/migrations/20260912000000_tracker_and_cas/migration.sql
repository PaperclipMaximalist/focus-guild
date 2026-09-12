-- Long-horizon tracker + CAS lens.
--
-- Written idempotently on purpose. The schema engine cannot reach Neon from
-- every dev machine, so this migration is applied out-of-band during
-- development and then recorded normally by `prisma migrate deploy` on
-- deploy. Re-running it must therefore be a no-op rather than an error.
-- Additive only: no drops, no column type changes, no data movement.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TrackerStatus" AS ENUM ('TODO', 'ACTIVE', 'BLOCKED', 'DONE', 'DROPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trackerSettings" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tracker_domains" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracker_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tracker_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "domainId" TEXT,
    "title" TEXT NOT NULL,
    "status" "TrackerStatus" NOT NULL DEFAULT 'TODO',
    "nextAction" TEXT,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "questId" TEXT,
    "casStrands" TEXT[],
    "learningOutcomes" INTEGER[],
    "isCourseworkLinked" BOOLEAN NOT NULL DEFAULT false,
    "casStartDate" TIMESTAMP(3),
    "casEndDate" TIMESTAMP(3),
    "isCasProject" BOOLEAN NOT NULL DEFAULT false,
    "hours" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "droppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracker_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "reflections" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loTags" INTEGER[],
    "mediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "parking_lot_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "promotedToCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_lot_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "decision_log_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cas_interviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cas_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tracker_domains_userId_sortOrder_idx" ON "tracker_domains"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tracker_domains_userId_name_key" ON "tracker_domains"("userId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tracker_items_userId_status_idx" ON "tracker_items"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tracker_items_userId_domainId_idx" ON "tracker_items"("userId", "domainId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tracker_items_userId_code_key" ON "tracker_items"("userId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "reflections_itemId_date_idx" ON "reflections"("itemId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "parking_lot_entries_userId_createdAt_idx" ON "parking_lot_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "decision_log_entries_userId_decidedAt_idx" ON "decision_log_entries"("userId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "cas_interviews_userId_ordinal_key" ON "cas_interviews"("userId", "ordinal");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tracker_domains" ADD CONSTRAINT "tracker_domains_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tracker_items" ADD CONSTRAINT "tracker_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tracker_items" ADD CONSTRAINT "tracker_items_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "tracker_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "reflections" ADD CONSTRAINT "reflections_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "tracker_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "parking_lot_entries" ADD CONSTRAINT "parking_lot_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "cas_interviews" ADD CONSTRAINT "cas_interviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
