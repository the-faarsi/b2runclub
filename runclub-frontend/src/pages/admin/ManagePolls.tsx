import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarList, ChartCard, DataTable, TableToggle } from "../../components/charts";
import { Page, PageHeader } from "../../components/layout";
import { PageScene } from "../../components/scene3d";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  Spinner,
  useToast,
} from "../../components/ui";
import { api } from "../../lib/api";
import type { Poll, PollAnalytics } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

export function ManagePolls() {
  const toast = useToast();
  const load = useCallback(() => api.polls(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  const [creating, setCreating] = useState(false);
  const [analyticsFor, setAnalyticsFor] = useState<Poll | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const polls = data ?? [];

  /**
   * Closing a poll freezes the result — the backend refuses further votes. It is
   * reversible, so this needs no confirmation step.
   */
  const toggleActive = async (poll: Poll) => {
    setToggling(poll.id);
    try {
      const res = await api.setPollActive(poll.id, !poll.active);
      setData((prev) =>
        (prev ?? []).map((p) => (p.id === poll.id ? { ...p, active: !poll.active } : p)),
      );
      toast(res.message, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the poll", "err");
    } finally {
      setToggling(null);
    }
  };

  return (
    <Page>
      <PageScene variant="pulse" opacity={0.2} />
      <PageHeader
        eyebrow="Organiser"
        title="Manage polls"
        description="Ask the club a question. One vote per member, and votes can't be changed."
        action={
          <div className="flex gap-2">
            <Link to="/admin" className={buttonClass("ghost", "md")}>
              Dashboard
            </Link>
            <Link to="/admin/members" className={buttonClass("ghost", "md")}>
              Members
            </Link>
            <Button onClick={() => setCreating(true)}>New poll</Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-5 h-3 w-full" />
              <Skeleton className="mt-3 h-3 w-4/5" />
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
            title="No polls yet"
            body="Create one to settle the next route argument."
            action={<Button size="sm" onClick={() => setCreating(true)}>New poll</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {polls.map((poll, i) => {
            const total = poll.options.reduce((s, o) => s + o.vote_count, 0);
            return (
              <motion.div
                key={poll.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.06, 0.3) }}
              >
                <ChartCard
                  title={poll.title}
                  subtitle={`${total} ${total === 1 ? "vote" : "votes"} · ${poll.options.length} options`}
                  action={
                    poll.active ? (
                      <Badge color="var(--color-paid)" icon="✓">
                        Active
                      </Badge>
                    ) : (
                      <Badge>Closed</Badge>
                    )
                  }
                >
                  <BarList
                    data={poll.options.map((o) => ({
                      id: o.id,
                      label: o.option_text,
                      value: o.vote_count,
                    }))}
                    emptyLabel="No votes cast yet"
                  />
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4">
                    <span className="text-[12px] text-ink-3">
                      {poll.has_voted ? "You've voted in this poll" : "You haven't voted"}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setAnalyticsFor(poll)}
                        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-gold"
                      >
                        Full analytics
                      </button>
                      <Button
                        size="sm"
                        variant={poll.active ? "outline" : "gold"}
                        loading={toggling === poll.id}
                        onClick={() => void toggleActive(poll)}
                      >
                        {poll.active ? "Close voting" : "Reopen"}
                      </Button>
                    </div>
                  </div>
                </ChartCard>
              </motion.div>
            );
          })}
        </div>
      )}

      <CreatePollModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          toast("Poll created.", "ok");
          reload();
        }}
      />

      <AnalyticsModal
        poll={analyticsFor}
        open={analyticsFor !== null}
        onClose={() => setAnalyticsFor(null)}
      />
    </Page>
  );
}

/* ── Create ───────────────────────────────────────────────── */

function CreatePollModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setOptions(["", ""]);
      setError(null);
    }
  }, [open]);

  const setOption = (i: number, value: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!title.trim()) {
      setError("Give the poll a question.");
      return;
    }
    if (clean.length < 2) {
      setError("At least two options are required.");
      return;
    }

    setBusy(true);
    try {
      await api.createPoll({ title: title.trim(), options: clean });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the poll");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New poll"
      subtitle="Two options minimum. Members get one vote each."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Question" htmlFor="poll-title">
          <Input
            id="poll-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Which route for the Sunday long run?"
          />
        </Field>

        <div className="space-y-2.5">
          <span className="eyebrow block text-ink-2">Options</span>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1}`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 text-ink-3 transition-colors hover:border-[color:var(--color-failed)]/40 hover:text-[color:var(--color-failed)]"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {options.length < 8 && (
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, ""])}
              className="text-[12px] font-medium text-gold transition-opacity hover:opacity-80"
            >
              + Add another option
            </button>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[13px] text-ink-2">
            <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-failed)]">
              !
            </span>
            {error}
          </p>
        )}

        <div className="flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={busy} className="flex-1">
            Create poll
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Analytics ────────────────────────────────────────────── */

function AnalyticsModal({
  poll,
  open,
  onClose,
}: {
  poll: Poll | null;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<PollAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!open || !poll) return;
    let cancelled = false;
    setData(null);
    setError(null);

    api
      .pollAnalytics(poll.id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load analytics");
      });

    return () => {
      cancelled = true;
    };
  }, [open, poll]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Poll analytics"
      subtitle={poll?.title}
      size="lg"
    >
      {error ? (
        <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-3 text-[13px] text-ink-2">
          {error}
        </p>
      ) : data === null ? (
        <div className="grid h-40 place-items-center">
          <Spinner className="size-5 text-ink-3" />
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Total votes</p>
              <p className="display mt-1.5 text-4xl">{data.total_votes}</p>
            </div>
            <div className="flex items-center gap-3">
              {data.active ? (
                <Badge color="var(--color-paid)" icon="✓">
                  Active
                </Badge>
              ) : (
                <Badge>Closed</Badge>
              )}
              <TableToggle showing={showTable} onToggle={() => setShowTable((s) => !s)} />
            </div>
          </div>

          {data.total_votes === 0 ? (
            <EmptyState title="No votes yet" body="Results appear as members vote." />
          ) : showTable ? (
            <DataTable
              columns={["Option", "Votes", "Share"]}
              rows={data.options_analytics.map((o) => [
                o.option_text,
                o.vote_count,
                `${o.percentage}%`,
              ])}
            />
          ) : (
            <BarList
              data={data.options_analytics.map((o) => ({
                id: o.option_id,
                label: o.option_text,
                value: o.vote_count,
                meta: `${o.percentage}%`,
              }))}
            />
          )}
        </>
      )}
    </Modal>
  );
}
