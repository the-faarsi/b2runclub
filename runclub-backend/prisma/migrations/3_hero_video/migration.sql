-- AlterTable
-- Nullable, so existing rows need no backfill.
ALTER TABLE "ClubInfo" ADD COLUMN "hero_video_url" TEXT;
