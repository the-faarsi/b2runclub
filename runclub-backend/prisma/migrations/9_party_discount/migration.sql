-- Group discount: rupees off a booking that covers more than one person.
--
-- Taken off the whole total once, the booker's own entry included — not per
-- head and not only off the guests. Null means no group discount on the
-- session, which is what every existing event gets.
ALTER TABLE "Event" ADD COLUMN "party_discount" DOUBLE PRECISION;

-- What was actually knocked off, in paise. `amount_due_paise` is already net of
-- it; this exists so a receipt can state the saving, and so an organiser
-- editing the discount later cannot rewrite what somebody was already told.
--
-- Defaults to 0, which is correct for every booking taken before discounts
-- existed: none of them had one applied.
ALTER TABLE "EventRegistration"
    ADD COLUMN "discount_paise_at_booking" INTEGER NOT NULL DEFAULT 0;
