/**
 * Party bookings: validating a guest list, pricing it, and working out how many
 * places it consumes.
 *
 * One module because the three questions have to agree. Pricing that counts a
 * volunteer's own place as free while capacity counts it as taken, or a guest
 * list the registration route accepts and the capacity check does not, are the
 * kind of mismatch that shows up as an oversold event on a Saturday morning.
 */

/**
 * Ceiling on a single booking, the member included.
 *
 * Six, chosen with the club rather than derived: it covers a family or a couple
 * of friends and stops one person taking half a session. Enforced server-side —
 * the form offers the same limit, but a limit that only exists in the form is
 * not a limit.
 */
export const MAX_PARTY_SIZE = 6;

/** Longest a guest name may be. Generous, but not a paste target. */
const MAX_NAME_LENGTH = 60;

export type GuestKind = "ADULT" | "KID";

export interface GuestInput {
    name: string;
    kind: GuestKind;
}

export interface GuestParseResult {
    ok: boolean;
    error?: string;
    /** The additional people, cleaned. Never includes the booker. */
    guests?: GuestInput[];
}

/**
 * Validates the extra people on a booking.
 *
 * The booker is deliberately not in this list and is never taken from the
 * request: their row is built from their account name by the caller. Accepting
 * it would let somebody book under a name that is not theirs, which defeats the
 * point of collecting names at all.
 */
export function parseGuests(
    raw: unknown,
    event: { kids_allowed: boolean; kid_price: number | null },
): GuestParseResult {
    if (raw === undefined || raw === null) return { ok: true, guests: [] };
    if (!Array.isArray(raw)) {
        return { ok: false, error: "The guest list must be a list" };
    }

    // The booker occupies one of the places, so this is the ceiling on extras.
    if (raw.length > MAX_PARTY_SIZE - 1) {
        return {
            ok: false,
            error: `A booking covers up to ${MAX_PARTY_SIZE} people including you, so you can add ${MAX_PARTY_SIZE - 1} more.`,
        };
    }

    const guests: GuestInput[] = [];
    for (const [i, entry] of raw.entries()) {
        const position = i + 1;
        if (!entry || typeof entry !== "object") {
            return { ok: false, error: `Guest ${position} is missing a name` };
        }

        const name = typeof (entry as any).name === "string" ? (entry as any).name.trim() : "";
        if (name.length < 2) {
            return { ok: false, error: `Give guest ${position} a name of at least 2 characters` };
        }
        if (name.length > MAX_NAME_LENGTH) {
            return { ok: false, error: `Guest ${position}'s name is too long (${MAX_NAME_LENGTH} characters max)` };
        }

        const kind = (entry as any).kind === "KID" ? "KID" : "ADULT";
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
export const DISCOUNT_MIN_PARTY = 2;

export interface PartyPrice {
    /** Everyone, the booker included. */
    partySize: number;
    adults: number;
    kids: number;
    /** Adults who actually pay — one fewer when the booker is a volunteer. */
    payingAdults: number;
    /** Before the group discount, so a receipt can show what came off. */
    grossPaise: number;
    /** What the group discount actually took off, in paise. */
    discountPaise: number;
    /** Net of the discount. This is what gets charged. */
    amountPaise: number;
    adultPrice: number;
    kidPrice: number | null;
}

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
export function priceParty(input: {
    event: { price: number; kid_price: number | null; party_discount?: number | null };
    guests: GuestInput[];
    isVolunteer: boolean;
}): PartyPrice {
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
    const discountPaise = partySize >= DISCOUNT_MIN_PARTY ? Math.min(configured, grossPaise) : 0;

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
export function seatCost(partySize: number, isVolunteer: boolean): number {
    return Math.max(0, partySize - (isVolunteer ? 1 : 0));
}
