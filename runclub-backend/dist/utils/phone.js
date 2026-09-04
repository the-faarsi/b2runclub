"use strict";
/**
 * Phone numbers, normalised to E.164 before they touch the database.
 *
 * Stored in one shape only, because these are looked up and compared: the same
 * member typing "9876543210" at signup and "+91 98765 43210" on their profile
 * must not end up as two different numbers.
 *
 * Normalising only. Numbers are not verified — the club has no sender to put a
 * code on — so this is about keeping the column tidy, not about proving
 * anything.
 *
 * India is the default country — the club runs in Chennai and Madurai and every
 * member so far has an Indian number — but an explicitly dialled +<cc> is kept
 * as given, so an overseas member is not silently rewritten into +91.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalisePhone = normalisePhone;
const DEFAULT_COUNTRY_CODE = "91";
/** E.164: a leading +, then 8–15 digits, first of which is not 0. */
const E164 = /^\+[1-9]\d{7,14}$/;
/** Indian mobile numbers are ten digits and begin 6, 7, 8 or 9. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
/**
 * Normalises whatever the member typed.
 *
 * Accepts spaces, hyphens, brackets and a leading 0 or 00, because those are
 * how people actually write numbers down.
 */
function normalisePhone(input) {
    if (typeof input !== "string" || !input.trim()) {
        return { ok: false, error: "Enter your phone number" };
    }
    const raw = input.trim();
    // Keep a note of whether the country code was dialled explicitly before
    // stripping punctuation — "+" is the only thing distinguishing "+91…" from
    // a national number that happens to start with 91.
    const explicitCountry = raw.startsWith("+") || raw.startsWith("00");
    let digits = raw.replace(/[^\d]/g, "");
    if (raw.startsWith("00"))
        digits = digits.slice(2);
    if (!digits)
        return { ok: false, error: "That does not look like a phone number" };
    let e164;
    if (explicitCountry) {
        e164 = `+${digits}`;
    }
    else if (INDIAN_MOBILE.test(digits)) {
        e164 = `+${DEFAULT_COUNTRY_CODE}${digits}`;
    }
    else if (digits.length === 11 && digits.startsWith("0") && INDIAN_MOBILE.test(digits.slice(1))) {
        // The trunk prefix people still write out of habit.
        e164 = `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
    }
    else if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
        e164 = `+${digits}`;
    }
    else {
        return {
            ok: false,
            error: "Enter a 10-digit mobile number, or the full number with its country code",
        };
    }
    if (!E164.test(e164)) {
        return { ok: false, error: "That does not look like a phone number" };
    }
    // Only enforced for +91, where the rule is known. Other countries vary far
    // too much to guess at, and a false rejection is worse than a loose one.
    if (e164.startsWith(`+${DEFAULT_COUNTRY_CODE}`)) {
        const national = e164.slice(1 + DEFAULT_COUNTRY_CODE.length);
        if (!INDIAN_MOBILE.test(national)) {
            return { ok: false, error: "Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9" };
        }
    }
    return { ok: true, e164 };
}
