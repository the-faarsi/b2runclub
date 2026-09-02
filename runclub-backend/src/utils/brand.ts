/**
 * The club's name, in one place — the backend half.
 *
 * The frontend has had lib/brand.ts for exactly this reason for a while, with a
 * comment about a rename that missed five strings. The backend never got one,
 * and the same name was typed into twelve places: every email subject, the
 * email shell's wordmark, the From default and two race-day error messages. The
 * superscript rename found all twelve, which is the argument for this file.
 */

/** Full name, as it appears to a member. */
export const CLUB_NAME = "B² Club";

/**
 * The same, for HTML email bodies.
 *
 * A numeric entity rather than the raw character. The email shell declares
 * `<meta charset="utf-8">`, so the character would usually survive — but a
 * client that ignores the meta and guesses latin-1 renders it as "Â²", and an
 * entity cannot be misread. Plain-text alternatives use CLUB_NAME directly,
 * where an entity would be shown literally.
 */
export const CLUB_NAME_HTML = "B&#178; Club";

/** Uppercased wordmark beside the plate in the email header. */
export const CLUB_WORDMARK_HTML = "B&#178; CLUB";

/** Monogram inside the gold plate in the email header. */
export const CLUB_MONOGRAM_HTML = "B&#178;";
