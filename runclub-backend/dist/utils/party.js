"use strict";
/**
 * Party bookings: validating a guest list, pricing it, and working out how many
 * places it consumes.
 *
 * One module because the three questions have to agree. Pricing that counts a
 * volunteer's own place as free while capacity counts it as taken, or a guest
 * list the registration route accepts and the capacity check does not, are the
 * kind of mismatch that shows up as an oversold event on a Saturday morning.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISCOUNT_MIN_PARTY = exports.MAX_PARTY_SIZE = void 0;
exports.parseGuests = parseGuests;
exports.priceParty = priceParty;
exports.seatCost = seatCost;
/**
 * Ceiling on a single booking, the member included.
 *
 * Six, chosen with the club rather than derived: it covers a family or a couple
 * of friends and stops one person taking half a session. Enforced server-side —
 * the form offers the same limit, but a limit that only exists in the form is
 * not a limit.
 */
exports.MAX_PARTY_SIZE = 6;
/** Longest a guest name may be. Generous, but not a paste target. */
const MAX_NAME_LENGTH = 60;
/**
 * Validates the extra people on a booking.
 *
 * The booker is deliberately not in this list and is never taken from the
 * request: their row is built from their account name by the caller. Accepting
 * it would let somebody book under a name that is not theirs, which defeats the
 * point of collecting names at all.
 */
function parseGuests(raw, event) {
    if (raw === undefined || raw === null)
        return { ok: true, guests: [] };
    if (!Array.isArray(raw)) {
        return { ok: false, error: "The guest list must be a list" };
    }
    // The booker occupies one of the places, so this is the ceiling on extras.
    if (raw.length > exports.MAX_PARTY_SIZE - 1) {
        return {
            ok: false,
            error: `A booking covers up to ${exports.MAX_PARTY_SIZE} people including you, so you can add ${exports.MAX_PARTY_SIZE - 1} more.`,
        };
    }
    const guests = [];
    for (const [i, entry] of raw.entries()) {
        const position = i + 1;
        if (!entry || typeof entry !== "object") {
            return { ok: false, error: `Guest ${position} is missing a name` };
        }
        const name = typeof entry.name === "string" ? entry.name.trim() : "";
        if (name.length < 2) {
            return { ok: false, error: `Give guest ${position} a name of at least 2 characters` };
        }
        if (name.length > MAX_NAME_LENGTH) {
            return { ok: false, error: `Guest ${position}'s name is too long (${MAX_NAME_LENGTH} characters max)` };
        }
        const kind = entry.kind === "KID" ? "KID" : "ADULT";
        if (kind === "KID") {
            if (!event.kids_allowed) {
                return { ok: false, error: "This session is adults only." };
            }
            /* Null is "the organiser has not decided", which is not the same as
               free. Refusing is the honest answer — charging nothing would be a
               guess about somebody else's money. */
            if (event.kid_price === null || event.kid_price === undefined) {
                return {
                    ok: false,
                    error: "An organiser has not set the entry for children on this session yet.",
                };
            }
        }
        guests.push({ name, kind });
    }
    return { ok: true, guests };
}
/** The smallest party that earns the group discount. */
exports.DISCOUNT_MIN_PARTY = 2;
/**
 * What a party owes, in paise.
 *
 * Integer paise throughout rather than a Float total: Razorpay works in paise,
 * and multiplying a Float price by a party size then rounding once at the end
 * accumulates error that a receipt cannot explain. Each unit price is rounded
 * to paise first, then multiplied.
 *
 * The volunteer rule is one place only — their own entry. Anyone they bring is
 * a participant and pays. That is the club's decision, and it is why this takes
 * `isVolunteer` rather than reading a role and deciding for itself.
 *
 * The group discount is a flat rupee amount off the whole total, applied once to
 * a booking covering two or more people. Not per head — a party of six gets the
 * same amount off as a party of two — and it comes off the booker's entry as
 * readily as off a guest's, because it is a discount on the booking rather than
 * on the extra people.
 */
function priceParty(input) {
    const { event, guests, isVolunteer } = input;
    const adults = 1 + guests.filter((g) => g.kind === "ADULT").length;
    const kids = guests.filter((g) => g.kind === "KID").length;
    const payingAdults = isVolunteer ? adults - 1 : adults;
    const partySize = adults + kids;
    const adultPaise = Math.round(event.price * 100);
    const kidPaise = event.kid_price === null ? 0 : Math.round(event.kid_price * 100);
    const grossPaise = payingAdults * adultPaise + kids * kidPaise;
    /*
     * Clamped at both ends.
     *
     * Never negative, so a discount stored as a negative number cannot be turned
     * into a surcharge; and never more than the total, so a discount larger than
     * the fee makes the booking free rather than owing the member money. A total
     * of zero is already handled everywhere as a free booking.
     */
    const configured = Math.round(Math.max(0, event.party_discount ?? 0) * 100);
    const discountPaise = partySize >= exports.DISCOUNT_MIN_PARTY ? Math.min(configured, grossPaise) : 0;
    return {
        partySize,
        adults,
        kids,
        payingAdults,
        grossPaise,
        discountPaise,
        amountPaise: grossPaise - discountPaise,
        adultPrice: event.price,
        kidPrice: event.kid_price,
    };
}
/**
 * How many places a party consumes.
 *
 * Children count — the club's decision, and the right one for a physical cap: a
 * child on the start line is a person to keep track of. A volunteer's own place
 * does not, matching the existing rule that crew are not participants; their
 * guests do.
 */
function seatCost(partySize, isVolunteer) {
    return Math.max(0, partySize - (isVolunteer ? 1 : 0));
}
