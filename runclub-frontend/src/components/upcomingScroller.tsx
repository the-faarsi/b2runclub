import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn, countdown, inr } from "../lib/format";
import type { ClubEvent } from "../lib/types";
import { EventCoverBackdrop, EventMeta } from "./eventCover";
import { DisciplineIcon } from "./icons";
import { Tilt } from "./tilt";
import { buttonClass, Card, Skeleton } from "./ui";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const arrowClass =
  "grid size-9 place-items-center rounded-lg border border-white/10 text-ink-2 transition-colors " +
  "hover:border-gold/40 hover:text-gold disabled:pointer-events-none disabled:opacity-30";

/** One session, as the spotlight panel. Unchanged from the single-card version. */
function SpotlightCard({ event, label }: { event: ClubEvent; label: string }) {
  return (
    <Tilt className="h-full">
      {/* card-glow, so the session reads as a distinct object over the hero
          video rather than a translucent panel floating in it. */}
      <Card className="speedlines card-glow group relative h-full overflow-hidden">
        {/* The event's own cover behind the spotlight, so the first thing on the
            page shows the session rather than a gradient. */}
        <EventCoverBackdrop url={event.cover_url} scrim="card" />
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full opacity-[0.15] blur-3xl"
          style={{ background: "var(--color-gold)" }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow text-gold">{label}</p>
            <h2 className="display mt-3 text-[clamp(26px,3.6vw,40px)]">{event.title}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className="text-gold" aria-hidden>
                  <DisciplineIcon type={event.type} className="size-4" />
                </span>
                {event.type}
              </span>
            </div>
            <EventMeta event={event} className="mt-2.5" />
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-4 lg:shrink-0">
            <div>
              <p className="eyebrow whitespace-nowrap">Starts in</p>
              <p className="display tnum mt-1.5 whitespace-nowrap text-[32px] text-gold">
                {countdown(event.date_time) ?? "now"}
              </p>
            </div>
            <div>
              <p className="eyebrow">Entry</p>
              <p className="display mt-1.5 whitespace-nowrap text-[32px]">
                {event.price === 0 ? "Free" : inr(event.price)}
              </p>
            </div>
            <Link
              to={`/events/${event.id}`}
              className={buttonClass("gold", "md", "mb-1 w-full sm:w-auto")}
            >
              Take a spot
            </Link>
          </div>
        </div>
      </Card>
    </Tilt>
  );
}

/**
 * The "Next up" spotlight, one panel per upcoming session.
 *
 * Horizontal rather than a vertical scroll box: a nested vertical scroller in
 * the middle of a page competes with the page's own scroll, and on a phone it
 * swallows the gesture entirely. Sideways snapping steps through the sessions
 * one at a time without touching the page scroll.
 */
export function UpcomingScroller({
  events,
  loading,
}: {
  events: ClubEvent[];
  loading: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: true });

  /*
   * Which panel is on screen, worked out from the panel centre nearest the
   * scrollport centre. Dividing scrollLeft by a panel width would need the gap
   * and the padding folded in and drifts by a pixel per panel; this needs
   * neither, and it agrees exactly with what `snap-center` does.
   */
  const sync = useCallback(() => {
    const el = trackRef.current;
    const panels = el ? (Array.from(el.children) as HTMLElement[]) : [];
    if (!el || panels.length === 0) return;

    const centre = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    panels.forEach((panel, i) => {
      const distance = Math.abs(panel.offsetLeft + panel.offsetWidth / 2 - centre);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });

    setActive(best);
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2,
    });
  }, []);

  // Re-measure when the list arrives and whenever the track resizes — a phone
  // turning sideways changes every panel width at once.
  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, events.length]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(sync);
  };

  /** Centres panel `i`, matching the snap position rather than fighting it. */
  const go = (i: number) => {
    const el = trackRef.current;
    const panel = el?.children[i] as HTMLElement | undefined;
    if (!el || !panel) return;
    el.scrollTo({
      left: panel.offsetLeft + panel.offsetWidth / 2 - el.clientWidth / 2,
      behavior: "smooth",
    });
  };

  if (loading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-10 w-2/3" />
        <Skeleton className="mt-3 h-4 w-1/3" />
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-ink-2">
          No published events right now — the organisers are drafting the next block.
        </p>
      </Card>
    );
  }

  const many = events.length > 1;

  return (
    <div>
      {/*
       * The negative margin cancels the padding, so a panel is exactly as wide
       * as the sections above and below it and the card's left edge stays on
       * the page's own gutter. The padding itself is headroom for card-glow's
       * halo: a scroll container clips to its padding box, and without it the
       * gold ring along the card edge would be sliced off.
       *
       * overflow-y is pinned to hidden because a container with overflow-x:auto
       * turns the other axis into a scroll container too, and a stray subpixel
       * would then hang a second scrollbar inside the section.
       */}
      <div
        ref={trackRef}
        onScroll={many ? onScroll : undefined}
        role="region"
        aria-label="Upcoming sessions"
        aria-live="off"
        tabIndex={many ? 0 : -1}
        className={cn(
          "no-scrollbar -mx-4 flex gap-4 overflow-y-hidden px-4 py-6",
          "rounded-[calc(var(--radius-card)+1rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
          many ? "snap-x snap-mandatory overflow-x-auto overscroll-x-contain" : "overflow-x-hidden",
        )}
      >
        {events.map((event, i) => (
          <div key={event.id} className="w-full shrink-0 snap-center">
            <SpotlightCard
              event={event}
              /* The first panel keeps the label the section is known by; the
                 rest say where you are, which the dots alone cannot on a phone
                 where they sit below the fold of the card. */
              label={i === 0 ? "Next up" : `${i + 1} of ${events.length}`}
            />
          </div>
        ))}
      </div>

      {many && (
        <div className="mt-1 flex items-center justify-between gap-4">
          {events.length <= 8 ? (
            <div className="flex items-center gap-2">
              {events.map((event, i) => (
                <button
                  key={event.id}
                  onClick={() => go(i)}
                  aria-label={`Show ${event.title}`}
                  aria-current={i === active}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === active ? "w-6 bg-gold" : "w-1.5 bg-white/25 hover:bg-white/45",
                  )}
                />
              ))}
            </div>
          ) : (
            /* Past a handful, a dot per session is a row of confetti. */
            <p className="eyebrow tnum">
              {active + 1} / {events.length}
            </p>
          )}

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => go(active - 1)}
              disabled={edges.start}
              aria-label="Previous session"
              className={arrowClass}
            >
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => go(active + 1)}
              disabled={edges.end}
              aria-label="Next session"
              className={arrowClass}
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
