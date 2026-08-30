import type { ClubEvent } from "./types";
import { CLUB_NAME } from "./brand";

/* ── Add to calendar ──────────────────────────────────────── */

/** iCalendar wants UTC basic format: 20260816T110050Z */
function icsStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Long text fields must be escaped; commas and semicolons are delimiters. */
function icsEscape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

/**
 * Builds a single-event .ics file. Sessions have no explicit duration in the
 * schema, so a 2-hour block is assumed — long enough to be useful in a calendar
 * without pretending to know the real finish time.
 */
export function eventToIcs(event: ClubEvent, assumedHours = 2): string {
  const start = new Date(event.date_time);
  const end = new Date(start.getTime() + assumedHours * 3600_000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${CLUB_NAME}//Events//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@b2club.in`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `LOCATION:${icsEscape(event.location)}`,
    `DESCRIPTION:${icsEscape(
      `${event.type} with ${CLUB_NAME}.${
        event.price > 0 ? ` Entry ₹${event.price}.` : " Free to enter."
      } Bring your QR ticket.`,
    )}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Session starts in an hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // RFC 5545 requires CRLF line endings.
  return lines.join("\r\n");
}

export function downloadIcs(event: ClubEvent) {
  const blob = new Blob([eventToIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^\w]+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Share ────────────────────────────────────────────────── */

export type ShareOutcome = "shared" | "copied" | "failed";

/**
 * Uses the native share sheet on touch devices, and copies the link everywhere
 * else. Desktop browsers technically expose navigator.share but the sheet is a
 * poor fit there, and a copied link is what people actually expect.
 * Returns which happened so the caller can word the confirmation correctly.
 */
export async function shareEvent(event: ClubEvent): Promise<ShareOutcome> {
  const url = `${window.location.origin}/events/${event.id}`;
  const text = `${event.title} — ${event.location}`;

  const isTouch =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  if (isTouch && navigator.share) {
    try {
      await navigator.share({ title: event.title, text, url });
      return "shared";
    } catch (err) {
      // AbortError means the sheet was dismissed — not a failure worth reporting.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // Anything else: fall through and copy instead.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/* ── Ticket QR ────────────────────────────────────────────── */

/**
 * The ticket endpoint returns an HTML page with the QR inlined as a data URL;
 * pull it out so it can be saved on its own.
 */
export function extractQrDataUrl(ticketHtml: string): string | null {
  const match = ticketHtml.match(/src="(data:image\/png;base64,[^"]+)"/);
  return match ? match[1] : null;
}

export function downloadQr(dataUrl: string, eventTitle: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `ticket-${eventTitle.replace(/[^\w]+/g, "-").toLowerCase()}.png`;
  a.click();
}
