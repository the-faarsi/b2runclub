-- AlterTable
-- All three nullable, so existing rows need no backfill. An existing member
-- reads as unverified with no phone on record, which is exactly the state the
-- app is meant to prompt them out of.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "email_verified_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "phone_verified_at" TIMESTAMP(3);

-- CreateTable
-- New table only, so nothing existing is touched and this is safe to apply
-- while the app is running.
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationCode_user_id_channel_idx" ON "VerificationCode"("user_id", "channel");

-- AddForeignKey
ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
