import type { PaymentStatus } from "./types";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** The backend prices in INR (Razorpay amounts are paise). */
export function inr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** Auto-compacts for stat tiles: 1,284 / 12.9K / 4.2M. */
export function compact(n: number) {
  if (Math.abs(n) < 1000) return new Intl.NumberFormat("en-IN").format(n);
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

const DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function eventDate(iso: string) {
  return DATE.format(new Date(iso));
}

export function eventTime(iso: string) {
  return TIME.format(new Date(iso));
}

export function fullDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** Date parts for the calendar-chip on event cards. */
export function dateParts(iso: string) {
  const d = new Date(iso);
  return {
    day: d.getDate().toString().padStart(2, "0"),
    month: d.toLocaleString("en-IN", { month: "short" }).toUpperCase(),
    weekday: d.toLocaleString("en-IN", { weekday: "short" }).toUpperCase(),
  };
}

export function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now();
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return eventDate(iso);
}

/** Countdown to an upcoming event, or null once it has started. */
export function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Seconds as a results-sheet clock: 24:50, or 1:23:45 once it passes an hour.
 * Mirrors the backend's own formatter so a locally-edited row reads identically
 * to one that has come back from the server.
 */
export function secsToClock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Parses a finish time an organiser types in. Accepts "mm:ss", "h:mm:ss" and a
 * bare number of minutes, since all three are things people write on a clipboard.
 * Returns null for anything unparseable so the caller can refuse it.
 */
export function parseClock(input: string): number | null {
  const text = input.trim();
  if (!text) return null;

  const parts = text.split(":");
  if (parts.length > 3) return null;

  // A bare number means minutes — "45" is a 45-minute run, not 45 seconds.
  if (parts.length === 1) {
    const mins = Number(parts[0]);
    return Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : null;
  }

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  // Only the leading unit may exceed 59 — "75:00" is a valid 75-minute time.
  if (nums.slice(1).some((n) => n > 59)) return null;

  const secs =
    parts.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2];

  return secs > 0 ? Math.round(secs) : null;
}

/** Gap to the winner, the way a results sheet prints it. */
export function gapLabel(behindSecs: number | null): string | null {
  if (behindSecs === null || behindSecs <= 0) return null;
  return `+${secsToClock(behindSecs)}`;
}

export function minsToHm(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Status palette + icon/label pairing, so state never reads by colour alone. */
export const PAYMENT_META: Record<
  PaymentStatus,
  { label: string; icon: string; color: string; note: string }
> = {
  PAID: {
    label: "Paid",
    icon: "✓",
    color: "var(--color-paid)",
    note: "Payment captured — your ticket is live.",
  },
  FREE: {
    label: "Comped",
    icon: "★",
    color: "var(--color-free)",
    note: "No payment needed — your ticket is live.",
  },
  PENDING: {
    label: "Awaiting payment",
    icon: "◍",
    color: "var(--color-pending)",
    note: "Ticket unlocks once Razorpay confirms the payment.",
  },
  FAILED: {
    label: "Failed",
    icon: "!",
    color: "var(--color-failed)",
    note: "Payment did not go through. Contact an organiser.",
  },
};

/** A ticket only renders for PAID/FREE — see the backend ticket route. */
export function ticketReady(status: PaymentStatus) {
  return status === "PAID" || status === "FREE";
}

export const ROLE_META: Record<string, { label: string; tint: string }> = {
  ADMIN: { label: "Organiser", tint: "text-gold" },
  MEMBER: { label: "Member", tint: "text-ink-2" },
  VOLUNTEER: { label: "Volunteer", tint: "text-[color:var(--color-free)]" },
  VISITOR: { label: "Visitor", tint: "text-ink-3" },
};

/**
 * Normalises whatever was pasted into the Instagram field to a bare handle.
 *
 * Accepts a full profile URL, an @handle, or a plain handle, because that is
 * what people actually paste — a real record here held
 * "https://www.instagram.com/sp.aquatechie?utm_source=ig_web_button_share_sheet",
 * which rendered as "@https://www.instagram.com/..." and linked to
 * instagram.com/https://... Query strings are dropped with the rest of the URL.
 */
export function instagramHandle(value: string): string {
  const raw = value.trim();
  const fromUrl = raw.match(/instagram\.com\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : raw).replace(/^@+/, "");
}

/** Profile URL for whatever form the handle was stored in. */
export function instagramHref(value: string): string {
  return `https://instagram.com/${instagramHandle(value)}`;
}
