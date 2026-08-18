import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ClockIcon, PinIcon, PlusIcon, UsersIcon } from "../components/icons";
import { Page } from "../components/layout";
import { QrScanner, scannerSupported } from "../components/qrScanner";
import {
  Avatar,
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Tabs,
  useToast,
} from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, eventTime, fullDate, relativeTime } from "../lib/format";
import type { CheckInResult, RaceDayDashboard } from "../lib/types";
import { useFetch } from "../lib/useFetch";

type Tab = "checkin" | "shifts" | "checkpoints";

/** How often the dashboard refreshes itself while the page is open. */
const POLL_MS = 15_000;

/**
 * The event-day console for organisers and volunteers.
 *
 * One page rather than several, because on the day the crew is holding a phone in
 * one hand: scanning, shift cover and checkpoint taps all need to be one tap away
 * from each other.
 */
export function RaceDay() {
  const { id = "" } = useParams();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("checkin");

  const load = useCallback(() => api.raceDayDashboard(id), [id]);
  const { data, loading, error, reload } = useFetch(load);

  // Keep the numbers live without the crew having to pull to refresh. Paused
  // while the tab is hidden so a phone in a pocket isn't polling all morning.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) reloadRef.current();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  if (loading && !data) {
    return (
      <Page>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-5 h-11 w-1/2" />
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <Card>
          <ErrorState message={error ?? "Could not load the event"} onRetry={reload} />
        </Card>
        <div className="mt-6 text-center">
          <Link to="/events" className={buttonClass("ghost", "sm")}>
            ← Back to events
          </Link>
        </div>
      </Page>
    );
  }

  const { event, turnout } = data;
  const pct = turnout.expected > 0 ? Math.round((turnout.checked_in / turnout.expected) * 100) : 0;

  return (
    <Page>
      <Link
        to={`/events/${event.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-gold"
      >
        ← {event.title}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-gold">Event day</p>
          <h1 className="display mt-2 text-[clamp(28px,4.4vw,44px)]">{event.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-3.5" />
              {fullDate(event.date_time)} · {eventTime(event.date_time)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PinIcon className="size-3.5" />
              {event.location}
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload}>
          Refresh
        </Button>
      </div>

      {/* ── Turnout ─────────────────────────────────────── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="eyebrow">Checked in</p>
          <p className="display mt-1.5 text-[34px] leading-none tnum text-gold">
            {turnout.checked_in}
            <span className="text-[16px] font-normal text-ink-3"> / {turnout.expected}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full bg-gold"
            />
          </div>
          <p className="mt-2 text-[11px] text-ink-3">{pct}% of ticket-ready runners</p>
        </Card>

        <Stat label="Still to arrive" value={turnout.no_show} note="ticket-ready, not scanned" />
        <Stat
          label="Awaiting payment"
          value={turnout.awaiting_payment}
          note="can't be checked in yet"
          tone={turnout.awaiting_payment > 0 ? "var(--color-pending)" : undefined}
        />
        <Stat
          label="Registered"
          value={turnout.registered}
          note={turnout.blocked > 0 ? `${turnout.blocked} blocked` : "on the roster"}
        />
      </div>

      <div className="mt-8">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "checkin", label: "Check-in", count: turnout.checked_in },
            { value: "shifts", label: "Shifts", count: data.shifts.length },
            { value: "checkpoints", label: "Checkpoints", count: data.checkpoints.length },
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === "checkin" && <CheckInPanel eventId={id} data={data} onChanged={reload} />}
        {tab === "shifts" && <ShiftsPanel eventId={id} isAdmin={isAdmin} onChanged={reload} />}
        {tab === "checkpoints" && (
          <CheckpointsPanel eventId={id} isAdmin={isAdmin} data={data} onChanged={reload} />
        )}
      </div>
    </Page>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone?: string;
}) {
  return (
    <Card className="p-5">
      <p className="eyebrow">{label}</p>
      <p
        className="display mt-1.5 text-[34px] leading-none tnum"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      <p className="mt-3 text-[11px] text-ink-3">{note}</p>
    </Card>
  );
}

/* ── Check-in ─────────────────────────────────────────────── */

type Feedback = {
  kind: "ok" | "repeat" | "err";
  title: string;
  body?: string;
};

function CheckInPanel({
  eventId,
  data,
  onChanged,
}: {
  eventId: string;
  data: RaceDayDashboard;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const supported = scannerSupported();

  /** Clears the banner after a moment so the scanner can keep working. */
  const flash = useCallback((f: Feedback) => {
    setFeedback(f);
    window.setTimeout(() => setFeedback((cur) => (cur === f ? null : cur)), 4500);
  }, []);

  const submit = useCallback(
    async (input: { registration_id?: string; qr_payload?: string }) => {
      setBusy(true);
      try {
        const res: CheckInResult = await api.checkIn({ ...input, event_id: eventId });
        flash(
          res.already_checked_in
            ? {
                kind: "repeat",
                title: `${res.name} was already in`,
                body: `Scanned ${relativeTime(res.attended_at)}.`,
              }
            : { kind: "ok", title: `${res.name} checked in`, body: "Send them through." },
        );
        onChanged();
      } catch (err) {
        // The backend distinguishes wrong event / blocked / unpaid, and each of
        // those messages tells the marshal what to actually do.
        flash({
          kind: "err",
          title: err instanceof ApiError ? err.message : "Check-in failed",
        });
      } finally {
        setBusy(false);
      }
    },
    [eventId, flash, onChanged],
  );

  const undo = async (registrationId: string, name: string) => {
    try {
      await api.undoCheckIn(registrationId);
      toast(`${name.split(" ")[0]}'s check-in undone`, "ok");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not undo", "err");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Scan tickets</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            {supported
              ? "Hold a member's QR ticket up to the camera. Scanning someone twice is harmless."
              : "This browser can't use the camera — type or paste ticket ids below."}
          </p>

          {supported && (
            <QrScanner
              className="mt-4"
              paused={busy || feedback !== null}
              onScan={(text) => void submit({ qr_payload: text })}
            />
          )}

          {/* Result banner — the only thing a marshal looks at */}
          <div className="mt-4 min-h-[76px]">
            <AnimatePresence mode="wait">
              {feedback && (
                <motion.div
                  key={feedback.title}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className={cn(
                    "rounded-2xl border px-4 py-3.5",
                    feedback.kind === "ok" &&
                      "border-[color:var(--color-paid)]/40 bg-[color:var(--color-paid)]/10",
                    feedback.kind === "repeat" &&
                      "border-[color:var(--color-pending)]/40 bg-[color:var(--color-pending)]/10",
                    feedback.kind === "err" &&
                      "border-[color:var(--color-failed)]/40 bg-[color:var(--color-failed)]/10",
                  )}
                  role="status"
                  aria-live="polite"
                >
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    <span aria-hidden>
                      {feedback.kind === "ok" ? "✓" : feedback.kind === "repeat" ? "◍" : "!"}
                    </span>
                    {feedback.title}
                  </p>
                  {feedback.body && (
                    <p className="mt-1 text-[12.5px] text-ink-2">{feedback.body}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hairline my-4" />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = manual.trim();
              if (!value) return;
              // Paste of a whole QR payload is handled too, not just a bare id.
              void submit(
                value.startsWith("{") ? { qr_payload: value } : { registration_id: value },
              );
              setManual("");
            }}
          >
            <Field
              label="Or enter a ticket id"
              htmlFor="manual-ticket"
              hint="From the member's ticket. Works when the camera won't."
            >
              <Input
                id="manual-ticket"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="43ae85c1-…"
              />
            </Field>
            <Button type="submit" className="mt-3 w-full" loading={busy} disabled={!manual.trim()}>
              Check in
            </Button>
          </form>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Live ticker */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/8 p-5">
            <h2 className="text-[15px] font-semibold text-ink">Just arrived</h2>
            <p className="mt-1 text-[12px] text-ink-3">
              Most recent scans first · refreshes every {POLL_MS / 1000}s
            </p>
          </div>

          {data.recent_check_ins.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="size-5" />}
              title="Nobody has scanned in yet"
              body="Check-ins appear here the moment a ticket is scanned."
            />
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {data.recent_check_ins.map((c) => (
                  <motion.li
                    key={c.registration_id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0"
                  >
                    <Avatar name={c.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium text-ink">{c.name}</span>
                        {c.role_at_event === "VOLUNTEER" && (
                          <Badge color="var(--color-free)">Marshal</Badge>
                        )}
                      </div>
                      <p className="text-[11.5px] text-ink-3">{relativeTime(c.attended_at)}</p>
                    </div>
                    <button
                      onClick={() => void undo(c.registration_id, c.name)}
                      className="shrink-0 text-[11.5px] text-ink-3 transition-colors hover:text-[color:var(--color-failed)]"
                    >
                      Undo
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>

        {/* Who is missing — the list the crew calls out near the start */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/8 p-5">
            <h2 className="text-[15px] font-semibold text-ink">Still to arrive</h2>
            <p className="mt-1 text-[12px] text-ink-3">
              {data.not_yet_in.length} ticket-ready {data.not_yet_in.length === 1 ? "runner" : "runners"}
            </p>
          </div>

          {data.not_yet_in.length === 0 ? (
            <div className="p-5">
              <p className="text-[13px] text-ink-2">
                Everyone with a ticket is in. Good to start.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {data.not_yet_in.map((r) => (
                <li
                  key={r.registration_id}
                  className="flex items-center gap-3 border-b border-white/5 px-5 py-2.5 last:border-0"
                >
                  <Avatar name={r.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{r.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void submit({ registration_id: r.registration_id })}
                  >
                    Check in
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── Shifts ───────────────────────────────────────────────── */

function ShiftsPanel({
  eventId,
  isAdmin,
  onChanged,
}: {
  eventId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const load = useCallback(() => api.shifts(eventId), [eventId]);
  const { data, loading, error, reload } = useFetch(load);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", location_note: "", capacity: "2" });
  const [busy, setBusy] = useState<string | null>(null);

  const shifts = data ?? [];
  const uncovered = shifts.filter((s) => s.open_slots > 0).length;

  const refresh = () => {
    reload();
    onChanged();
  };

  const create = async () => {
    if (!form.title.trim()) {
      toast("Give the post a name", "err");
      return;
    }
    setBusy("create");
    try {
      const res = await api.createShift(eventId, {
        title: form.title.trim(),
        location_note: form.location_note.trim() || undefined,
        capacity: Number(form.capacity) || 1,
        sort_order: shifts.length,
      });
      toast(res.message, "ok");
      setForm({ title: "", location_note: "", capacity: "2" });
      setAdding(false);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add the post", "err");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (shiftId: string, mine: boolean) => {
    setBusy(shiftId);
    try {
      const res = mine ? await api.releaseShift(shiftId) : await api.claimShift(shiftId);
      toast(res.message, "ok");
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the shift", "err");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (shiftId: string) => {
    setBusy(shiftId);
    try {
      const res = await api.deleteShift(shiftId);
      toast(res.message, "ok");
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove the post", "err");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Marshal posts</h2>
          <p className="mt-1 text-[12px] text-ink-3">
            {shifts.length === 0
              ? "No posts set up yet"
              : uncovered > 0
                ? `${uncovered} post${uncovered === 1 ? "" : "s"} still needs cover`
                : "Every post is covered"}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" variant={adding ? "outline" : "gold"} onClick={() => setAdding(!adding)}>
            {adding ? "Cancel" : <><PlusIcon className="size-3.5" /> Add a post</>}
          </Button>
        )}
      </div>

      {adding && isAdmin && (
        <Card className="mt-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[1.4fr_1.4fr_0.6fr]">
            <Field label="Post" htmlFor="shift-title">
              <Input
                id="shift-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Junction marshal"
                autoFocus
              />
            </Field>
            <Field label="Where" htmlFor="shift-where">
              <Input
                id="shift-where"
                value={form.location_note}
                onChange={(e) => setForm((f) => ({ ...f, location_note: e.target.value }))}
                placeholder="Beach road turn, 2.5 km"
              />
            </Field>
            <Field label="People" htmlFor="shift-cap">
              <Input
                id="shift-cap"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                inputMode="numeric"
              />
            </Field>
          </div>
          <Button className="mt-4" loading={busy === "create"} onClick={create}>
            Add the post
          </Button>
        </Card>
      )}

      {shifts.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title="No marshal posts yet"
            body={
              isAdmin
                ? "Add the junctions, water stops and the start line, then volunteers can claim them."
                : "An organiser hasn't set up posts for this event yet."
            }
          />
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {shifts.map((s) => (
            <Card
              key={s.id}
              className={cn(
                "p-5",
                s.open_slots > 0 && "border-[color:var(--color-pending)]/25",
                s.mine && "border-gold/35",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[14.5px] font-semibold text-ink">{s.title}</h3>
                  {s.location_note && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                      <PinIcon className="size-3" />
                      {s.location_note}
                    </p>
                  )}
                </div>
                {s.open_slots > 0 ? (
                  <Badge color="var(--color-pending)">
                    {s.open_slots} needed
                  </Badge>
                ) : (
                  <Badge color="var(--color-paid)" icon="✓">
                    Covered
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex min-h-[34px] flex-wrap items-center gap-2">
                {s.assigned.length === 0 ? (
                  <p className="text-[12px] text-ink-3">Nobody on this post yet.</p>
                ) : (
                  s.assigned.map((a) => (
                    <span
                      key={a.user_id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2/60 py-1 pl-1 pr-2.5"
                    >
                      <Avatar name={a.name} size={20} />
                      <span className="text-[12px] text-ink-2">{a.name}</span>
                    </span>
                  ))
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={s.mine ? "outline" : "gold"}
                  loading={busy === s.id}
                  disabled={!s.mine && s.open_slots === 0}
                  onClick={() => void toggle(s.id, s.mine)}
                >
                  {s.mine ? "Step off" : s.open_slots === 0 ? "Full" : "I'll take it"}
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => void remove(s.id)}>
                    Remove
                  </Button>
                )}
              </div>

              <p className="mt-3 text-[11px] text-ink-3">
                {s.assigned.length} of {s.capacity} {s.capacity === 1 ? "person" : "people"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Checkpoints ──────────────────────────────────────────── */

function CheckpointsPanel({
  eventId,
  isAdmin,
  data,
  onChanged,
}: {
  eventId: string;
  isAdmin: boolean;
  data: RaceDayDashboard;
  onChanged: () => void;
}) {
  const toast = useToast();
  const load = useCallback(() => api.checkpoints(eventId), [eventId]);
  const { data: checkpoints, loading, error, reload } = useFetch(load);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", distance_km: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = checkpoints ?? [];

  const refresh = () => {
    reload();
    onChanged();
  };

  const create = async () => {
    if (!form.name.trim()) {
      toast("Give the checkpoint a name", "err");
      return;
    }
    setBusy("create");
    try {
      const res = await api.createCheckpoint(eventId, {
        name: form.name.trim(),
        distance_km: form.distance_km.trim() ? Number(form.distance_km) : null,
        sort_order: rows.length,
      });
      toast(res.message, "ok");
      setForm({ name: "", distance_km: "" });
      setAdding(false);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add the checkpoint", "err");
    } finally {
      setBusy(null);
    }
  };

  const pass = async (checkpointId: string, userId: string, name: string) => {
    setBusy(userId + checkpointId);
    try {
      const res = await api.passCheckpoint(checkpointId, userId);
      toast(res.changed ? `${name.split(" ")[0]} through` : res.message, "ok");
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not record the split", "err");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (checkpointId: string) => {
    setBusy(checkpointId);
    try {
      const res = await api.deleteCheckpoint(checkpointId);
      toast(res.message, "ok");
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove", "err");
    } finally {
      setBusy(null);
    }
  };

  /** Only people who actually started can be tapped through a checkpoint. */
  const onCourse = data.recent_check_ins;

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Live tracking</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Tap runners through as they pass. Tapping twice is harmless — the first time stands.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" variant={adding ? "outline" : "gold"} onClick={() => setAdding(!adding)}>
            {adding ? "Cancel" : <><PlusIcon className="size-3.5" /> Add checkpoint</>}
          </Button>
        )}
      </div>

      {adding && isAdmin && (
        <Card className="mt-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Checkpoint" htmlFor="cp-name">
              <Input
                id="cp-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Water stop"
                autoFocus
              />
            </Field>
            <Field label="At (km)" htmlFor="cp-km" hint="Optional.">
              <Input
                id="cp-km"
                value={form.distance_km}
                onChange={(e) => setForm((f) => ({ ...f, distance_km: e.target.value }))}
                inputMode="decimal"
                placeholder="2.5"
              />
            </Field>
          </div>
          <Button className="mt-4" loading={busy === "create"} onClick={create}>
            Add the checkpoint
          </Button>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<PinIcon className="size-5" />}
            title="No checkpoints yet"
            body={
              isAdmin
                ? "Add points along the course — halfway, water stop, final turn — and marshals can log runners through them."
                : "An organiser hasn't set up checkpoints for this event."
            }
          />
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map((c) => {
            const open = openId === c.id;
            return (
              <Card key={c.id} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-center gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14.5px] font-semibold text-ink">
                      {c.name}
                      {c.distance_km != null && (
                        <span className="ml-2 text-[12px] font-normal text-ink-3">
                          {c.distance_km} km
                        </span>
                      )}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {c.passed} {c.passed === 1 ? "runner" : "runners"} through
                      {c.splits[0] && ` · last ${relativeTime(c.splits[0].recorded_at)}`}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant={open ? "outline" : "gold"}
                    onClick={() => setOpenId(open ? null : c.id)}
                  >
                    {open ? "Done" : "Log runners"}
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => void remove(c.id)}>
                      Remove
                    </Button>
                  )}
                </div>

                {open && (
                  <div className="border-t border-white/8 p-5">
                    {onCourse.length === 0 ? (
                      <p className="text-[13px] text-ink-3">
                        Nobody has checked in yet, so there's nobody on the course to log.
                      </p>
                    ) : (
                      <>
                        <p className="eyebrow mb-3">Checked-in runners</p>
                        <div className="flex flex-wrap gap-2">
                          {onCourse.map((r) => {
                            const through = c.splits.some((s) => s.user_id === r.user_id);
                            return (
                              <button
                                key={r.registration_id}
                                onClick={() => void pass(c.id, r.user_id, r.name)}
                                disabled={through}
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-[12.5px] transition-colors",
                                  through
                                    ? "border-[color:var(--color-paid)]/40 bg-[color:var(--color-paid)]/10 text-ink-2"
                                    : "border-white/12 text-ink-2 hover:border-gold/50 hover:text-ink",
                                )}
                              >
                                <Avatar name={r.name} size={22} />
                                {r.name}
                                {through && (
                                  <span className="text-[color:var(--color-paid)]" aria-hidden>
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {c.splits.length > 0 && (
                      <div className="mt-5">
                        <p className="eyebrow mb-2">Splits recorded</p>
                        <ul className="space-y-1.5">
                          {c.splits.map((s) => (
                            <li
                              key={s.user_id}
                              className="flex items-center justify-between gap-3 text-[12.5px]"
                            >
                              <span className="text-ink-2">{s.name}</span>
                              <span className="tnum text-ink-3">
                                {eventTime(s.recorded_at)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
