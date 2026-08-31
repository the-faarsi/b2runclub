/**
 * The club's name, in one place.
 *
 * It was previously spelled out in eleven files — the wordmark, the footer, the
 * waiver text, the Razorpay checkout, the calendar export, the share sheet. A
 * rename meant finding all of them, and a half-finished one is worse than none:
 * a waiver that names a different entity to the header is not a small cosmetic
 * problem.
 *
 * That is not hypothetical. The last rename missed five strings — share.ts,
 * razorpay.ts and two in About.tsx — so calendar invites and the payment sheet
 * carried a different club name to the header for a while. Anything
 * user-visible should read from here rather than repeat the words.
 */

/** Full legal-ish name, for waivers, invoices and anything formal. */
export const CLUB_NAME = "B2 Club";

/** Short name for prose. */
export const CLUB_SHORT = "B2 Club";

/** Wordmark, uppercased in the header. */
export const CLUB_WORDMARK = "B2 CLUB";

/** Monogram inside the gold plate. */
export const CLUB_MONOGRAM = "B2";

/**
 * Filename-safe slug for exports. Downloads used to be named "b-squared-…",
 * which outlived a rename and put the old name on every file an organiser sent
 * to an accountant.
 */
export const CLUB_SLUG = "b2club";

/**
 * The club's one-line tagline, for the About headline and the footer blurb.
 *
 * Here rather than typed into each of them, for the same reason the name is:
 * the previous one ("A running club that actually runs on time.") had drifted
 * into four files plus a database default, and changing it meant finding them.
 */
export const CLUB_TAGLINE = "Where fitness meets friendship.";
