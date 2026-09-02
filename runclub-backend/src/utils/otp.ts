import crypto from "crypto";
import { JWT_SECRET } from "./secrets";

/**
 * One-time codes for proving an email address or a phone number.
 *
 * Six digits, because they are read off a phone screen and typed by hand. That
 * is only a million possibilities, so the strength has to come from the limits
 * around the code rather than its length:
 *
 *   - it expires in OTP_TTL_MINUTES,
 *   - it is single-use,
 *   - it allows OTP_MAX_ATTEMPTS wrong guesses and then dies,
 *   - only an HMAC of it is stored.
 *
 * HMAC rather than a bare SHA-256: a plain digest of a six-digit number is
 * reversed by trying all million, so a database dump would hand over every live
 * code. The HMAC cannot be computed at all without the server's key.
 *
 * Keyed off JWT_SECRET, which is already required at startup and already
 * catastrophic if leaked, rather than adding a second secret that a deployment
 * could forget to set. Rotating it invalidates outstanding codes, which is
 * harmless — the member asks for another.
 */

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between sends, so the endpoint cannot be used to spam somebody. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_LENGTH = 6;

/**
 * A fresh code.
 *
 * randomInt, not `Math.random()` and not `randomBytes % 1000000`: the first is
 * not cryptographically random, and the second is biased toward lower values
 * because 2^n is not a multiple of a million.
 */
export function generateCode(): string {
    return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/**
 * What gets stored.
 *
 * The channel and destination are folded into the message, so a hash is only
 * ever valid for the address it was issued against — a stored EMAIL hash cannot
 * be replayed as a PHONE one even if the six digits happen to match.
 */
export function hashCode(code: string, channel: string, destination: string): string {
    return crypto
        .createHmac("sha256", JWT_SECRET)
        .update(`${channel}:${destination.toLowerCase()}:${code}`)
        .digest("hex");
}

/** Constant-time comparison, so a wrong guess leaks nothing through timing. */
export function codeMatches(
    code: string,
    channel: string,
    destination: string,
    storedHash: string,
): boolean {
    const candidate = hashCode(code, channel, destination);
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(storedHash, "hex");
    // timingSafeEqual throws on a length mismatch, which would itself be a
    // signal; a malformed stored hash is simply "no match".
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/** Strips everything but digits, so "123 456" and "123-456" both work. */
export function cleanCode(input: unknown): string {
    return typeof input === "string" ? input.replace(/\D/g, "") : "";
}

export function expiryFromNow(): Date {
    return new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
}
