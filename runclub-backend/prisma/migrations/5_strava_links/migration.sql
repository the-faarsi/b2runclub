-- AlterTable
-- Both nullable, so existing rows need no backfill.
--
-- Narrower than the integration removed in 4_drop_strava: these are two links
-- shown in the contact section and on founder cards. No OAuth, no tokens, no
-- activity data, no leaderboard.
ALTER TABLE "ClubInfo" ADD COLUMN "strava_url" TEXT;
ALTER TABLE "Founder" ADD COLUMN "strava" TEXT;
