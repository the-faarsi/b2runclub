import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CancelRegistrationDialog } from "../components/cancelDialog";
import { RegisterDialog, TicketModal } from "../components/events";
import { EventFeedbackCard, FeedbackSummaryCard } from "../components/eventFeedback";
import { EventPhotoStrip } from "../components/eventPhotos";
import { EventReminders } from "../components/eventReminders";
import { EventResultsSheet, ResultsEditor } from "../components/eventResults";
import { EventRoster } from "../components/eventRoster";
import { RouteCard } from "../components/routeMap";
import { CalendarIcon, DisciplineIcon, ShareIcon, SparkIcon } from "../components/icons";
import { Page } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  ErrorState,
  Skeleton,
  useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  countdown,
  eventTime,
  fullDate,
  inr,
  isPast,
  PAYMENT_META,
  ticketReady,
} from "../lib/format";
import { useCountdown } from "../lib/motion";
import { downloadIcs, shareEvent } from "../lib/share";
import type { Registration } from "../lib/types";
import { useFetch } from "../lib/useFetch";

const EVENT_STATUS_TINT: Record<string, string> = {
  DRAFT: "var(--color-pending)",
  PUBLISHED: "var(--color-paid)",
  ARCHIVED: "var(--color-ink-3)",
};

export function EventDetail() {
  const { id = "" } = useParams();
  const { user, canRegister, isAdmin, role } = useAuth();
  const toast = useToast();

  const loadEvent = useCallback(() => api.event(id), [id]);
  const { data: event, loading, error, reload } = useFetch(loadEvent);

  const loadRegs = useCallback(
    () => (canRegister ? api.myRegistrations() : Promise.resolve([] as Registration[])),
    [canRegister],
  );
  const { data: regs, setData: setRegs } = useFetch(loadRegs);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const registration = (regs ?? []).find((r) => r.event_id === id);
  const past = event ? isPast(event.date_time) : false;
  const left = event ? countdown(event.date_time) : null;
  // Hooks must run unconditionally, so pass a harmless date before load.
  const remaining = useCountdown(event?.date_time ?? new Date(0).toISOString());
  /** Volunteers pay nothing; the backend sets their registration to FREE. */
  const comped = role === "VOLUNTEER";
  /** Who may open the event-day console — matches the backend's CREW list. */
  const isCrew = role === "ADMIN" || role === "VOLUNTEER";

  if (loading) {
    return (
      <Page>
      <PageScene variant="knot" opacity={0.24} />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-5 h-12 w-2/3" />
        <Skeleton className="mt-4 h-4 w-1/2" />
        <Skeleton className="mt-8 h-48 w-full rounded-2xl" />
      </Page>
    );
  }

  if (error || !event) {
    return (
      <Page>
        <Card>
          <ErrorState message={error ?? "Event not found"} onRetry={reload} />
        </Card>
        <div className="mt-6 text-center">
          <Link to="/events" className={buttonClass("ghost", "sm")}>
            ← Back to events
          </Link>
        </div>
      </Page>
    );
  }

  const facts = [
    { label: "Date", value: fullDate(event.date_time) },
    { label: "Start time", value: eventTime(event.date_time) },
    { label: "Location", value: event.location },
    { label: "Discipline", value: event.type },
    { label: "Entry", value: event.price === 0 ? "Free" : inr(event.price) },
    ...(event.capacity != null
      ? [
          {
            label: "Places",
            value: event.full
              ? `Full — ${event.capacity} taken`
              : `${event.spots_left} of ${event.capacity} left`,
          },
        ]
      : []),
  ];

  return (
    <Page>
      <Link
        to="/events"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-gold"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
          <path
            d="M19 12H5m6 6-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        All events
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* ── Main ─────────────────────────────────────── */}
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/8 px-3 py-1">
              <span className="text-[11px] text-gold" aria-hidden>
                <DisciplineIcon type={event.type} className="size-3.5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
                {event.type}
              </span>
            </span>

            {isAdmin && event.status !== "PUBLISHED" && (
              <Badge color={EVENT_STATUS_TINT[event.status]}>{event.status}</Badge>
            )}

            {past ? (
              <Badge>Finished</Badge>
            ) : left ? (
              <Badge color="var(--color-gold)">Starts in {left}</Badge>
            ) : null}
          </div>

          <h1 className="display mt-5 text-[clamp(32px,5.5vw,52px)]">{event.title}</h1>

          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            {fullDate(event.date_time)} · {eventTime(event.date_time)} at {event.location}.
            {event.price === 0
              ? " Free to enter."
              : ` Entry is ${inr(event.price)}, paid at registration.`}
          </p>

          {/* The organiser's brief. Newlines are preserved — people write lists. */}
          {event.description && (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">
              {event.description}
            </p>
          )}

          {/* Live countdown — ticks every second */}
          {!past && !remaining.done && (
            <div className="mt-7 flex flex-wrap gap-2.5">
              {[
                { v: remaining.days, l: "days" },
                { v: remaining.hours, l: "hrs" },
                { v: remaining.minutes, l: "min" },
                { v: remaining.seconds, l: "sec" },
              ].map((unit) => (
                <div
                  key={unit.l}
                  className="min-w-[72px] rounded-xl border border-gold/20 bg-gold/6 px-3 py-2.5 text-center"
                >
                  <p className="display tnum text-[26px] leading-none text-gold">
                    {String(unit.v).padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
                    {unit.l}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Secondary actions */}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadIcs(event)}>
              <CalendarIcon className="size-3.5" />
              Add to calendar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const outcome = await shareEvent(event);
                toast(
                  outcome === "copied"
                    ? "Link copied to your clipboard."
                    : outcome === "shared"
                      ? "Shared."
                      : "Could not share — copy the address bar instead.",
                  outcome === "failed" ? "err" : "ok",
                );
              }}
            >
              <ShareIcon className="size-3.5" />
              Share
            </Button>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f.label} className="bg-surface p-4">
                <p className="eyebrow">{f.label}</p>
                <p className="mt-1.5 text-[15px] font-medium text-ink">{f.value}</p>
              </div>
            ))}
          </div>

          {/* The course, from the attached GPX. Organisers can upload one here. */}
          <RouteCard event={event} isAdmin={isAdmin} />

          {/* Published results, once an organiser has entered times */}
          {past && <EventResultsSheet event={event} />}

          {/* Photos tagged to this event */}
          <EventPhotoStrip event={event} />

          {/*
            Feedback is only meaningful after the fact, and only from someone who
            was on the roster — the backend enforces both.
          */}
          {past && registration && <EventFeedbackCard event={event} />}

          {/* Organisers see who is coming, and can bar someone */}
          {isAdmin && <EventRoster event={event} />}
          {isAdmin && past && <ResultsEditor event={event} />}
          {isAdmin && past && <FeedbackSummaryCard event={event} />}
          {isAdmin && <EventReminders event={event} />}

          <Card className="mt-6 p-5">
            <h2 className="text-[15px] font-semibold text-ink">On the day</h2>
            <ul className="mt-3 space-y-2.5">
              {[
                "Arrive 15 minutes early for the briefing and bag drop.",
                "Bring your QR ticket — screenshots are fine, we scan at the start line.",
                "Carry water and your own nutrition for anything over 10 km.",
                "Marshals wear gold bibs. Follow their calls at junctions.",
              ].map((line) => (
                <li key={line} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gold" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* ── Action rail ──────────────────────────────── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow">Entry</span>
              {/* Volunteers are comped by the backend, so show what they will
                  actually pay rather than the sticker price. */}
              {comped && event.price > 0 ? (
                <span className="flex items-baseline gap-2">
                  <span className="text-[15px] text-ink-3 line-through">{inr(event.price)}</span>
                  <span className="display text-3xl text-[color:var(--color-free)]">Free</span>
                </span>
              ) : (
                <span className="display text-3xl">
                  {event.price === 0 ? "Free" : inr(event.price)}
                </span>
              )}
            </div>

            {comped && event.price > 0 && (
              <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-2">
                <SparkIcon className="mt-0.5 size-3.5 shrink-0 text-[color:var(--color-free)]" />
                Comped as a club volunteer — you marshal, you don't pay.
              </p>
            )}

            <div className="hairline my-5" />

            {registration ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold"
                    style={{
                      background: `${PAYMENT_META[registration.status].color}26`,
                      color: PAYMENT_META[registration.status].color,
                    }}
                  >
                    {PAYMENT_META[registration.status].icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink">
                      {PAYMENT_META[registration.status].label}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      Registered as {registration.role_at_event.toLowerCase()}
                    </p>
                  </div>
                </div>

                <p className="text-[13px] leading-relaxed text-ink-3">
                  {PAYMENT_META[registration.status].note}
                </p>

                {registration.blocked_at ? (
                  <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
                    An organiser has removed you from this event, so your ticket is no longer
                    valid. Ask them in the forum if you think that's a mistake.
                  </p>
                ) : ticketReady(registration.status) ? (
                  <Button className="w-full" onClick={() => setTicketOpen(true)}>
                    View QR ticket
                  </Button>
                ) : (
                  <Link to="/tickets" className={buttonClass("outline", "md", "w-full")}>
                    Track in my tickets
                  </Link>
                )}

                {/* Give up the spot — hidden once the event has started */}
                {!past && !registration.blocked_at && (
                  <button
                    onClick={() => setCancelOpen(true)}
                    className="w-full pt-1 text-center text-[12px] text-ink-3 transition-colors hover:text-[color:var(--color-failed)]"
                  >
                    Cancel my registration
                  </button>
                )}
              </div>
            ) : past ? (
              <p className="text-[13px] leading-relaxed text-ink-3">
                This event has already run. Check the calendar for the next one.
              </p>
            ) : event.status !== "PUBLISHED" ? (
              <p className="text-[13px] leading-relaxed text-ink-3">
                Registration opens once an organiser publishes this event.
              </p>
            ) : !user ? (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-ink-3">
                  Sign in as a member or volunteer to take a spot.
                </p>
                <Link
                  to="/login"
                  state={{ from: `/events/${event.id}` }}
                  className={buttonClass("gold", "md", "w-full")}
                >
                  Sign in to register
                </Link>
                <Link to="/signup" className={buttonClass("ghost", "sm", "w-full")}>
                  Create an account
                </Link>
              </div>
            ) : /*
                 A full event says so up front instead of letting someone fill in
                 the waiver and then be refused. Volunteers are exempt from the cap
                 on the backend, so they still get the register button.
               */
            event.full && role !== "VOLUNTEER" ? (
              <div className="space-y-3">
                <Button className="w-full" disabled>
                  Fully booked
                </Button>
                <p className="text-center text-[11.5px] leading-relaxed text-ink-3">
                  All {event.capacity} places are taken. Registrations sometimes free up —
                  check back, or ask an organiser in the forum about a waiting list.
                </p>
              </div>
            ) : canRegister ? (
              <div className="space-y-3">
                <Button className="w-full" onClick={() => setDialogOpen(true)}>
                  Register
                </Button>
                {event.spots_left != null && event.spots_left <= 5 && (
                  <p className="text-center text-[12px] font-medium text-[color:var(--color-pending)]">
                    Only {event.spots_left} {event.spots_left === 1 ? "place" : "places"} left
                  </p>
                )}
                <p className="text-center text-[11px] leading-relaxed text-ink-3">
                  Waiver and emergency contact required.
                </p>
              </div>
            ) : (
              // The backend restricts registration to MEMBER and VOLUNTEER.
              <p className="text-[13px] leading-relaxed text-ink-3">
                {isAdmin
                  ? "Organiser accounts can't register — you're running this one."
                  : "Visitor accounts can't register. Ask an organiser to upgrade you to member."}
              </p>
            )}

            {/* Crew console. Volunteers scan at the start line, so they get it too. */}
            {isCrew && (
              <>
                <div className="hairline my-5" />
                <Link
                  to={`/raceday/${event.id}`}
                  className={buttonClass("outline", "md", "w-full")}
                >
                  Open event-day console
                </Link>
                <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-3">
                  Ticket scanning, marshal posts and checkpoint tracking.
                </p>
              </>
            )}

            {isAdmin && (
              <>
                <div className="hairline my-5" />
                <Link to="/admin/events" className={buttonClass("outline", "sm", "w-full")}>
                  Edit event & roster
                </Link>
              </>
            )}
          </Card>

          <p className="mt-4 px-2 text-[11px] leading-relaxed text-ink-3">
            Cancellations up to 24 hours before the start are handled by an organiser in the forum.
          </p>
        </div>
      </div>

      <RegisterDialog
        event={event}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onDone={(reg) => {
          // Merge in the new registration so the rail updates without a refetch.
          setRegs((prev) => [...(prev ?? []), { ...reg, event }]);
          if (ticketReady(reg.status)) {
            toast("Ticket issued — find it under My tickets.", "ok");
          }
        }}
      />

      <TicketModal
        registration={registration ? { ...registration, event } : null}
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
      />

      <CancelRegistrationDialog
        registration={registration ? { ...registration, event } : null}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={(id) => setRegs((prev) => (prev ?? []).filter((r) => r.id !== id))}
      />
    </Page>
  );
}
