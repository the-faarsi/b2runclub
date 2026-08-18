import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { api } from "../lib/api";
import { cn, gapLabel, parseClock, secsToClock } from "../lib/format";
import type { ClubEvent, EventRegistrationRow, ResultRow, ResultStatus } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { ChartIcon, Medal } from "./icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from "./ui";

/** Gold, silver, bronze — everyone else takes the plain treatment. */
const PODIUM: Record<number, { ring: string; tint: string }> = {
  1: { ring: "var(--color-gold)", tint: "#e9b949" },
  2: { ring: "#b9c0cc", tint: "#b9c0cc" },
  3: { ring: "#c08457", tint: "#c08457" },
};

const RESULT_STATUS_META: Record<ResultStatus, { label: string; color: string; note: string }> = {
  FINISHED: { label: "Finished", color: "var(--color-paid)", note: "Crossed the line" },
  DNF: { label: "DNF", color: "var(--color-pending)", note: "Started but didn't finish" },
  DNS: { label: "DNS", color: "var(--color-ink-3)", note: "Didn't start" },
};

/* ── Public results sheet ─────────────────────────────────── */

/**
 * The published result for one event. Public on purpose — a results sheet nobody
 * can read is not a results sheet.
 *
 * Renders nothing at all when there are no results yet, rather than an empty
 * table, so an event page stays clean until an organiser has entered times.
 */
export function EventResultsSheet({ event }: { event: ClubEvent }) {
  const load = useCallback(() => api.eventResults(event.id), [event.id]);
  const { data, loading, error, reload } = useFetch(load);

  const rows = data?.results ?? [];

  if (loading) {
    return (
      <Card className="mt-6 p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-6">
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  if (rows.length === 0) return null;

  const finishers = rows.filter((r) => r.position !== null);
  const others = rows.filter((r) => r.position === null);

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Medal place={1} className="size-4" />
            Results
          </h2>
          <p className="mt-1 text-[12px] text-ink-3">
            {data?.finisher_count} finisher{data?.finisher_count === 1 ? "" : "s"}
            {others.length > 0 && ` · ${others.length} DNF/DNS`}
          </p>
        </div>
        {finishers[0] && (
          <div className="text-right">
            <p className="eyebrow">Winner</p>
            <p className="mt-0.5 text-[13.5px] font-semibold text-gold">{finishers[0].name}</p>
          </div>
        )}
      </div>

      <ul>
        {finishers.map((r, i) => (
          <ResultLine key={r.id} row={r} index={i} />
        ))}
        {others.map((r, i) => (
          <ResultLine key={r.id} row={r} index={finishers.length + i} />
        ))}
      </ul>
    </Card>
  );
}

function ResultLine({ row, index }: { row: ResultRow; index: number }) {
  const podium = row.position ? PODIUM[row.position] : undefined;
  const gap = gapLabel(row.behind_secs);
  const meta = RESULT_STATUS_META[row.status];

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.035, 0.3) }}
      className={cn(
        "flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-3.5 last:border-0",
        podium && "bg-gold/[0.035]",
      )}
    >
      {/* Position chip, or a dash for a non-finisher */}
      <div
        className="grid size-9 shrink-0 place-items-center rounded-xl border text-[13px] font-bold tnum"
        style={{
          borderColor: podium ? `${podium.ring}59` : "rgba(255,255,255,0.1)",
          background: podium ? `${podium.ring}1a` : "transparent",
          color: podium ? podium.tint : "var(--color-ink-3)",
        }}
        aria-hidden
      >
        {row.position ?? "–"}
      </div>

      <Avatar name={row.name} size={34} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium text-ink">{row.name}</span>
          {row.status !== "FINISHED" && (
            <Badge color={meta.color}>{meta.label}</Badge>
          )}
          {row.position === 1 && <Badge color="var(--color-gold)">★ First</Badge>}
        </div>
        {(row.pace || row.notes) && (
          <p className="mt-0.5 truncate text-[12px] text-ink-3">
            {[row.pace, row.notes].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <div className="ml-auto shrink-0 text-right">
        <p className="display tnum text-[19px] leading-none text-ink">{row.finish_time ?? "—"}</p>
        {gap && <p className="mt-1 text-[11px] tnum text-ink-3">{gap}</p>}
      </div>
    </motion.li>
  );
}

/* ── Admin: enter and amend results ───────────────────────── */

interface Draft {
  clock: string;
  distance: string;
  status: ResultStatus;
  notes: string;
}

/**
 * Organiser entry for one event's results.
 *
 * Works from the roster rather than a free-text name field: an organiser picks
 * the person who was actually registered, so a result can never be attached to
 * a misspelled name that matches nobody.
 */
export function ResultsEditor({ event }: { event: ClubEvent }) {
  const toast = useToast();

  const loadRoster = useCallback(() => api.eventRegistrations(event.id), [event.id]);
  const roster = useFetch(loadRoster);

  const loadResults = useCallback(() => api.eventResults(event.id), [event.id]);
  const results = useFetch(loadResults);

  const [editing, setEditing] = useState<EventRegistrationRow | null>(null);
  const [draft, setDraft] = useState<Draft>({
    clock: "",
    distance: "",
    status: "FINISHED",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** Existing result per user, so the list shows what is already recorded. */
  const byUser = useMemo(() => {
    const map = new Map<string, ResultRow>();
    for (const r of results.data?.results ?? []) map.set(r.user_id, r);
    return map;
  }, [results.data]);

  // Only people who actually turned up can have a time. Blocked entries are out.
  const eligible = (roster.data ?? []).filter((r) => !r.blocked_at);

  const open = (row: EventRegistrationRow) => {
    const existing = byUser.get(row.user_id);
    setDraft({
      clock: existing?.finish_secs ? secsToClock(existing.finish_secs) : "",
      distance: existing?.distance_km != null ? String(existing.distance_km) : "",
      status: existing?.status ?? "FINISHED",
      notes: existing?.notes ?? "",
    });
    setFormError(null);
    setEditing(row);
  };

  const save = async () => {
    if (!editing) return;
    setFormError(null);

    let secs: number | null = null;
    if (draft.status === "FINISHED") {
      secs = parseClock(draft.clock);
      if (secs === null) {
        setFormError("Enter a finish time as mm:ss or h:mm:ss.");
        return;
      }
    }

    const km = draft.distance.trim() ? Number(draft.distance) : null;
    if (km !== null && (!Number.isFinite(km) || km <= 0)) {
      setFormError("Distance must be a positive number of kilometres.");
      return;
    }

    setBusy(true);
    try {
      await api.saveResult(event.id, {
        user_id: editing.user_id,
        finish_secs: secs,
        distance_km: km,
        status: draft.status,
        notes: draft.notes.trim() || undefined,
      });
      toast(`${editing.name.split(" ")[0]}'s result saved`, "ok");
      setEditing(null);
      results.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the result");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ResultRow) => {
    try {
      await api.deleteResult(row.id);
      toast(`${row.name.split(" ")[0]}'s result removed`, "ok");
      results.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove", "err");
    }
  };

  const recorded = byUser.size;

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <ChartIcon className="size-4 text-gold" />
            Enter results
          </h2>
          <p className="mt-1 text-[12px] text-ink-3">
            {roster.loading
              ? "Loading the roster…"
              : `${recorded} of ${eligible.length} recorded · positions are worked out from the times`}
          </p>
        </div>
      </div>

      {roster.loading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-xl" />
          ))}
        </div>
      ) : roster.error ? (
        <ErrorState message={roster.error} onRetry={roster.reload} />
      ) : eligible.length === 0 ? (
        <EmptyState
          icon={<ChartIcon className="size-5" />}
          title="Nobody on the roster"
          body="Results can only be recorded against a registered runner."
        />
      ) : (
        <ul>
          {eligible.map((row) => {
            const existing = byUser.get(row.user_id);
            const meta = existing ? RESULT_STATUS_META[existing.status] : null;

            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-3.5 last:border-0"
              >
                <Avatar name={row.name} size={34} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium text-ink">{row.name}</span>
                    {existing?.position && (
                      <Badge color="var(--color-gold)">#{existing.position}</Badge>
                    )}
                    {meta && existing?.status !== "FINISHED" && (
                      <Badge color={meta.color}>{meta.label}</Badge>
                    )}
                    {!row.attended_at && !existing && (
                      <span className="text-[11px] text-ink-3">didn't check in</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {existing
                      ? [existing.finish_time, existing.pace].filter(Boolean).join(" · ") ||
                        RESULT_STATUS_META[existing.status].note
                      : "No result yet"}
                  </p>
                </div>

                <div className="ml-auto flex shrink-0 gap-2">
                  <Button size="sm" variant={existing ? "outline" : "gold"} onClick={() => open(row)}>
                    {existing ? "Amend" : "Add time"}
                  </Button>
                  {existing && (
                    <Button size="sm" variant="ghost" onClick={() => remove(existing)}>
                      Clear
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.name}'s result` : ""}
        subtitle={event.title}
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Outcome" htmlFor="result-status">
              <Select
                id="result-status"
                value={draft.status}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, status: e.target.value as ResultStatus }))
                }
              >
                <option value="FINISHED">Finished — record a time</option>
                <option value="DNF">DNF — started, didn't finish</option>
                <option value="DNS">DNS — didn't start</option>
              </Select>
            </Field>

            {draft.status === "FINISHED" && (
              <>
                <Field
                  label="Finish time"
                  htmlFor="result-clock"
                  hint="mm:ss or h:mm:ss. A bare number is read as minutes."
                >
                  <Input
                    id="result-clock"
                    value={draft.clock}
                    onChange={(e) => setDraft((d) => ({ ...d, clock: e.target.value }))}
                    placeholder="24:50"
                    inputMode="numeric"
                    autoFocus
                  />
                </Field>

                <Field
                  label="Distance (km)"
                  htmlFor="result-distance"
                  hint="Optional — leave blank to use the route distance for pace."
                >
                  <Input
                    id="result-distance"
                    value={draft.distance}
                    onChange={(e) => setDraft((d) => ({ ...d, distance: e.target.value }))}
                    placeholder="5"
                    inputMode="decimal"
                  />
                </Field>
              </>
            )}

            <Field label="Note" htmlFor="result-notes" hint="Optional. Shown on the results sheet.">
              <Input
                id="result-notes"
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="First 10k · pulled up at 7km"
              />
            </Field>

            {/* Live echo of what was parsed, so a typo is obvious before saving */}
            {draft.status === "FINISHED" && draft.clock.trim() !== "" && (
              <p className="rounded-xl border border-white/8 bg-surface-2/50 px-3.5 py-2.5 text-[12.5px] text-ink-2">
                {parseClock(draft.clock) === null ? (
                  <span className="text-[color:var(--color-pending)]">
                    Can't read that as a time.
                  </span>
                ) : (
                  <>
                    Reads as{" "}
                    <strong className="tnum text-ink">
                      {secsToClock(parseClock(draft.clock)!)}
                    </strong>
                  </>
                )}
              </p>
            )}

            {formError && (
              <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-2.5 text-[13px] text-ink-2">
                {formError}
              </p>
            )}

            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button className="flex-1" loading={busy} onClick={save}>
                Save result
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
