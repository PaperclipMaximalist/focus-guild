-- CreateEnum
CREATE TYPE "PriorityTier" AS ENUM ('HIGH', 'MED', 'LOW');

-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "priorityTier" "PriorityTier" NOT NULL DEFAULT 'MED';
