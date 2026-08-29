-- AlterTable
-- Nullable, so existing rows need no backfill and the column is safe to add
-- while the app is running.
ALTER TABLE "Event" ADD COLUMN "cover_url" TEXT;
