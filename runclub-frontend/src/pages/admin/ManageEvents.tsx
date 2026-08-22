import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../components/charts";
import { EventFormModal } from "../../components/eventForm";
import { DisciplineIcon, SearchIcon } from "../../components/icons";
import { Page, PageHeader } from "../../components/layout";
import { PageScene } from "../../components/scene3d";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  Spinner,
  Tabs,
  useToast,
} from "../../components/ui";
import { api, downloadText } from "../../lib/api";
import { eventTime, fullDate, inr, isPast, PAYMENT_META } from "../../lib/format";
import type { ClubEvent, EventStatus, RosterRow } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

const STATUS_TINT: Record<EventStatus, string> = {
  DRAFT: "var(--color-pending)",
  PUBLISHED: "var(--color-paid)",
  ARCHIVED: "var(--color-ink-3)",
};

type Filter = "all" | "PUBLISHED" | "DRAFT" | "ARCHIVED";

export function ManageEvents() {
  const toast = useToast();
  const load = useCallback(() => api.events(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ClubEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [rosterFor, setRosterFor] = useState<ClubEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClubEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const events = data ?? [];
  const visible = useMemo(() => {
    let list = filter === "all" ? events : events.filter((e) => e.status === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q),
      );
    }
    return list;
  }, [events, filter, query]);

  const counts = {
    all: events.length,
    PUBLISHED: events.filter((e) => e.status === "PUBLISHED").length,
    DRAFT: events.filter((e) => e.status === "DRAFT").length,
    ARCHIVED: events.filter((e) => e.status === "ARCHIVED").length,
  };

  const quickPublish = async (ev: ClubEvent) => {
    const next: EventStatus = ev.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      const res = await api.updateEvent(ev.id, { status: next });
      setData((prev) => (prev ?? []).map((e) => (e.id === ev.id ? res.event : e)));
      toast(next === "PUBLISHED" ? "Event published." : "Event moved back to draft.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update", "err");
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteEvent(confirmDelete.id);
      setData((prev) => (prev ?? []).filter((e) => e.id !== confirmDelete.id));
      toast("Event deleted along with its registrations.", "ok");
      setConfirmDelete(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete", "err");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page>
      <PageScene variant="lattice" opacity={0.2} />
      <PageHeader
        eyebrow="Organiser"
        title="Manage events"
        description="Create, publish and archive sessions. Members only ever see published events."
        action={
          <div className="flex gap-2">
            <Link to="/admin" className={buttonClass("ghost", "md")}>
              Dashboard
            </Link>
            <Link to="/admin/members" className={buttonClass("ghost", "md")}>
              Members
            </Link>
            <Button onClick={() => setCreating(true)}>New event</Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "PUBLISHED", label: "Published", count: counts.PUBLISHED },
            { value: "DRAFT", label: "Drafts", count: counts.DRAFT },
            { value: "ARCHIVED", label: "Archived", count: counts.ARCHIVED },
          ]}
        />

        <div className="relative ml-auto w-full sm:w-64">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <SearchIcon className="size-4" />
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, place or type"
            aria-label="Search events"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-3 w-1/2" />
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
            title={
              query
                ? "Nothing matches that search"
                : filter === "all"
                  ? "No events yet"
                  : `No ${filter.toLowerCase()} events`
            }
            body={
              query
                ? "Try a different title, place or discipline."
                : "Create a session and publish it when the details are settled."
            }
            action={<Button size="sm" onClick={() => setCreating(true)}>New event</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visible
            .slice()
            .sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time))
            .map((ev, i) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: Math.min(i * 0.04, 0.24) }}
              >
                <Card className="p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-gold" aria-hidden>
                          <DisciplineIcon type={ev.type} className="size-3.5" />
                        </span>
                        <Link
                          to={`/events/${ev.id}`}
                          className="tap text-[15px] font-semibold text-ink transition-colors hover:text-gold"
                        >
                          {ev.title}
                        </Link>
                        <Badge color={STATUS_TINT[ev.status]}>{ev.status}</Badge>
                        {isPast(ev.date_time) && <Badge>Past</Badge>}
                        {ev.full && <Badge color="var(--color-failed)">Full</Badge>}
                      </div>
                      <p className="mt-1.5 text-[13px] text-ink-3">
                        {fullDate(ev.date_time)} · {eventTime(ev.date_time)} · {ev.location} ·{" "}
                        {ev.price === 0 ? "Free" : inr(ev.price)}
                        {/* Organisers scanning the list need to see how full each
                            event is without opening it. */}
                        {ev.capacity != null && (
                          <>
                            {" · "}
                            <span className="tnum">
                              {ev.taken ?? 0}/{ev.capacity}
                            </span>{" "}
                            places
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRosterFor(ev)}>
                        Roster
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(ev)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={ev.status === "PUBLISHED" ? "ghost" : "gold"}
                        onClick={() => quickPublish(ev)}
                      >
                        {ev.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setConfirmDelete(ev)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
        </div>
      )}

      <EventFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(ev) => {
          setData((prev) => [...(prev ?? []), ev]);
          toast("Event created.", "ok");
        }}
      />

      <EventFormModal
        event={editing ?? undefined}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={(ev) => {
          setData((prev) => (prev ?? []).map((e) => (e.id === ev.id ? ev : e)));
          toast("Event updated.", "ok");
        }}
      />

      <RosterModal event={rosterFor} open={rosterFor !== null} onClose={() => setRosterFor(null)} />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this event?"
        subtitle={confirmDelete?.title}
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          This also deletes every registration attached to it, including issued tickets. It cannot
          be undone.
        </p>
        <div className="mt-6 flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>
            Keep it
          </Button>
          <Button variant="danger" className="flex-1" loading={deleting} onClick={remove}>
            Delete event
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

/* ── Roster ───────────────────────────────────────────────────
 * The backend only exposes the roster as a CSV export, so it is
 * fetched and parsed here to render in-app. */

function RosterModal({
  event,
  open,
  onClose,
}: {
  event: ClubEvent | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !event) return;
    let cancelled = false;
    setRows(null);
    setError(null);

    api
      .roster(event.id)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load roster");
      });

    return () => {
      cancelled = true;
    };
  }, [open, event]);

  const exportCsv = async () => {
    if (!event) return;
    try {
      const csv = await api.rosterCsv(event.id);
      downloadText(`roster_${event.title.replace(/\W+/g, "_").toLowerCase()}.csv`, csv);
      toast("Roster exported.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "err");
    }
  };

  const paid = rows?.filter((r) => r.status === "PAID" || r.status === "FREE").length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Roster"
      subtitle={event ? `${event.title} · ${fullDate(event.date_time)}` : undefined}
      size="lg"
    >
      {error ? (
        <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-3 text-[13px] text-ink-2">
          {error}
        </p>
      ) : rows === null ? (
        <div className="grid h-40 place-items-center">
          <Spinner className="size-5 text-ink-3" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody registered yet" body="Registrations will appear here." />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-ink-2">
              <span className="font-semibold text-ink">{rows.length}</span> registered ·{" "}
              <span className="font-semibold text-ink">{paid}</span> ticket-ready
            </p>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>

          <div className="max-h-[46vh] overflow-y-auto">
            <DataTable
              columns={["Name", "Role", "Waiver", "Payment"]}
              rows={rows.map((r) => [
                `${r.name} · ${r.email}`,
                r.role_at_event,
                r.waiver_signed === "true" ? "Signed" : "—",
                PAYMENT_META[r.status]?.label ?? r.status,
              ])}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
