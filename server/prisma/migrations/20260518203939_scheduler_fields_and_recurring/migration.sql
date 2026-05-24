-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxChunkMin" INTEGER,
ADD COLUMN     "minChunkMin" INTEGER,
ADD COLUMN     "preferredHour" INTEGER,
ADD COLUMN     "setupCost" DOUBLE PRECISION,
ADD COLUMN     "tediousness" DOUBLE PRECISION,
ADD COLUMN     "urgencyMult" DOUBLE PRECISION DEFAULT 1.0;

-- CreateTable
CREATE TABLE "recurring_completions" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_completions_userId_date_idx" ON "recurring_completions"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_completions_questId_date_key" ON "recurring_completions"("questId", "date");

-- AddForeignKey
ALTER TABLE "recurring_completions" ADD CONSTRAINT "recurring_completions_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_completions" ADD CONSTRAINT "recurring_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
