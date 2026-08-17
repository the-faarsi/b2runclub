import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { api } from "../lib/api";
import { cn, PAYMENT_META, ROLE_META } from "../lib/format";
import type { ClubEvent, EventRegistrationRow } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { LockIcon, SearchIcon, UsersIcon } from "./icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  useToast,
} from "./ui";

/**
 * Organiser view of who is coming to one event, with the ability to bar someone.
 * Blocking leaves the payment status alone — it only revokes attendance — so an
 * accidental block is undone by readmitting them.
 */
export function EventRoster({ event }: { event: ClubEvent }) {
  const toast = useToast();
  const load = useCallback(() => api.eventRegistrations(event.id), [event.id]);
  const { data, loading, error, reload, setData } = useFetch(load);

  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ row: EventRegistrationRow; block: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const rows = data ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const attending = rows.filter((r) => !r.blocked_at).length;
  const blocked = rows.length - attending;
  const ticketed = rows.filter(
    (r) => !r.blocked_at && (r.status === "PAID" || r.status === "FREE"),
  ).length;

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await api.setRegistrationBlocked(pending.row.id, pending.block);
      setData((prev) =>
        (prev ?? []).map((r) =>
          r.id === pending.row.id
            ? { ...r, blocked_at: pending.block ? new Date().toISOString() : null }
            : r,
        ),
      );
      toast(res.message, "ok");
      setPending(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <UsersIcon className="size-4 text-gold" />
            Who's registered
          </h2>
          <p className="mt-1 text-[12px] text-ink-3">
            {loading
              ? "Loading the roster…"
              : `${attending} attending · ${ticketed} ticket-ready${
                  blocked > 0 ? ` · ${blocked} blocked` : ""
                }`}
          </p>
        </div>

        {rows.length > 4 && (
          <div className="relative w-full sm:w-56">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              <SearchIcon className="size-4" />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the roster"
              aria-label="Search the roster"
              className="h-10 pl-9"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title={query ? "Nobody matches that" : "Nobody registered yet"}
          body={
            query
              ? "Try a different name or email."
              : "Registrations will appear here as members take spots."
          }
        />
      ) : (
        <ul>
          {visible.map((r, i) => {
            const meta = PAYMENT_META[r.status];
            const isBlocked = Boolean(r.blocked_at);

            return (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i * 0.03, 0.2) }}
                className={cn(
                  "flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-3.5 last:border-0",
                  isBlocked && "bg-[color:var(--color-failed)]/6",
                )}
              >
                <Avatar name={r.name} size={36} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-[14px] font-medium",
                        isBlocked ? "text-ink-3 line-through" : "text-ink",
                      )}
                    >
                      {r.name}
                    </span>

                    {isBlocked ? (
                      <Badge color="var(--color-failed)" icon="✕">
                        Blocked
                      </Badge>
                    ) : (
                      <Badge color={meta.color} icon={meta.icon}>
                        {meta.label}
                      </Badge>
                    )}

                    {r.role_at_event === "VOLUNTEER" && (
                      <Badge color="var(--color-free)">Marshal</Badge>
                    )}
                    {!r.waiver_signed && (
                      <Badge color="var(--color-pending)">No waiver</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-ink-3">
                    {r.email} · {(ROLE_META[r.club_role] ?? ROLE_META.MEMBER).label}
                  </p>
                </div>

                <div className="ml-auto shrink-0">
                  {isBlocked ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPending({ row: r, block: false })}
                    >
                      Readmit
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setPending({ row: r, block: true })}
                    >
                      <LockIcon className="size-3.5" />
                      Block
                    </Button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.block ? "Block from this event?" : "Readmit to this event?"}
        subtitle={pending ? `${pending.row.name} · ${event.title}` : undefined}
      >
        {pending && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              {pending.block ? (
                <>
                  {pending.row.name.split(" ")[0]} keeps their place on the roster but can't attend:
                  their QR ticket stops working and they can't register again for this event.
                </>
              ) : (
                <>
                  {pending.row.name.split(" ")[0]} can attend again and their ticket becomes valid.
                </>
              )}
            </p>

            {pending.block && (
              <p className="rounded-xl border border-white/8 bg-surface-2/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                Their payment status stays <strong>{PAYMENT_META[pending.row.status].label}</strong>
                , so nothing is refunded and nothing is lost — readmitting them puts everything
                back. To remove them from the roster entirely, cancel the registration instead.
              </p>
            )}

            <p className="text-[12px] text-ink-3">They'll get a notification either way.</p>

            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                variant={pending.block ? "danger" : "gold"}
                className="flex-1"
                loading={busy}
                onClick={apply}
              >
                {pending.block ? "Block" : "Readmit"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
