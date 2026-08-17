import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CancelRegistrationDialog } from "../components/cancelDialog";
import { RegisterDialog, TicketModal } from "../components/events";
import { EventFormModal } from "../components/eventForm";
import { DisciplineIcon, PlusIcon, TrackGraphic } from "../components/icons";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  cn,
  countdown,
  eventTime,
  fullDate,
  inr,
  isPast,
  PAYMENT_META,
  ticketReady,
} from "../lib/format";
import type { ClubEvent, Registration } from "../lib/types";
import { useFetch } from "../lib/useFetch";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Local YYYY-MM-DD key — avoids the UTC shift of toISOString(). */
function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Six weeks of cells covering the given month, Monday-first, including the
 * leading/trailing days from adjacent months so the grid never reflows.
 */
function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-based; shift so Monday === 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return {
      date,
      key: dayKey(date),
      inMonth: date.getMonth() === month,
    };
  });
}

export function Calendar() {
  const { canRegister, isAdmin } = useAuth();
  const toast = useToast();

  const loadEvents = useCallback(() => api.events(), []);
  const { data: events, loading, error, reload, setData: setEvents } = useFetch(loadEvents);

  const loadRegs = useCallback(
    () => (canRegister ? api.myRegistrations() : Promise.resolve([] as Registration[])),
    [canRegister],
  );
  const { data: regs, setData: setRegs } = useFetch(loadRegs);

  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedKey, setSelectedKey] = useState<string>(dayKey(today));
  const [registering, setRegistering] = useState<ClubEvent | null>(null);
  const [ticketFor, setTicketFor] = useState<Registration | null>(null);
  /** Day key an organiser is creating an event on, or null when closed. */
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Registration | null>(null);

  /** Only events a member could actually attend appear on the calendar. */
  const bookable = useMemo(
    () => (events ?? []).filter((e) => e.status === "PUBLISHED" || isAdmin),
    [events, isAdmin],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, ClubEvent[]>();
    for (const e of bookable) {
      const k = dayKey(new Date(e.date_time));
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));
    }
    return map;
  }, [bookable]);

  const regByEvent = useMemo(() => {
    const map = new Map<string, Registration>();
    for (const r of regs ?? []) map.set(r.event_id, r);
    return map;
  }, [regs]);

  const grid = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor]);
  const selectedEvents = byDay.get(selectedKey) ?? [];

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const step = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const jumpToToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedKey(dayKey(now));
  };

  /** Next upcoming bookable event, for the "jump to next" shortcut. */
  const nextEvent = useMemo(
    () =>
      bookable
        .filter((e) => !isPast(e.date_time) && e.status === "PUBLISHED")
        .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time))[0],
    [bookable],
  );

  const jumpToNext = useCallback(() => {
    if (!nextEvent) return;
    const d = new Date(nextEvent.date_time);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedKey(dayKey(d));
  }, [nextEvent]);

  // On first load, land on the next session rather than an empty "today", so
  // the page opens on something the user can actually act on. Runs once, and
  // never fights a manual selection.
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current || loading || !nextEvent) return;
    didAutoSelect.current = true;
    if (!byDay.has(selectedKey)) jumpToNext();
  }, [loading, nextEvent, byDay, selectedKey, jumpToNext]);

  const monthCount = grid.filter((c) => c.inMonth && byDay.has(c.key)).length;

  return (
    <Page>
      <PageScene variant="lattice" opacity={0.26} />
      <PageHeader
        eyebrow="Plan your block"
        title="Calendar"
        description={
          isAdmin
            ? "Pick a date to see what's on or schedule a new session there. Drafts are visible to you only."
            : "Pick a date to see what's on, then take your spot. Only published sessions are open for registration."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/events" className={buttonClass("ghost", "md")}>
              List view
            </Link>
            {nextEvent && (
              <Button variant="outline" onClick={jumpToNext}>
                Next session
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setCreatingOn(selectedKey)}>
                <PlusIcon className="size-3.5" />
                New event
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <Card className="p-6">
          <Skeleton className="h-6 w-40" />
          <div className="mt-6 grid grid-cols-7 gap-2">
            {Array.from({ length: 42 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </Card>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          {/* ── Month grid ─────────────────────────────── */}
          <Card className="p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="display text-xl">{monthLabel}</h2>
                <p className="mt-1 text-[12px] text-ink-3">
                  {monthCount === 0
                    ? "Nothing scheduled this month"
                    : `${monthCount} day${monthCount === 1 ? "" : "s"} with sessions`}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => step(-1)}
                  aria-label="Previous month"
                  className="grid size-9 place-items-center rounded-lg border border-white/10 text-ink-2 transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
                    <path
                      d="m14 6-6 6 6 6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  onClick={jumpToToday}
                  className="h-9 rounded-lg border border-white/10 px-3 text-[12px] font-medium text-ink-2 transition-colors hover:border-gold/40 hover:text-gold"
                >
                  Today
                </button>
                <button
                  onClick={() => step(1)}
                  aria-label="Next month"
                  className="grid size-9 place-items-center rounded-lg border border-white/10 text-ink-2 transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
                    <path
                      d="m10 6 6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="pb-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3"
                >
                  <span className="hidden sm:inline">{w}</span>
                  <span className="sm:hidden">{w[0]}</span>
                </div>
              ))}

              {grid.map((cell) => {
                const dayEvents = byDay.get(cell.key) ?? [];
                const isToday = cell.key === dayKey(today);
                const isSelected = cell.key === selectedKey;
                const has = dayEvents.length > 0;
                const allPast = has && dayEvents.every((e) => isPast(e.date_time));
                const mine = dayEvents.some((e) => regByEvent.has(e.id));

                return (
                  <button
                    key={cell.key}
                    onClick={() => setSelectedKey(cell.key)}
                    aria-label={`${fullDate(cell.date.toISOString())}${
                      has ? `, ${dayEvents.length} session` : ", no sessions"
                    }`}
                    aria-pressed={isSelected}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center rounded-lg border transition-all duration-200",
                      isSelected
                        ? "border-gold bg-gold/12"
                        : has
                          ? "border-gold/25 bg-gold/6 hover:border-gold/50"
                          : "border-white/6 hover:border-white/16 hover:bg-white/4",
                      !cell.inMonth && "opacity-35",
                    )}
                  >
                    <span
                      className={cn(
                        "tnum text-[13px] font-semibold sm:text-[14px]",
                        isSelected || has ? "text-ink" : "text-ink-2",
                      )}
                    >
                      {cell.date.getDate()}
                    </span>

                    {isToday && (
                      <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-gold">
                        Today
                      </span>
                    )}

                    {/* Event pips — capped at three, then a count */}
                    {has && (
                      <span className="absolute bottom-1.5 flex items-center gap-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className={cn(
                              "size-1 rounded-full",
                              allPast ? "bg-ink-3" : "bg-gold",
                            )}
                            aria-hidden
                          />
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="ml-0.5 text-[8px] font-bold text-gold">
                            +{dayEvents.length - 3}
                          </span>
                        )}
                      </span>
                    )}

                    {/* Registered marker */}
                    {mine && (
                      <span
                        className="absolute right-1 top-1 size-1.5 rounded-full bg-[color:var(--color-paid)]"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/6 pt-4">
              {[
                { c: "bg-gold", l: "Session scheduled" },
                { c: "bg-ink-3", l: "Already run" },
                { c: "bg-[color:var(--color-paid)]", l: "You're registered" },
              ].map((x) => (
                <span key={x.l} className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <span className={cn("size-1.5 rounded-full", x.c)} aria-hidden />
                  {x.l}
                </span>
              ))}
            </div>
          </Card>

          {/* ── Selected day ───────────────────────────── */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5 sm:p-6">
              <p className="eyebrow text-gold">Selected</p>
              <h3 className="display mt-2 text-[19px]">
                {fullDate(new Date(selectedKey + "T00:00:00").toISOString())}
              </h3>

              <div className="hairline my-5" />

              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                >
                  {selectedEvents.length === 0 ? (
                    <EmptyState
                      icon={<TrackGraphic className="h-10 w-16" />}
                      title="Nothing on this day"
                      body={
                        isAdmin
                          ? "Schedule a session on this date, or jump to the next one."
                          : "Pick a highlighted date, or jump to the next session."
                      }
                      action={
                        <div className="flex flex-wrap justify-center gap-2">
                          {isAdmin && (
                            <Button size="sm" onClick={() => setCreatingOn(selectedKey)}>
                              <PlusIcon className="size-3.5" />
                              Create event here
                            </Button>
                          )}
                          {nextEvent && (
                            <Button size="sm" variant="outline" onClick={jumpToNext}>
                              Next session
                            </Button>
                          )}
                        </div>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {selectedEvents.map((ev) => {
                        const reg = regByEvent.get(ev.id);
                        const past = isPast(ev.date_time);
                        const left = countdown(ev.date_time);

                        return (
                          <div
                            key={ev.id}
                            className="rounded-xl border border-white/8 bg-surface-2/50 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-gold" aria-hidden>
                                <DisciplineIcon type={ev.type} className="size-3.5" />
                              </span>
                              <Link
                                to={`/events/${ev.id}`}
                                className="text-[15px] font-semibold text-ink transition-colors hover:text-gold"
                              >
                                {ev.title}
                              </Link>
                              {isAdmin && ev.status !== "PUBLISHED" && (
                                <Badge color="var(--color-pending)">{ev.status}</Badge>
                              )}
                            </div>

                            <p className="mt-1.5 text-[13px] text-ink-3">
                              {eventTime(ev.date_time)} · {ev.location} ·{" "}
                              {ev.price === 0 ? "Free" : inr(ev.price)}
                            </p>

                            {!past && left && (
                              <p className="tnum mt-1 text-[11px] font-semibold uppercase tracking-wider text-gold">
                                starts in {left}
                              </p>
                            )}

                            <div className="mt-4">
                              {reg ? (
                                <div className="space-y-2.5">
                                  <Badge
                                    color={PAYMENT_META[reg.status].color}
                                    icon={PAYMENT_META[reg.status].icon}
                                  >
                                    {PAYMENT_META[reg.status].label}
                                  </Badge>
                                  {reg.blocked_at ? (
                                    <p className="text-[12px] leading-relaxed text-ink-3">
                                      An organiser removed you from this event.
                                    </p>
                                  ) : ticketReady(reg.status) ? (
                                    <Button
                                      size="sm"
                                      className="w-full"
                                      onClick={() => setTicketFor({ ...reg, event: ev })}
                                    >
                                      View QR ticket
                                    </Button>
                                  ) : (
                                    <p className="text-[12px] leading-relaxed text-ink-3">
                                      {PAYMENT_META[reg.status].note}
                                    </p>
                                  )}
                                  {!past && !reg.blocked_at && (
                                    <button
                                      onClick={() => setCancelling({ ...reg, event: ev })}
                                      className="w-full text-center text-[11px] text-ink-3 transition-colors hover:text-[color:var(--color-failed)]"
                                    >
                                      Cancel registration
                                    </button>
                                  )}
                                </div>
                              ) : past ? (
                                <p className="text-[12px] text-ink-3">This session has run.</p>
                              ) : ev.status !== "PUBLISHED" ? (
                                <p className="text-[12px] text-ink-3">
                                  Not published — members can't see or register for this yet.
                                </p>
                              ) : canRegister ? (
                                <Button
                                  size="sm"
                                  className="w-full"
                                  onClick={() => setRegistering(ev)}
                                >
                                  Take this spot
                                </Button>
                              ) : isAdmin ? (
                                <p className="text-[12px] text-ink-3">
                                  You're organising — organisers don't register.
                                </p>
                              ) : (
                                <Link
                                  to="/login"
                                  state={{ from: "/calendar" }}
                                  className={buttonClass("gold", "sm", "w-full")}
                                >
                                  Sign in to register
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Organisers can stack another session onto the same day */}
                      {isAdmin && (
                        <button
                          onClick={() => setCreatingOn(selectedKey)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/14 py-3 text-[13px] font-medium text-ink-3 transition-colors hover:border-gold/45 hover:text-gold"
                        >
                          <PlusIcon className="size-3.5" />
                          Add another session on this date
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </Card>
          </div>
        </div>
      )}

      {registering && (
        <RegisterDialog
          event={registering}
          open
          onClose={() => setRegistering(null)}
          onDone={(reg) => {
            setRegs((prev) => [...(prev ?? []), { ...reg, event: registering }]);
            if (ticketReady(reg.status)) {
              toast("Ticket issued — find it under My tickets.", "ok");
            }
          }}
        />
      )}

      <TicketModal
        registration={ticketFor}
        open={ticketFor !== null}
        onClose={() => setTicketFor(null)}
      />

      <CancelRegistrationDialog
        registration={cancelling}
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onCancelled={(id) => setRegs((prev) => (prev ?? []).filter((r) => r.id !== id))}
      />

      {/* Organiser-only: schedule a session on the picked date. The route is
          already ADMIN-gated on the server for POST /api/events. */}
      {isAdmin && (
        <EventFormModal
          open={creatingOn !== null}
          defaultDate={creatingOn ?? undefined}
          onClose={() => setCreatingOn(null)}
          onSaved={(created) => {
            setEvents((prev) => [...(prev ?? []), created]);
            // Jump to the created event's day so it is immediately visible,
            // even if the organiser changed the date inside the form.
            const d = new Date(created.date_time);
            setCursor({ year: d.getFullYear(), month: d.getMonth() });
            setSelectedKey(dayKey(d));
            toast(
              created.status === "PUBLISHED"
                ? "Event created and published."
                : "Event created as a draft — publish it when you're ready.",
              "ok",
            );
          }}
        />
      )}
    </Page>
  );
}
