import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EventCard } from "../components/events";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Tabs,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isPast } from "../lib/format";
import type { ClubEvent, Registration } from "../lib/types";
import { useFetch } from "../lib/useFetch";

type Filter = "upcoming" | "past" | "all";

const FILTERS: Filter[] = ["upcoming", "past", "all"];

/**
 * "Open" means the same thing here as in the home page's "Open now" figure:
 * published *and* still to come. Deliberately stricter than the Upcoming tab,
 * which only checks the date — to an admin, a draft next Tuesday is upcoming
 * but not open, and the two numbers have to agree or the link lies.
 */
const isOpen = (e: ClubEvent) => e.status === "PUBLISHED" && !isPast(e.date_time);

export function Events() {
  const { isAdmin, canRegister } = useAuth();

  const loadEvents = useCallback(() => api.events(), []);
  const { data: events, loading, error, reload } = useFetch(loadEvents);

  // Members/volunteers get their registrations so cards can show ticket state.
  const loadRegs = useCallback(
    () => (canRegister ? api.myRegistrations() : Promise.resolve([] as Registration[])),
    [canRegister],
  );
  const { data: regs } = useFetch(loadRegs);

  /*
   * The tab and the highlight live in the URL rather than in local state, so
   * the home page's figures can link straight to a particular view of this
   * list — and so back/forward and a copied link both land where you expect.
   * Search and type stay local: they change per keystroke and have no business
   * in the history stack.
   */
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("filter") as Filter | null;
  const filter: Filter = fromUrl && FILTERS.includes(fromUrl) ? fromUrl : "upcoming";
  const highlightOpen = params.get("highlight") === "open";

  const setFilter = (next: Filter) => {
    const p = new URLSearchParams(params);
    p.set("filter", next);
    // Picking a tab means the reader is steering now, so the highlight that
    // came in from the home page steps aside. It would otherwise grey out the
    // entire Past tab, where nothing is open by definition.
    p.delete("highlight");
    setParams(p, { replace: true });
  };

  const clearHighlight = () => {
    const p = new URLSearchParams(params);
    p.delete("highlight");
    setParams(p, { replace: true });
  };

  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");

  const regByEvent = useMemo(() => {
    const map = new Map<string, Registration>();
    for (const r of regs ?? []) map.set(r.event_id, r);
    return map;
  }, [regs]);

  const types = useMemo(() => {
    const set = new Set((events ?? []).map((e) => e.type));
    return ["ALL", ...[...set].sort()];
  }, [events]);

  const counts = useMemo(() => {
    const all = events ?? [];
    return {
      upcoming: all.filter((e) => !isPast(e.date_time)).length,
      past: all.filter((e) => isPast(e.date_time)).length,
      all: all.length,
    };
  }, [events]);

  const visible = useMemo(() => {
    let list = [...(events ?? [])];

    if (filter === "upcoming") list = list.filter((e) => !isPast(e.date_time));
    if (filter === "past") list = list.filter((e) => isPast(e.date_time));
    if (type !== "ALL") list = list.filter((e) => e.type === type);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q),
      );
    }

    // Upcoming reads soonest-first; past reads most-recent-first.
    list.sort((a, b) => {
      const d = +new Date(a.date_time) - +new Date(b.date_time);
      return filter === "past" ? -d : d;
    });
    return list;
  }, [events, filter, type, query]);

  /** How many of the cards on screen the highlight actually picks out. */
  const highlighted = useMemo(
    () => (highlightOpen ? visible.filter(isOpen).length : 0),
    [highlightOpen, visible],
  );

  return (
    <Page>
      <PageScene variant="lattice" opacity={0.3} />
      <PageHeader
        eyebrow="The calendar"
        title="Events"
        description={
          isAdmin
            ? "You see drafts and archived events too — members only ever see published ones."
            : "Every published session, soonest first. Registration closes when the event starts."
        }
        action={
          isAdmin && (
            <Link to="/admin/events" className={buttonClass("outline", "md")}>
              Manage events
            </Link>
          )
        }
      />

      {/* Filters — one row above the grid */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "upcoming", label: "Upcoming", count: counts.upcoming },
            { value: "past", label: "Past", count: counts.past },
            { value: "all", label: "All", count: counts.all },
          ]}
        />

        <div className="relative ml-auto w-full sm:w-56">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            fill="none"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events"
            aria-label="Search events"
            className="pl-9"
          />
        </div>

        {types.length > 2 && (
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
            className="w-full sm:w-40"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === "ALL" ? "All types" : t}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Arriving from the home page's "Open now" figure. Without this line the
          faded cards just look broken, so say what is being picked out and give
          a one-click way out of it. */}
      {highlightOpen && !loading && !error && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gold/30 bg-gold/8 px-4 py-3">
          <span className="size-2 shrink-0 rounded-full bg-gold" aria-hidden />
          <p className="text-[13px] text-ink-2">
            {highlighted === 0 ? (
              "Nothing is open for entry right now."
            ) : (
              <>
                Highlighting{" "}
                <strong className="font-semibold text-ink">
                  {highlighted} open {highlighted === 1 ? "session" : "sessions"}
                </strong>{" "}
                — published and still to come.
              </>
            )}
          </p>
          <button
            onClick={clearHighlight}
            className="ml-auto rounded-lg px-2 py-1 text-[12px] font-semibold text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:decoration-gold"
          >
            Show all equally
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5">
              <div className="flex gap-4">
                <Skeleton className="size-16 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="mt-6 h-6 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<span aria-hidden>▲</span>}
            title={query || type !== "ALL" ? "Nothing matches that" : "No events here yet"}
            body={
              query || type !== "ALL"
                ? "Try a different search or clear the filters."
                : filter === "upcoming"
                  ? "Nothing on the board right now. Check back soon."
                  : "No past events on record."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((e, i) => (
            <EventCard
              key={e.id}
              event={e}
              index={i}
              registration={regByEvent.get(e.id)}
              showStatus={isAdmin}
              /* When nothing is open there is nothing to contrast against, so
                 fading the whole list would just look broken. The notice above
                 carries the message on its own in that case. */
              emphasis={
                !highlightOpen || highlighted === 0 ? "none" : isOpen(e) ? "match" : "muted"
              }
            />
          ))}
        </div>
      )}
    </Page>
  );
}
