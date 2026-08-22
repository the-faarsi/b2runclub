import { motion, useReducedMotion } from "framer-motion";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { cn, eventDate, minsToHm, secsToClock } from "../lib/format";
import type { StreakBadge } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { Medal, SparkIcon } from "./icons";
import { buttonClass, Card, EmptyState, ErrorState, Skeleton } from "./ui";

/** Which badges get the loud treatment when earned. */
const HERO_BADGES = new Set(["streak-8", "century", "marshal-5"]);

/* ── Streak + badges ──────────────────────────────────────── */

/**
 * Attendance streak and badge shelf for the signed-in member.
 *
 * Everything here is derived from check-ins on the server, so a corrected scan
 * fixes the badge immediately — the client just renders what it is told.
 */
export function StreakCard() {
  const load = useCallback(() => api.myStreak(), []);
  const { data, loading, error, reload } = useFetch(load);

  if (loading) {
    return (
      <Card className="mt-5 p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-16 w-full rounded-xl" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-5">
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  if (!data) return null;

  // Nothing attended yet: an empty badge shelf is discouraging, so point them
  // at the calendar instead.
  if (data.attended_count === 0) {
    return (
      <Card className="mt-5">
        <EmptyState
          icon={<SparkIcon className="size-5" />}
          title="No sessions attended yet"
          body="Your streak and badges start the first time a marshal scans your ticket at the start line."
          action={
            <Link to="/calendar" className={buttonClass("gold", "sm")}>
              Find a session
            </Link>
          }
        />
      </Card>
    );
  }

  const earned = data.badges.filter((b) => b.earned);
  const locked = data.badges.filter((b) => !b.earned);

  return (
    <Card className="mt-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Your record</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
            Counted from ticket scans at the start line, so it only reflects sessions you actually
            turned up to.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-gold/25 bg-gold/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
          {data.earned_count} / {data.badges.length} badges
        </span>
      </div>

      {/* Headline figures */}
      <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-4">
        <Figure
          label="Current streak"
          value={data.current_streak_weeks}
          unit={data.current_streak_weeks === 1 ? "week" : "weeks"}
          highlight={data.current_streak_weeks > 0}
        />
        <Figure
          label="Best streak"
          value={data.best_streak_weeks}
          unit={data.best_streak_weeks === 1 ? "week" : "weeks"}
        />
        <Figure label="Sessions" value={data.attended_count} unit="attended" />
        <Figure label="Marshalled" value={data.volunteered_count} unit="sessions" />
      </div>

      {data.current_streak_weeks === 0 && data.best_streak_weeks > 0 && (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Your streak has lapsed — a streak counts consecutive weeks, and it stays alive if you run
          this week or last. Your best of {data.best_streak_weeks} weeks stands.
        </p>
      )}

      {data.last_attended && (
        <p className="mt-3 text-[12px] text-ink-3">
          Last seen at <span className="text-ink-2">{data.last_attended.title}</span> on{" "}
          {eventDate(data.last_attended.at)}
        </p>
      )}

      {/* Badge shelf */}
      <div className="mt-6">
        <p className="eyebrow mb-3">Badges</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[...earned, ...locked].map((b, i) => (
            <BadgeTile key={b.key} badge={b} index={i} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={cn("display mt-1.5 text-[26px] leading-none tnum", highlight && "text-gold")}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-ink-3">{unit}</p>
    </div>
  );
}

function BadgeTile({ badge, index }: { badge: StreakBadge; index: number }) {
  const reduced = useReducedMotion();
  const hero = badge.earned && HERO_BADGES.has(badge.key);

  return (
    <motion.div
      initial={reduced ? undefined : { opacity: 0, y: 8 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        badge.earned
          ? hero
            ? "border-gold/40 bg-gold/[0.07]"
            : "border-white/10 bg-surface-2/50"
          : "border-white/6 bg-transparent",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl",
          badge.earned ? "bg-gold/14" : "bg-white/5",
        )}
        aria-hidden
      >
        {badge.earned ? (
          <SparkIcon className={cn("size-[17px]", hero ? "text-gold" : "text-gold/75")} />
        ) : (
          /* Locked badges read as absent rather than as a different achievement */
          <svg viewBox="0 0 24 24" className="size-4 text-ink-3" fill="none" aria-hidden>
            <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </span>

      <div className="min-w-0">
        <p
          className={cn(
            "text-[13.5px] font-medium",
            badge.earned ? "text-ink" : "text-ink-3",
          )}
        >
          {badge.label}
        </p>
        <p className="text-[11.5px] text-ink-3">{badge.detail}</p>
      </div>
    </motion.div>
  );
}

/* ── Personal results log ─────────────────────────────────── */

/** Every result recorded for the signed-in member, newest first. */
export function MyResultsCard() {
  const load = useCallback(() => api.myResults(), []);
  const { data, loading, error, reload } = useFetch(load);

  if (loading) {
    return (
      <Card className="mt-5 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-20 w-full rounded-xl" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-5">
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  if (!data || data.results.length === 0) return null;

  const { totals } = data;

  return (
    <Card className="mt-5 overflow-hidden p-0">
      <div className="p-6 pb-0">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Medal place={1} className="size-4" />
          Your results
        </h3>
        <p className="mt-1.5 text-[13px] text-ink-3">
          Times recorded by organisers after each session.
        </p>

        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-3">
          <Figure label="Finished" value={totals.events_finished} unit="sessions" highlight />
          <div className="bg-surface p-4">
            <p className="eyebrow">Distance</p>
            <p className="display mt-1.5 text-[26px] leading-none tnum">
              {totals.total_distance_km}
            </p>
            <p className="mt-1 text-[11px] text-ink-3">km logged</p>
          </div>
          <div className="bg-surface p-4">
            <p className="eyebrow">Time on feet</p>
            <p className="display mt-1.5 text-[26px] leading-none tnum">
              {minsToHm(Math.round(totals.total_secs / 60))}
            </p>
            <p className="mt-1 text-[11px] text-ink-3">racing</p>
          </div>
        </div>
      </div>

      <ul className="mt-5">
        {data.results.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-3 border-t border-white/5 px-6 py-3.5"
          >
            <div className="min-w-0 flex-1">
              <Link
                to={`/events/${r.event_id}`}
                className="text-[14px] font-medium text-ink hover:text-gold"
              >
                {r.event_title}
              </Link>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {eventDate(r.event_date)}
                {r.pace && ` · ${r.pace}`}
                {r.distance_km != null && ` · ${r.distance_km} km`}
              </p>
            </div>
            <div className="ml-auto shrink-0 text-right">
              {r.status === "FINISHED" && r.finish_secs ? (
                <p className="display tnum text-[19px] leading-none text-ink">
                  {secsToClock(r.finish_secs)}
                </p>
              ) : (
                <p className="text-[12px] font-medium text-ink-3">{r.status}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
