import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { cn, inr, PAYMENT_META, ROLE_META } from "../lib/format";
import type { ClubEvent, EventRegistrationRow, PartyMember } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { LockIcon, SearchIcon, UsersIcon } from "./icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
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
  const [refunding, setRefunding] = useState<EventRegistrationRow | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [guestBusy, setGuestBusy] = useState<string | null>(null);

  const rows = data ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    // Guest names are searchable too: someone looking for "Priya" is looking
    // for the booking she is on, which is filed under whoever paid for it.
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.guests ?? []).some((g) => g.name.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  /*
   * Counted in people, not bookings. One member booking for their family is a
   * single row, so counting rows would under-report the turnout the organiser
   * has to plan water and marshals for.
   */
  const seats = (r: EventRegistrationRow) => r.guests?.length || r.party_size || 1;
  const live = rows.filter((r) => !r.blocked_at);
  const attending = live.reduce((n, r) => n + seats(r), 0);
  const blocked = rows.filter((r) => r.blocked_at).reduce((n, r) => n + seats(r), 0);
  const ticketed = live
    .filter((r) => r.status === "PAID" || r.status === "FREE")
    .reduce((n, r) => n + seats(r), 0);
  const checkedIn = live.reduce(
    (n, r) =>
      n +
      (r.guests?.length
        ? r.guests.filter((g) => g.admitted_at).length
        : r.attended_at
          ? 1
          : 0),
    0,
  );

  /** Admit or un-admit one named person, in place. */
  const toggleGuest = async (row: EventRegistrationRow, guest: PartyMember) => {
    const admitting = !guest.admitted_at;
    setGuestBusy(guest.id);
    try {
      const res = admitting ? await api.admitGuest(guest.id) : await api.unadmitGuest(guest.id);
      setData((prev) =>
        (prev ?? []).map((r) =>
          r.id === row.id
            ? {
                ...r,
                guests: res.party,
                // Mirrors the backend's rule: the booking reads as attended
                // while anyone on it is inside, and clears when nobody is.
                attended_at: res.admitted_count > 0 ? (r.attended_at ?? new Date().toISOString()) : null,
              }
            : r,
        ),
      );
      toast(res.message, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update that person", "err");
    } finally {
      setGuestBusy(null);
    }
  };

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
                  checkedIn > 0 ? ` · ${checkedIn} checked in` : ""
                }${blocked > 0 ? ` · ${blocked} blocked` : ""}`}
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
            const party = r.guests ?? [];
            const isParty = party.length > 1;
            const inside = party.filter((g) => g.admitted_at).length;
            const open = Boolean(expanded[r.id]);

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
                    {isParty && (
                      <Badge color="var(--color-free)" icon="+">
                        Party of {party.length}
                      </Badge>
                    )}
                    {/* For a party, "checked in" would be a half-truth — the
                        booking counts as attended the moment one of them
                        arrives — so the figure is stated instead. */}
                    {!isBlocked &&
                      (isParty ? (
                        inside > 0 && (
                          <Badge
                            color={
                              inside === party.length
                                ? "var(--color-paid)"
                                : "var(--color-pending)"
                            }
                            icon={inside === party.length ? "✓" : undefined}
                          >
                            {inside} of {party.length} in
                          </Badge>
                        )
                      ) : r.attended_at ? (
                        <Badge color="var(--color-paid)" icon="✓">
                          Checked in
                        </Badge>
                      ) : null)}
                    {r.refunded_at && (
                      <Badge color="var(--color-ink-3)">Refunded {inr(r.refund_amount ?? 0)}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-ink-3">
                    {r.email} · {(ROLE_META[r.club_role] ?? ROLE_META.MEMBER).label}
                  </p>
                </div>

                <div className="ml-auto flex shrink-0 gap-2">
                  {isParty && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                      aria-expanded={open}
                    >
                      {open ? "Hide the party" : "Who's on it"}
                    </Button>
                  )}

                  {/* Refunds only apply to money actually captured. */}
                  {r.status === "PAID" && !r.refunded_at && (
                    <Button size="sm" variant="outline" onClick={() => setRefunding(r)}>
                      Refund
                    </Button>
                  )}

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

                {/* basis-full so the flex row wraps this onto its own line
                    rather than squeezing it in beside the buttons. */}
                {isParty && open && (
                  <div className="basis-full">
                    <ul className="mt-1 space-y-1.5 rounded-xl border border-white/10 bg-surface-2/50 p-2.5 sm:ml-12">
                      {party.map((g) => {
                        const arrived = Boolean(g.admitted_at);
                        return (
                          <li key={g.id} className="flex items-center gap-2.5 px-1">
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{
                                background: arrived
                                  ? "var(--color-paid)"
                                  : "var(--color-ink-3)",
                              }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                              {g.name}
                              <span className="ml-1.5 text-[11.5px] text-ink-3">
                                {g.is_booker
                                  ? "booked this"
                                  : g.kind === "KID"
                                    ? "child"
                                    : "guest"}
                              </span>
                            </span>
                            {isBlocked ? (
                              <span className="text-[11.5px] text-ink-3">—</span>
                            ) : (
                              <Button
                                size="sm"
                                variant={arrived ? "ghost" : "outline"}
                                loading={guestBusy === g.id}
                                onClick={() => void toggleGuest(r, g)}
                              >
                                {arrived ? "Not here" : "Admit"}
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
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

      <RefundDialog
        row={refunding}
        event={event}
        onClose={() => setRefunding(null)}
        onRefunded={(id, amount) =>
          setData((prev) =>
            (prev ?? []).map((r) =>
              r.id === id
                ? {
                    ...r,
                    // Mirror what the backend does: a refund lands the row in
                    // FAILED so it drops out of revenue and the ticket count.
                    status: "FAILED" as const,
                    refunded_at: new Date().toISOString(),
                    refund_amount: amount,
                  }
                : r,
            ),
          )
        }
      />
    </Card>
  );
}

/* ── Refunds ──────────────────────────────────────────────── */

/**
 * Issues a refund against a captured payment.
 *
 * Defaults to the full entry fee but allows a partial amount, which is what
 * actually happens when someone withdraws late and the club keeps a portion.
 * The registration is not deleted — the audit trail is the point.
 */
function RefundDialog({
  row,
  event,
  onClose,
  onRefunded,
}: {
  row: EventRegistrationRow | null;
  event: ClubEvent;
  onClose: () => void;
  onRefunded: (registrationId: string, amount: number) => void;
}) {
  const toast = useToast();
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a different person is opened.
  useEffect(() => {
    setPartial(false);
    setAmount(String(event.price));
    setError(null);
  }, [row, event.price]);

  const submit = async () => {
    if (!row) return;
    setError(null);

    let value: number | undefined;
    if (partial) {
      value = Number(amount);
      if (!Number.isFinite(value) || value <= 0 || value > event.price) {
        setError(`Enter an amount between 0 and ${inr(event.price)}.`);
        return;
      }
    }

    setBusy(true);
    try {
      const res = await api.refundRegistration(row.id, value);
      toast(res.message, "ok");
      onRefunded(row.id, res.amount);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title="Refund this entry?"
      subtitle={row ? `${row.name} · ${event.title}` : undefined}
    >
      {row && (
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            {inr(event.price)} was captured for this entry. A refund normally reaches the payer's
            account in 5–7 working days, and they get a notification straight away.
          </p>

          <div className="rounded-xl border border-white/8 bg-surface-2/50 p-3.5">
            <Checkbox
              checked={partial}
              onChange={setPartial}
              label="Refund only part of the fee"
            />

            {partial && (
              <div className="mt-3">
                <Field label="Amount to refund" htmlFor="refund-amount">
                  <Input
                    id="refund-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder={String(event.price)}
                  />
                </Field>
              </div>
            )}
          </div>

          <p className="rounded-xl border border-white/8 bg-surface-2/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            Their registration stays on the roster with the refund recorded against it, so the
            money movement is auditable. To also stop them attending, block them afterwards.
          </p>

          {error && (
            <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-2.5 text-[13px] text-ink-2">
              {error}
            </p>
          )}

          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" loading={busy} onClick={submit}>
              Refund {partial ? inr(Number(amount) || 0) : inr(event.price)}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
