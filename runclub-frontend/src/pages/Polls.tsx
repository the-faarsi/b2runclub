import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, TableToggle } from "../components/charts";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  Badge,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Tilt } from "../components/tilt";
import { cn } from "../lib/format";
import type { Poll } from "../lib/types";
import { useFetch } from "../lib/useFetch";

export function Polls() {
  const { user, isAdmin, isClubMember } = useAuth();
  const load = useCallback(() => api.polls(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  const polls = data ?? [];
  // Visitors (and signed-out users) can read results but never cast a vote —
  // the backend restricts POST /polls/:id/vote to the same three roles.
  const canVote = isClubMember;

  return (
    <Page>
      <PageScene variant="towers" opacity={0.26} />
      <PageHeader
        eyebrow="Have your say"
        title="Polls"
        description="Routes, start times, kit colours. One vote each, and it's final."
        action={
          isAdmin && (
            <Link to="/admin/polls" className={buttonClass("outline", "md")}>
              Manage polls
            </Link>
          )
        }
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-5 w-2/3" />
              <div className="mt-6 space-y-4">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div key={j}>
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : polls.length === 0 ? (
        <Card>
          <EmptyState
            icon={<span aria-hidden>◉</span>}
            title="No open polls"
            body={
              isAdmin
                ? "Create one to get the club's opinion on the next route."
                : "Nothing to vote on right now. Organisers post polls before each block."
            }
            action={
              isAdmin && (
                <Link to="/admin/polls" className={buttonClass("gold", "sm")}>
                  Create a poll
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {polls.map((poll, i) => (
            <PollCard
              key={poll.id}
              poll={poll}
              index={i}
              canVote={canVote}
              signedIn={Boolean(user)}
              onVoted={(optionId) =>
                setData((prev) =>
                  (prev ?? []).map((p) =>
                    p.id === poll.id
                      ? {
                          ...p,
                          has_voted: true,
                          user_voted_option_id: optionId,
                          options: p.options.map((o) =>
                            o.id === optionId ? { ...o, vote_count: o.vote_count + 1 } : o,
                          ),
                        }
                      : p,
                  ),
                )
              }
            />
          ))}
        </div>
      )}
    </Page>
  );
}

/* ── Poll card ────────────────────────────────────────────────
 * Single-series magnitude, so one hue and no legend. Once the
 * viewer has voted the bars are revealed with values at the tip;
 * before that the options are plain buttons so the tally can't
 * anchor the vote. */

function PollCard({
  poll,
  index,
  canVote,
  signedIn,
  onVoted,
}: {
  poll: Poll;
  index: number;
  canVote: boolean;
  signedIn: boolean;
  onVoted: (optionId: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const total = poll.options.reduce((s, o) => s + o.vote_count, 0);
  const max = Math.max(...poll.options.map((o) => o.vote_count), 0);
  const revealed = poll.has_voted || !canVote;

  const vote = async (optionId: string) => {
    setBusy(optionId);
    try {
      await api.vote(poll.id, optionId);
      onVoted(optionId);
      toast("Vote counted.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not cast the vote", "err");
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.3) }}
    >
      <Tilt max={5} lift={7} className="h-full">
      <Card className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold leading-snug text-ink">{poll.title}</h2>
            <p className="mt-1.5 text-[12px] text-ink-3">
              {total === 0
                ? "No votes yet"
                : `${total} ${total === 1 ? "vote" : "votes"} cast`}
              {poll.has_voted && " · you voted"}
            </p>
          </div>
          {poll.has_voted ? (
            <Badge color="var(--color-paid)" icon="✓">
              Voted
            </Badge>
          ) : (
            <Badge color="var(--color-gold)">Open</Badge>
          )}
        </div>

        <div className="mt-6 flex-1">
          {showTable ? (
            <DataTable
              columns={["Option", "Votes", "Share"]}
              rows={poll.options.map((o) => [
                o.option_text,
                o.vote_count,
                total > 0 ? `${((o.vote_count / total) * 100).toFixed(0)}%` : "0%",
              ])}
            />
          ) : revealed ? (
            <div className="space-y-4">
              {poll.options.map((o, i) => {
                const pct = max > 0 ? (o.vote_count / max) * 100 : 0;
                const share = total > 0 ? (o.vote_count / total) * 100 : 0;
                const mine = poll.user_voted_option_id === o.id;

                return (
                  <div key={o.id}>
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] text-ink-2">{o.option_text}</span>
                        {mine && (
                          <span className="shrink-0 rounded-full bg-gold/16 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                            Your pick
                          </span>
                        )}
                      </span>
                      <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                        {o.vote_count}
                        <span className="ml-1.5 font-normal text-ink-3">
                          {share.toFixed(0)}%
                        </span>
                      </span>
                    </div>

                    {/* 12px bar, 4px rounded data-end, square at the baseline */}
                    <div className="relative h-3 w-full overflow-hidden rounded-r-[4px]">
                      <div
                        className="absolute inset-0 rounded-r-[4px]"
                        style={{ background: "var(--color-mark-soft)", opacity: 0.5 }}
                        aria-hidden
                      />
                      <motion.div
                        className="absolute inset-y-0 left-0 rounded-r-[4px]"
                        style={{ background: "var(--color-mark)" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{
                          duration: 0.7,
                          delay: i * 0.06,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {poll.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => vote(o.id)}
                  disabled={busy !== null}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-surface-2/50 px-4 py-3 text-left transition-all duration-200",
                    "hover:border-gold/45 hover:bg-gold/6 disabled:opacity-50",
                  )}
                >
                  <span
                    aria-hidden
                    className="grid size-4 shrink-0 place-items-center rounded-full border border-white/25 transition-colors group-hover:border-gold"
                  >
                    <span className="size-1.5 rounded-full bg-transparent transition-colors group-hover:bg-gold" />
                  </span>
                  <span className="flex-1 text-[13.5px] text-ink-2 transition-colors group-hover:text-ink">
                    {o.option_text}
                  </span>
                  {busy === o.id && (
                    <span className="text-[11px] text-ink-3">casting…</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4">
          {!signedIn ? (
            <Link to="/login" className="text-[12px] font-medium text-gold hover:underline">
              Sign in to vote
            </Link>
          ) : !canVote ? (
            <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" aria-hidden>
                <rect
                  x="4"
                  y="11"
                  width="16"
                  height="9"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" />
              </svg>
              Read-only — visitors can't vote. Ask an organiser for member access.
            </span>
          ) : poll.has_voted ? (
            <span className="text-[12px] text-ink-3">Your vote is locked in.</span>
          ) : (
            <span className="text-[12px] text-ink-3">Pick one — you can't change it.</span>
          )}

          {revealed && (
            <TableToggle showing={showTable} onToggle={() => setShowTable((s) => !s)} />
          )}
        </div>
      </Card>
      </Tilt>
    </motion.div>
  );
}
