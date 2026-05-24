-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BlockType" ADD VALUE 'WORK';
ALTER TYPE "BlockType" ADD VALUE 'BREAK';
ALTER TYPE "BlockType" ADD VALUE 'FIXED';

-- AlterTable
ALTER TABLE "schedule_blocks" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT;
