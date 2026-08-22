import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { cn, relativeTime } from "../lib/format";
import type { ClubEvent } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { SparkIcon } from "./icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Textarea,
  useToast,
} from "./ui";

const SCALE = [
  { score: 1, label: "Poor" },
  { score: 2, label: "Meh" },
  { score: 3, label: "Fine" },
  { score: 4, label: "Good" },
  { score: 5, label: "Great" },
];

/** Star row used by both the form and the read-back. */
function Stars({
  value,
  onPick,
  size = 26,
}: {
  value: number;
  onPick?: (n: number) => void;
  size?: number;
}) {
  return (
    <div className="flex gap-1.5" role={onPick ? "radiogroup" : undefined} aria-label="Rating">
      {SCALE.map((s) => {
        const on = s.score <= value;
        const star = (
          <svg viewBox="0 0 24 24" style={{ width: size, height: size }} aria-hidden>
            <path
              d="m12 2.6 2.9 6.06 6.6.9-4.8 4.62 1.18 6.52L12 17.6l-5.88 3.1L7.3 14.18 2.5 9.56l6.6-.9z"
              fill={on ? "var(--color-gold)" : "transparent"}
              stroke={on ? "var(--color-gold)" : "rgba(255,255,255,0.22)"}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        );

        if (!onPick) return <span key={s.score}>{star}</span>;

        return (
          <button
            key={s.score}
            type="button"
            role="radio"
            aria-checked={value === s.score}
            aria-label={`${s.score} — ${s.label}`}
            onClick={() => onPick(s.score)}
            className="rounded-md transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}

/* ── Member: leave feedback ───────────────────────────────── */

/**
 * Post-event survey for someone who was registered.
 *
 * Only rendered for a past event — the backend refuses feedback on a future one,
 * so showing the form early would only produce an error the member can't act on.
 */
export function EventFeedbackCard({ event }: { event: ClubEvent }) {
  const toast = useToast();
  const load = useCallback(() => api.myFeedback(event.id), [event.id]);
  const { data, loading, setData } = useFetch(load);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form from an existing response once it arrives.
  useEffect(() => {
    if (data?.submitted) {
      setRating(data.rating ?? 0);
      setComment(data.comment ?? "");
    }
  }, [data]);

  const submit = async () => {
    if (rating < 1) {
      setError("Pick a rating first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.submitFeedback(event.id, { rating, comment: comment.trim() || undefined });
      setData(() => ({ submitted: true, rating, comment: comment.trim() || null }));
      setEditing(false);
      toast("Thanks — that helps us plan the next one.", "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your feedback");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card className="mt-6 p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-8 w-48" />
      </Card>
    );
  }

  // Already answered, and not currently amending it.
  if (data?.submitted && !editing) {
    return (
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-gold">Your feedback</p>
            <div className="mt-2.5">
              <Stars value={data.rating ?? 0} size={22} />
            </div>
            {data.comment && (
              <p className="mt-3 max-w-prose text-[13.5px] leading-relaxed text-ink-2">
                “{data.comment}”
              </p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change it
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-6 p-5">
      <p className="eyebrow text-gold">How was it?</p>
      <h2 className="mt-1.5 text-[15px] font-semibold text-ink">Rate this session</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
        Organisers see the average and every comment. It shapes routes, timings and marshal cover.
      </p>

      <div className="mt-4">
        <Stars value={rating} onPick={setRating} />
        {rating > 0 && (
          <motion.p
            key={rating}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-[12px] font-medium text-gold"
          >
            {SCALE.find((s) => s.score === rating)?.label}
          </motion.p>
        )}
      </div>

      <div className="mt-4">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Anything you'd change? Route, start time, marshalling, water stops…"
          aria-label="Comment"
        />
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-2.5 text-[13px] text-ink-2">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2.5">
        {editing && (
          <Button variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button loading={busy} onClick={submit}>
          {data?.submitted ? "Update my feedback" : "Send feedback"}
        </Button>
      </div>
    </Card>
  );
}

/* ── Admin: aggregate ─────────────────────────────────────── */

/** Ratings distribution plus every comment, for one event. */
export function FeedbackSummaryCard({ event }: { event: ClubEvent }) {
  const load = useCallback(() => api.feedbackSummary(event.id), [event.id]);
  const { data, loading, error, reload } = useFetch(load);

  if (loading) {
    return (
      <Card className="mt-6 p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-24 w-full rounded-xl" />
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

  if (!data || data.count === 0) {
    return (
      <Card className="mt-6">
        <EmptyState
          icon={<SparkIcon className="size-5" />}
          title="No feedback yet"
          body="Registered runners can rate the session once it has finished."
        />
      </Card>
    );
  }

  const peak = Math.max(...data.distribution.map((d) => d.count), 1);

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <SparkIcon className="size-4 text-gold" />
            Feedback
          </h2>
          <p className="mt-1 text-[12px] text-ink-3">
            {data.count} response{data.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className="display text-[32px] leading-none text-gold tnum">{data.average}</p>
          <p className="mt-1 text-[11px] text-ink-3">out of 5</p>
        </div>
      </div>

      {/* Distribution — 5 at the top, the way a review summary reads */}
      <div className="space-y-2 border-b border-white/8 p-5">
        {[...data.distribution].reverse().map((d) => (
          <div key={d.score} className="flex items-center gap-3">
            <span className="w-7 shrink-0 text-[12px] tnum text-ink-3">{d.score}★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/6">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(d.count / peak) * 100}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full"
                style={{ background: "var(--color-mark)" }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-[12px] tnum text-ink-3">{d.count}</span>
          </div>
        ))}
      </div>

      <ul>
        {data.responses
          .filter((r) => r.comment)
          .map((r) => (
            <li
              key={r.id}
              className="flex gap-3 border-b border-white/5 px-5 py-4 last:border-0"
            >
              <Avatar name={r.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-medium text-ink">{r.name}</span>
                  <Badge color="var(--color-gold)">{r.rating}★</Badge>
                  <span className="text-[11px] text-ink-3">{relativeTime(r.created_at)}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{r.comment}</p>
              </div>
            </li>
          ))}
      </ul>

      {data.responses.every((r) => !r.comment) && (
        <p className={cn("px-5 py-4 text-[12.5px] text-ink-3")}>
          Everyone rated but nobody left a comment.
        </p>
      )}
    </Card>
  );
}
