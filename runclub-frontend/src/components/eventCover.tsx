import { cn, eventTime, fullDate } from "../lib/format";
import type { ClubEvent } from "../lib/types";
import { CalendarIcon, PinIcon } from "./icons";

/**
 * An event's cover image, as the background of whatever surface it sits in.
 *
 * One component rather than the same img-plus-gradient in five places: the
 * detail hero, the event card, the calendar row, the ticket row and the home
 * page spotlight all need it, and a scrim that drifts out of step between them
 * is how text ends up unreadable on one of them.
 *
 * The parent must be `relative` and clip its overflow.
 */
export function EventCoverBackdrop({
  url,
  /** How hard to dim it. Cards carry small text over the whole surface, so they
   *  need much more scrim than a hero where the type sits in one corner. */
  scrim = "card",
  className,
}: {
  url: string | null | undefined;
  scrim?: "card" | "hero" | "row";
  className?: string;
}) {
  if (!url) return null;

  /*
   * These were much heavier — the card sat at 0.93/0.86/0.78, which measured a
   * comfortable 5.6:1 behind the title but showed the photograph only as a
   * faint tone. Since the point is for the cover to be seen, they are now set
   * near the legibility floor instead of far above it.
   *
   * Chosen by measurement, not taste: over a deliberately bright image (mean
   * channel ~215, the worst case for light text) the smallest text on each
   * surface still clears 4.5:1. Anything lighter starts failing that.
   */
  const overlay =
    scrim === "hero"
      ? "linear-gradient(to top, rgba(8,9,11,0.9) 0%, rgba(8,9,11,0.5) 42%, rgba(8,9,11,0.1) 100%)"
      : scrim === "row"
        ? "linear-gradient(to right, rgba(8,9,11,0.9) 0%, rgba(8,9,11,0.76) 55%, rgba(8,9,11,0.5) 100%)"
        : /* card: text runs across the whole face, so this cannot open up as
             far as the others — it lifts toward the top where the picture has
             the most room to read. */
          "linear-gradient(to top, rgba(8,9,11,0.84) 0%, rgba(8,9,11,0.76) 45%, rgba(8,9,11,0.64) 100%)";

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
      />
      <div className="absolute inset-0" style={{ background: overlay }} />
    </div>
  );
}

/**
 * When and where, as an icon row.
 *
 * Replaces the sentence this used to be ("Sunday, 30 August at Madurai. Entry is
 * ₹100…"), which buried the two facts people scan for in prose. Shared so the
 * hero and the no-cover title block cannot format them differently.
 */
export function EventMeta({
  event,
  className,
  size = "md",
}: {
  event: ClubEvent;
  className?: string;
  size?: "sm" | "md";
}) {
  const text = size === "sm" ? "text-[12.5px]" : "text-[13.5px]";
  const icon = size === "sm" ? "size-3" : "size-3.5";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5", text, "text-ink-2", className)}>
      <span className="inline-flex items-center gap-1.5">
        <CalendarIcon className={cn(icon, "shrink-0 text-gold")} />
        <span>
          {fullDate(event.date_time)} · {eventTime(event.date_time)}
        </span>
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <PinIcon className={cn(icon, "shrink-0 text-gold")} />
        <span className="truncate">{event.location}</span>
      </span>
    </div>
  );
}
