-- AlterTable
-- Phone verification is gone: the club cannot get a WhatsApp sender approved,
-- so there was no way to deliver a code and the column was never written.
--
-- Dropped rather than left in place because a `phone_verified_at` that nothing
-- populates reads as "these numbers are confirmed" on an organiser screen, and
-- on race day that is a worse lie than having no column. `User.phone` stays —
-- members still supply a number, it is simply taken on trust.
--
-- Safe: all-NULL everywhere, and nothing reads it after this migration. Adding
-- it back is a one-line additive migration if a sender is ever approved.
--
-- IF EXISTS so this is replayable, and so it does not fail on a database where
-- 6_verification was never applied.
ALTER TABLE "User" DROP COLUMN IF EXISTS "phone_verified_at";

-- Any PHONE codes still on file are unredeemable now that the route is gone.
DELETE FROM "VerificationCode" WHERE "channel" = 'PHONE';
