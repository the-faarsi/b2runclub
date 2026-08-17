import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import type { Registration } from "../lib/types";
import { useFetch } from "../lib/useFetch";

type Filter = "upcoming" | "past" | "all";

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

  const [filter, setFilter] = useState<Filter>("upcoming");
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
            />
          ))}
        </div>
      )}
    </Page>
  );
}
