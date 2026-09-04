-- Party bookings: a member books for named guests, adults and children priced
-- separately, admitted individually at the start line.
--
-- The backfill at the bottom is not optional. Capacity stops counting
-- registrations and starts counting RegistrationGuest rows, so without a
-- booker row per existing registration every event would read as empty and
-- oversell. DDL and backfill have to land in the same deploy, in this order.

-- AlterTable: children
ALTER TABLE "Event" ADD COLUMN "kids_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "kid_price" DOUBLE PRECISION;

-- AlterTable: what was actually charged, so a later price edit cannot change
-- what a refund returns.
ALTER TABLE "EventRegistration" ADD COLUMN "amount_due_paise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EventRegistration" ADD COLUMN "adult_price_at_booking" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "EventRegistration" ADD COLUMN "kid_price_at_booking" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "RegistrationGuest" (
    "id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ADULT',
    "is_booker" BOOLEAN NOT NULL DEFAULT false,
    "admitted_at" TIMESTAMP(3),
    "admitted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationGuest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistrationGuest_registration_id_idx" ON "RegistrationGuest"("registration_id");

ALTER TABLE "RegistrationGuest" ADD CONSTRAINT "RegistrationGuest_registration_id_fkey"
    FOREIGN KEY ("registration_id") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: every existing registration becomes a party of one — the member.
--
-- attended_at is carried onto the row rather than left behind, so nobody's
-- check-in history is lost when race day starts reading admitted_at instead.
-- gen_random_uuid() is in core Postgres from 13; on older servers enable
-- pgcrypto or generate the ids in application code.
INSERT INTO "RegistrationGuest" (
    "id", "registration_id", "name", "kind", "is_booker", "admitted_at", "admitted_by", "created_at"
)
SELECT
    gen_random_uuid()::text,
    r."id",
    u."name",
    'ADULT',
    true,
    r."attended_at",
    r."checked_in_by",
    CURRENT_TIMESTAMP
FROM "EventRegistration" r
JOIN "User" u ON u."id" = r."user_id"
WHERE NOT EXISTS (
    SELECT 1 FROM "RegistrationGuest" g WHERE g."registration_id" = r."id"
);

-- Backfill 2: the money snapshot for bookings that predate it.
--
-- The event's current price is the only figure on record, so it is the best
-- available approximation — it is exactly right unless an organiser has edited
-- the price since. A FREE row is left at zero rather than given the price it
-- never paid.
UPDATE "EventRegistration" r
SET "amount_due_paise" = CASE WHEN r."status" = 'FREE' THEN 0 ELSE ROUND(e."price" * 100) END,
    "adult_price_at_booking" = e."price"
FROM "Event" e
WHERE e."id" = r."event_id" AND r."amount_due_paise" = 0 AND r."adult_price_at_booking" = 0;
