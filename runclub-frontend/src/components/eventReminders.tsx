import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { cn, countdown, eventDate, eventTime } from "../lib/format";
import type { ClubEvent } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { ClockIcon, SparkIcon } from "./icons";
import { Badge, Button, Card, ErrorState, Skeleton, useToast } from "./ui";

const OFFSET_LABEL: Record<number, string> = {
  168: "1 week before",
  72: "3 days before",
  48: "2 days before",
  24: "1 day before",
  12: "12 hours before",
  4: "4 hours before",
  2: "2 hours before",
  1: "1 hour before",
};

const STATE = {
  sent: { label: "Sent", tint: "var(--color-paid)", icon: "✓" },
  due: { label: "Due now", tint: "var(--color-pending)", icon: "◍" },
  scheduled: { label: "Scheduled", tint: "var(--color-free)", icon: "◷" },
} as const;

/**
 * Organiser view of an event's email reminders.
 *
 * The sweeper runs on its own every minute; the manual trigger exists so an
 * organiser can push a due reminder immediately rather than waiting, and it is
 * safe to press repeatedly — already-sent reminders are skipped server-side.
 */
export function EventReminders({ event }: { event: ClubEvent }) {
  const toast = useToast();
  const load = useCallback(() => api.eventReminders(event.id), [event.id]);
  const { data, loading, error, reload } = useFetch(load);
  const [running, setRunning] = useState(false);

  const reminders = data?.reminders ?? [];
  const configured = data?.mailer_configured ?? false;

  const run = async () => {
    setRunning(true);
    try {
      const res = await api.runReminders(event.id);
      toast(
        res.simulated
          ? `${res.message} — logged to the server console, not emailed (SMTP not configured).`
          : res.message,
        res.failed > 0 ? "err" : "ok",
      );
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not run reminders", "err");
    } finally {
      setRunning(false);
    }
  };

  const anyDue = reminders.some((r) => r.state === "due");

  return (
    <Card className="hud mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <ClockIcon className="size-4 text-gold" />
            Email reminders
          </h2>
          <p className="mt-1 text-[12px] text-ink-3">
            {loading
              ? "Loading the schedule…"
              : reminders.length === 0
                ? "None set — edit the event to add some."
                : `${reminders.length} reminder${reminders.length === 1 ? "" : "s"} per registrant`}
          </p>
        </div>

        {reminders.length > 0 && (
          <Button size="sm" variant={anyDue ? "gold" : "outline"} loading={running} onClick={run}>
            <SparkIcon className="size-3.5" />
            {anyDue ? "Send due now" : "Run sweep"}
          </Button>
        )}
      </div>

      {/* SMTP state — the difference between "emailed" and "logged" matters. */}
      {!loading && !error && (
        <p
          className={cn(
            "mt-4 rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed",
            configured
              ? "border-[color:var(--color-paid)]/25 bg-[color:var(--color-paid)]/8 text-ink-2"
              : "border-[color:var(--color-pending)]/25 bg-[color:var(--color-pending)]/8 text-ink-2",
          )}
        >
          <span
            aria-hidden
            className="mr-1.5 font-bold"
            style={{
              color: configured ? "var(--color-paid)" : "var(--color-pending)",
            }}
          >
            {configured ? "✓" : "◍"}
          </span>
          {configured
            ? "SMTP is configured — reminders are emailed for real."
            : "SMTP isn't configured, so reminders are written to the server console instead of sent. Add SMTP_HOST / SMTP_USER / SMTP_PASS to the backend .env to turn on real delivery."}
        </p>
      )}

      {loading ? (
        <div className="mt-4 space-y-2.5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : reminders.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {reminders.map((r) => {
            const meta = STATE[r.state];
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-surface-2/50 px-4 py-3"
              >
                <span className="min-w-[130px] text-[13.5px] font-medium text-ink">
                  {OFFSET_LABEL[r.hours_before] ?? `${r.hours_before}h before`}
                </span>

                <Badge color={meta.tint} icon={meta.icon}>
                  {meta.label}
                </Badge>

                <span className="text-[12px] text-ink-3">
                  {r.state === "sent"
                    ? `${r.sent_count} emailed${r.failed_count ? `, ${r.failed_count} failed` : ""}`
                    : // relativeTime() is for past timestamps and collapses a
                      // future date to "just now", so use the countdown here.
                      `fires in ${countdown(r.due_at) ?? "moments"} · ${eventDate(r.due_at)} ${eventTime(r.due_at)}`}
                </span>

                {r.failed_count > 0 && (
                  <Badge color="var(--color-failed)" icon="!">
                    {r.failed_count} failed
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
