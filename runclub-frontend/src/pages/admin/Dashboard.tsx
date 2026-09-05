import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarList,
  ChartCard,
  DataTable,
  HeroFigure,
  StatTile,
  StatusBar,
  TableToggle,
  type StatusSegment,
} from "../../components/charts";
import { ChartIcon, DownloadIcon, UsersIcon } from "../../components/icons";
import { Page, PageHeader } from "../../components/layout";
import { PageScene } from "../../components/scene3d";
import { AnimatedNumber, ProgressRing, Reveal } from "../../components/motion";
import {
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from "../../components/ui";
import { HeroVideoPanel } from "../../components/heroVideoPanel";
import { MailerPanel } from "../../components/mailerPanel";
import { api } from "../../lib/api";
import { CLUB_SLUG } from "../../lib/brand";
import { buildXlsx, downloadXlsx } from "../../lib/xlsx";
import { compact, eventDate, inr, isPast } from "../../lib/format";
import { useFetch } from "../../lib/useFetch";

interface TurnoutRow {
  id: string;
  title: string;
  date_time: string;
  price: number;
  /** People expected, counted across every party on the roster. */
  total: number;
  /** People who can be scanned. */
  ticketed: number;
  /** Bookings, i.e. how many QR codes those people will present. */
  bookings: number;
  revenue: number;
}

export function AdminDashboard() {
  const toast = useToast();
  const loadFinance = useCallback(() => api.financialOverview(), []);
  const loadEvents = useCallback(() => api.events(), []);
  const loadPolls = useCallback(() => api.polls(), []);

  const finance = useFetch(loadFinance);
  const events = useFetch(loadEvents);
  const polls = useFetch(loadPolls);

  const [showRegTable, setShowRegTable] = useState(false);
  const [showPollTable, setShowPollTable] = useState(false);
  const [showTurnoutTable, setShowTurnoutTable] = useState(false);
  const [turnout, setTurnout] = useState<TurnoutRow[] | null>(null);
  const [turnoutError, setTurnoutError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  /**
   * Turnout per event. There is no aggregate endpoint, so this reads each
   * event's roster export and counts it — fine for a club-sized calendar, and
   * it reuses the only roster source the backend exposes.
   */
  const eventsForTurnout = useMemo(
    () => (events.data ?? []).filter((e) => e.status !== "DRAFT"),
    [events.data],
  );

  useEffect(() => {
    if (eventsForTurnout.length === 0) {
      setTurnout([]);
      return;
    }
    let cancelled = false;

    Promise.all(
      eventsForTurnout.map(async (e) => {
        /* The interactive roster, not the CSV export this used to parse: the
           export carries one line per booking with only the booker on it, so
           it cannot say how many people an event expects. */
        const rows = await api.eventRegistrations(e.id);
        /* Turnout is people, not rows. A row is one booking and can carry a
           party of six, so counting rows under-reported the field by exactly
           the guests. `party_size` falls back to 1 for a booking made before
           parties existed. */
        const heads = (r: (typeof rows)[number]) => r.guests?.length || r.party_size || 1;
        const live = rows.filter((r) => !r.blocked_at);
        return {
          id: e.id,
          title: e.title,
          date_time: e.date_time,
          price: e.price,
          total: live.reduce((n, r) => n + heads(r), 0),
          ticketed: live
            .filter((r) => r.status === "PAID" || r.status === "FREE")
            .reduce((n, r) => n + heads(r), 0),
          bookings: live.length,
          /* What was actually charged, not the entry fee times the number of
             rows: a party of three paid three fares on one booking. */
          revenue:
            live
              .filter((r) => r.status === "PAID")
              .reduce((sum, r) => sum + (r.amount_due_paise ?? Math.round(e.price * 100)), 0) / 100,
        };
      }),
    )
      .then((rows) => {
        if (!cancelled) setTurnout(rows.sort((a, b) => b.total - a.total));
      })
      .catch((err) => {
        if (!cancelled) {
          setTurnoutError(err instanceof Error ? err.message : "Could not load turnout");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventsForTurnout]);

  /**
   * One workbook covering every event, for accounting.
   *
   * Real .xlsx rather than the CSV this used to emit: the dates now arrive as
   * dates instead of text Excel re-guesses per locale, and the header is bold
   * and frozen.
   */
  const exportAll = async () => {
    setExporting(true);
    try {
      const parts = await Promise.all(
        (events.data ?? []).map(async (e) => {
          const rows = await api.roster(e.id);
          return rows.map((r) => [
            e.title,
            // A real Date, so Excel sorts and filters it as one.
            new Date(e.date_time),
            r.name,
            r.email,
            r.role_at_event,
            r.waiver_signed ? "Yes" : "No",
            r.status,
            r.payment_id,
          ]);
        }),
      );
      const rows = parts.flat();
      if (rows.length === 0) {
        toast("No registrations to export yet.", "info");
        return;
      }
      const blob = buildXlsx({
        header: [
          "Event",
          "Event Date",
          "Name",
          "Email",
          "Role",
          "Waiver Signed",
          "Payment Status",
          "Payment ID",
        ],
        rows,
        sheetName: "All rosters",
      });
      downloadXlsx(
        `${CLUB_SLUG}-all-rosters-${new Date().toISOString().slice(0, 10)}.xlsx`,
        blob,
      );
      toast(`Exported ${rows.length} registrations.`, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "err");
    } finally {
      setExporting(false);
    }
  };

  const f = finance.data;
  const allEvents = events.data ?? [];
  const upcoming = allEvents.filter(
    (e) => e.status === "PUBLISHED" && !isPast(e.date_time),
  ).length;
  const drafts = allEvents.filter((e) => e.status === "DRAFT").length;

  const totalRegs = f
    ? f.paid_count + f.pending_count + f.failed_count + f.volunteer_free_count
    : 0;

  /* Registration state: status palette, each with an icon + label so state
   * never reads by colour alone. */
  const segments: StatusSegment[] = f
    ? [
        { id: "paid", label: "Paid", value: f.paid_count, color: "var(--color-paid)", icon: "✓" },
        {
          id: "free",
          label: "Comped",
          value: f.volunteer_free_count,
          color: "var(--color-free)",
          icon: "★",
        },
        {
          id: "pending",
          label: "Awaiting payment",
          value: f.pending_count,
          color: "var(--color-pending)",
          icon: "◍",
        },
        {
          id: "failed",
          label: "Failed",
          value: f.failed_count,
          color: "var(--color-failed)",
          icon: "!",
        },
      ]
    : [];

  // Turnout per event, from the roster the club can already export.
  const pollBars = (polls.data ?? []).flatMap((p) =>
    p.options.map((o) => ({
      id: o.id,
      label: `${o.option_text}`,
      value: o.vote_count,
      meta: p.title,
    })),
  );

  const loading = finance.loading || events.loading;

  return (
    <Page>
      <PageScene variant="towers" opacity={0.2} />
      <PageHeader
        eyebrow="Organiser"
        title="Dashboard"
        description="Money in, registrations by state, and how the club is voting."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={exporting} onClick={exportAll}>
              <DownloadIcon className="size-3.5" />
              Export all rosters
            </Button>
            <Link to="/admin/members" className={buttonClass("ghost", "md")}>
              Members
            </Link>
            <Link to="/admin/events" className={buttonClass("ghost", "md")}>
              Events
            </Link>
            <Link to="/admin/polls" className={buttonClass("ghost", "md")}>
              Polls
            </Link>
            <Link to="/admin/collaborators" className={buttonClass("ghost", "md")}>
              Collaborators
            </Link>
            <Link to="/admin/founders" className={buttonClass("ghost", "md")}>
              Founders
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-10 w-32" />
            </Card>
          ))}
        </div>
      ) : finance.error ? (
        <Card>
          <ErrorState message={finance.error} onRetry={finance.reload} />
        </Card>
      ) : f ? (
        <>
          {/* Hero figure — exactly one per view */}
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_1fr]">
            <HeroFigure
              label="Revenue captured"
              value={inr(f.total_revenue)}
              countTo={f.total_revenue}
              countFormat={(v) => inr(Math.round(v))}
              caption={`From ${f.paid_count} paid registration${f.paid_count === 1 ? "" : "s"}`}
            />

            <StatTile
              label="Registrations"
              value={compact(totalRegs)}
              countTo={totalRegs}
              countFormat={(v) => compact(Math.round(v))}
              icon={<UsersIcon className="size-4" />}
              sub={`${f.paid_count} paid · ${f.volunteer_free_count} comped`}
              meter={totalRegs > 0 ? (f.paid_count + f.volunteer_free_count) / totalRegs : 0}
              accent="var(--color-mark)"
            />

            <StatTile
              label="Events live"
              value={compact(upcoming)}
              countTo={upcoming}
              countFormat={(v) => compact(Math.round(v))}
              icon={<ChartIcon className="size-4" />}
              sub={
                drafts > 0
                  ? `${drafts} draft${drafts === 1 ? "" : "s"} not yet published`
                  : "No drafts waiting"
              }
              accent="var(--color-paid)"
            />
          </div>

          {/*
            Head count, on its own and marked out.

            It is not another tile in the row above because it is not the same
            kind of number: those count bookings, this counts people, and one
            booking admits up to six. With 3 registrations covering 8 people
            there was nowhere on this page that said 8 — the club would have
            planned water, marshals and permits for 3.
          */}
          <Reveal className="mt-5">
            <div className="card border-gold/40 bg-gold/[0.05] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                <div className="min-w-0">
                  <p className="eyebrow flex items-center gap-2 text-gold">
                    <UsersIcon className="size-3.5" />
                    People attending
                  </p>
                  <p className="display mt-2 text-[clamp(38px,6vw,52px)] text-ink">
                    <AnimatedNumber
                      value={f.people_count}
                      format={(v) => compact(Math.round(v))}
                    />
                  </p>
                  {/* The guest figure names its noun. "5 of them are guests"
                      pointed grammatically at the bookings, not the people,
                      so the sentence could be read as 5 of 11 rather than
                      5 of 16. */}
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                    Across {totalRegs} booking{totalRegs === 1 ? "" : "s"}
                    {f.people_count > totalRegs && (
                      <>
                        , including {f.people_count - totalRegs} guest
                        {f.people_count - totalRegs === 1 ? "" : "s"} on other members' tickets
                      </>
                    )}
                    .
                  </p>
                </div>

                {/* The half of that head count who can actually be scanned. */}
                <div className="flex items-center gap-4">
                  <ProgressRing
                    value={f.people_count > 0 ? f.people_ticket_ready / f.people_count : 0}
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-ink">Ticket-ready</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
                      {f.people_ticket_ready} of {f.people_count} can be scanned
                      <br />
                      at the start line.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Payment attention row */}
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Awaiting payment"
              value={compact(f.pending_count)}
              accent="var(--color-pending)"
              sub="Razorpay has not confirmed these yet"
            />
            <StatTile
              label="Failed payments"
              value={compact(f.failed_count)}
              accent="var(--color-failed)"
              sub="Follow up with these members"
            />
            <StatTile
              label="Volunteers comped"
              value={compact(f.volunteer_free_count)}
              accent="var(--color-free)"
              sub="Marshals entered free"
            />
            <StatTile
              label="Avg. per paid entry"
              value={f.paid_count > 0 ? inr(f.total_revenue / f.paid_count) : "—"}
              accent="var(--color-mark)"
              sub="Revenue ÷ paid registrations"
            />
          </div>

          {/* Charts */}
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
            <ChartCard
              title="Registrations by payment state"
              subtitle={`${totalRegs} registration${totalRegs === 1 ? "" : "s"} across all events`}
              action={
                <TableToggle
                  showing={showRegTable}
                  onToggle={() => setShowRegTable((s) => !s)}
                />
              }
            >
              {showRegTable ? (
                <DataTable
                  columns={["State", "Count", "Share"]}
                  rows={segments.map((s) => [
                    s.label,
                    s.value,
                    totalRegs > 0 ? `${((s.value / totalRegs) * 100).toFixed(0)}%` : "0%",
                  ])}
                />
              ) : (
                <StatusBar segments={segments} />
              )}
            </ChartCard>

            <ChartCard
              title="How the club is voting"
              subtitle={
                pollBars.length > 0
                  ? "Votes per option across every open poll"
                  : "No open polls right now"
              }
              action={
                pollBars.length > 0 && (
                  <TableToggle
                    showing={showPollTable}
                    onToggle={() => setShowPollTable((s) => !s)}
                  />
                )
              }
            >
              {pollBars.length === 0 ? (
                <EmptyState
                  title="Nothing to measure"
                  body="Create a poll and the results land here."
                  action={
                    <Link to="/admin/polls" className={buttonClass("gold", "sm")}>
                      Create a poll
                    </Link>
                  }
                />
              ) : showPollTable ? (
                <DataTable
                  columns={["Option", "Poll", "Votes"]}
                  rows={pollBars.map((b) => [b.label, b.meta ?? "", b.value])}
                />
              ) : (
                <BarList data={pollBars} emptyLabel="No votes cast yet" />
              )}
            </ChartCard>
          </div>

          {/* Turnout per event */}
          <Reveal className="mt-5">
            <ChartCard
              title="Turnout per event"
              subtitle={
                turnout === null
                  ? "Reading rosters…"
                  : turnout.length === 0
                    ? "No published events yet"
                    : "People counted from each event's roster, parties included"
              }
              action={
                turnout && turnout.length > 0 && (
                  <TableToggle
                    showing={showTurnoutTable}
                    onToggle={() => setShowTurnoutTable((s) => !s)}
                  />
                )
              }
            >
              {turnoutError ? (
                <p className="py-6 text-center text-[13px] text-ink-3">{turnoutError}</p>
              ) : turnout === null ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="mt-2 h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : turnout.length === 0 ? (
                <EmptyState
                  icon={<UsersIcon className="size-5" />}
                  title="Nothing to count yet"
                  body="Publish an event and turnout shows up here."
                />
              ) : showTurnoutTable ? (
                <DataTable
                  columns={["Event", "People", "Bookings", "Ticketed", "Revenue"]}
                  rows={turnout.map((t) => [
                    `${t.title} · ${eventDate(t.date_time)}`,
                    t.total,
                    t.bookings,
                    t.ticketed,
                    inr(t.revenue),
                  ])}
                />
              ) : (
                <>
                  <BarList
                    data={turnout.map((t) => ({
                      id: t.id,
                      label: t.title,
                      value: t.total,
                      // Only reachable on hover, so nothing load-bearing goes
                      // here — a phone never sees it. The booking count lives
                      // in the table view, which is a tap away.
                      meta:
                        t.total === t.bookings
                          ? `${t.ticketed} ticketed`
                          : `${t.ticketed} ticketed · ${t.bookings} booking${t.bookings === 1 ? "" : "s"}`,
                    }))}
                    format={(v) => String(Math.round(v))}
                    // Spelled out on the figure itself: a bare "2" was read as
                    // two bookings when it meant two people, and this is the
                    // one place on the row that is always visible.
                    unit="people"
                    emptyLabel="Nobody registered yet"
                  />

                  {/* Ticketed share across all counted events */}
                  <div className="mt-6 flex items-center gap-4 border-t border-white/6 pt-5">
                    <ProgressRing
                      value={
                        turnout.reduce((s, t) => s + t.total, 0) > 0
                          ? turnout.reduce((s, t) => s + t.ticketed, 0) /
                            turnout.reduce((s, t) => s + t.total, 0)
                          : 0
                      }
                    />
                    <div>
                      <p className="text-[13px] font-semibold text-ink">Ticket-ready rate</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
                        {turnout.reduce((s, t) => s + t.ticketed, 0)} of{" "}
                        {turnout.reduce((s, t) => s + t.total, 0)} people can be scanned at the
                        start line.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </ChartCard>
          </Reveal>

          {/* Event shortcuts */}
          <div className="mt-5">
            <ChartCard
              title="Events"
              subtitle="Jump into a roster or edit the details"
              action={
                <Link
                  to="/admin/events"
                  className="tap text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-ink-2"
                >
                  Manage all
                </Link>
              }
            >
              {allEvents.length === 0 ? (
                <EmptyState
                  title="No events yet"
                  body="Create the first session of the block."
                  action={
                    <Link to="/admin/events" className={buttonClass("gold", "sm")}>
                      Create an event
                    </Link>
                  }
                />
              ) : (
                <DataTable
                  columns={["Event", "Status", "Entry", "Date"]}
                  rows={allEvents
                    .slice()
                    .sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time))
                    .slice(0, 6)
                    .map((e) => [
                      e.title,
                      e.status,
                      e.price === 0 ? "Free" : inr(e.price),
                      new Date(e.date_time).toLocaleDateString("en-IN"),
                    ])}
                />
              )}
            </ChartCard>
          </div>

          {/* Site settings. Two panels side by side on wide screens — both are
              configuration rather than reporting, so they read as a pair. */}
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {/* Email settings — reminders and reset links depend on this being live */}
            <MailerPanel />
            <HeroVideoPanel />
          </div>
        </>
      ) : null}
    </Page>
  );
}
