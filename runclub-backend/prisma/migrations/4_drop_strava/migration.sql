-- Remove the Strava integration.
--
-- Destructive, unlike the migrations before it, so worth being explicit about
-- what is lost. At the time of writing the live database held:
--   StravaAccount        0 rows
--   User.strava_id       0 non-null
--   Founder.strava       0 non-null
--   ClubInfo.strava_club 1 value (a club id, removed by intent)
--
-- The leaderboard that consumed this data generated its figures from a formula
-- rather than measuring anything, so nothing computed from it is lost either.

-- DropTable
DROP TABLE IF EXISTS "StravaAccount";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "strava_id";
ALTER TABLE "ClubInfo" DROP COLUMN IF EXISTS "strava_club";
ALTER TABLE "Founder" DROP COLUMN IF EXISTS "strava";
