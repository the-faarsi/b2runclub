import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CancelRegistrationDialog } from "../components/cancelDialog";
import { TicketModal } from "../components/events";
import { DisciplineIcon } from "../components/icons";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CheckoutDismissed, isMockPayment, openCheckout, publishableKey } from "../lib/razorpay";
import {
  dateParts,
  eventTime,
  fullDate,
  inr,
  isPast,
  PAYMENT_META,
  ticketReady,
} from "../lib/format";
import type { Registration } from "../lib/types";
import { useFetch } from "../lib/useFetch";

type Filter = "upcoming" | "past" | "all";

export function MyTickets() {
  const load = useCallback(() => api.myRegistrations(), []);
  const { data, loading, error, reload, setData } = useFetch(load);
  const { user } = useAuth();
  const toast = useToast();

  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [active, setActive] = useState<Registration | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Registration | null>(null);
  /** Tells us whether to open Checkout or offer the dev simulation. */
  const loadCfg = useCallback(() => api.paymentConfig(), []);
  const { data: payCfg } = useFetch(loadCfg);

  const regs = data ?? [];

  /**
   * Resume payment for a registration left at PENDING. The order already
   * exists on the registration; only the publishable key has to come from
   * config, since the register response that carried it is long gone.
   */
  const payNow = async (reg: Registration) => {
    let orderId = reg.razorpay_order_id;
    const keyId = publishableKey();

    if (!orderId || isMockPayment(keyId, orderId)) {
      // No real credentials at all? Settle the mock order through the dev-only
      // route so the flow still completes, rather than dead-ending on a toast.
      if (payCfg?.simulation_available) {
        setPayingId(reg.id);
        try {
          const res = await api.simulatePayment(reg.id);
          setData((prev) =>
            (prev ?? []).map((r) =>
              r.id === reg.id ? { ...res.registration, event: r.event } : r,
            ),
          );
          toast(`${res.message} (development mode — no card was charged)`, "ok");
        } catch (err) {
          toast(err instanceof Error ? err.message : "Could not settle the payment", "err");
        } finally {
          setPayingId(null);
        }
        return;
      }

      /**
       * Real keys are configured but this registration still carries a mock order
       * from before they were added. Checkout would reject it and simulation is
       * off, so the entry used to be permanently unpayable. Re-mint a genuine
       * order and carry straight on into Checkout.
       */
      if (!payCfg?.mock_mode && keyId) {
        setPayingId(reg.id);
        try {
          const fresh = await api.refreshPaymentOrder(reg.id);
          orderId = fresh.razorpay_order_id;
          setData((prev) =>
            (prev ?? []).map((r) =>
              r.id === reg.id ? { ...r, razorpay_order_id: fresh.razorpay_order_id } : r,
            ),
          );
        } catch (err) {
          toast(err instanceof Error ? err.message : "Could not prepare the payment", "err");
          setPayingId(null);
          return;
        }
      } else {
        toast(
          "Card payments aren't configured on this backend — see the README to add Razorpay keys.",
          "info",
        );
        return;
      }
    }

    setPayingId(reg.id);
    try {
      const result = await openCheckout({
        keyId: keyId!,
        orderId: orderId!,
        amountPaise: Math.round((reg.event?.price ?? 0) * 100),
        eventTitle: reg.event?.title ?? "Event",
        userName: user?.name ?? "",
        userEmail: user?.email ?? "",
        contact: user?.emergency_contact,
      });
      const verified = await api.verifyPayment(result);
      setData((prev) =>
        (prev ?? []).map((r) =>
          r.id === reg.id ? { ...verified.registration, event: r.event } : r,
        ),
      );
      toast("Payment confirmed — your ticket is live.", "ok");
    } catch (err) {
      if (err instanceof CheckoutDismissed) {
        toast("Payment cancelled — your spot is still held.", "info");
      } else {
        toast(err instanceof Error ? err.message : "Payment failed", "err");
      }
    } finally {
      setPayingId(null);
    }
  };

  // Deep link from a notification: /tickets?open=<registrationId>
  useEffect(() => {
    const openId = params.get("open");
    if (!openId || regs.length === 0) return;
    const match = regs.find((r) => r.id === openId);
    if (match) {
      setActive(match);
      setFilter("all");
    }
    params.delete("open");
    setParams(params, { replace: true });
  }, [params, regs, setParams]);

  const counts = useMemo(() => {
    const upcoming = regs.filter((r) => r.event && !isPast(r.event.date_time)).length;
    return { upcoming, past: regs.length - upcoming, all: regs.length };
  }, [regs]);

  const visible = useMemo(() => {
    let list = [...regs];
    if (filter === "upcoming") list = list.filter((r) => r.event && !isPast(r.event.date_time));
    if (filter === "past") list = list.filter((r) => r.event && isPast(r.event.date_time));

    list.sort((a, b) => {
      const at = a.event ? +new Date(a.event.date_time) : 0;
      const bt = b.event ? +new Date(b.event.date_time) : 0;
      return filter === "past" ? bt - at : at - bt;
    });
    return list;
  }, [regs, filter]);

  // A blocked registration is neither live nor awaiting payment — it is out.
  const live = regs.filter((r) => ticketReady(r.status) && !r.blocked_at).length;
  const awaiting = regs.filter((r) => r.status === "PENDING" && !r.blocked_at).length;
  const removed = regs.filter((r) => r.blocked_at).length;

  return (
    <Page>
      <PageScene variant="lattice" opacity={0.26} />
      <PageHeader
        eyebrow="Your spots"
        title="My tickets"
        description="Every event you've registered for. Live tickets carry a QR code to scan at the start line."
        action={
          <Link to="/events" className={buttonClass("outline", "md")}>
            Find an event
          </Link>
        }
      />

      {/* Summary strip */}
      {!loading && !error && regs.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Live tickets", value: live, color: "var(--color-paid)", icon: "✓" },
            { label: "Awaiting payment", value: awaiting, color: "var(--color-pending)", icon: "◍" },
            removed > 0
              ? { label: "Removed", value: removed, color: "var(--color-failed)", icon: "✕" }
              : {
                  label: "Total registrations",
                  value: regs.length,
                  color: undefined,
                  icon: undefined,
                },
          ].map((s) => (
            <Card key={s.label} className="flex items-center justify-between p-4">
              <span className="eyebrow">{s.label}</span>
              <span className="flex items-center gap-2">
                {s.icon && (
                  <span
                    aria-hidden
                    className="grid size-5 place-items-center rounded-full text-[11px] font-bold"
                    style={{ background: `${s.color}26`, color: s.color }}
                  >
                    {s.icon}
                  </span>
                )}
                <span className="display tnum text-2xl">{s.value}</span>
              </span>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-6">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "upcoming", label: "Upcoming", count: counts.upcoming },
            { value: "past", label: "Past", count: counts.past },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex items-center gap-4 p-5">
              <Skeleton className="size-14 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-9 w-28 rounded-lg" />
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
            icon={<span aria-hidden>◈</span>}
            title={regs.length === 0 ? "No tickets yet" : "Nothing in this tab"}
            body={
              regs.length === 0
                ? "Register for an event and your ticket shows up here."
                : "Switch tabs to see your other registrations."
            }
            action={
              <Link to="/events" className={buttonClass("gold", "sm")}>
                Browse events
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((reg, i) => {
            const ev = reg.event;
            const meta = PAYMENT_META[reg.status];
            const blocked = Boolean(reg.blocked_at);
            const ready = ticketReady(reg.status) && !blocked;
            const parts = ev ? dateParts(ev.date_time) : null;
            const past = ev ? isPast(ev.date_time) : false;

            return (
              <motion.div
                key={reg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.25) }}
              >
                <Card hover className="p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    {parts && (
                      <div
                        className={`grid shrink-0 place-items-center rounded-xl border px-3 py-2 text-center ${
                          past ? "border-white/8 bg-white/3" : "border-gold/25 bg-gold/8"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                          {parts.weekday}
                        </span>
                        <span
                          className={`display tnum text-[20px] leading-none ${
                            past ? "text-ink-2" : "text-gold"
                          }`}
                        >
                          {parts.day}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                          {parts.month}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {ev && (
                          <span className="text-[11px] text-gold" aria-hidden>
                            <DisciplineIcon type={ev.type} className="size-3.5" />
                          </span>
                        )}
                        <Link
                          to={ev ? `/events/${ev.id}` : "/events"}
                          className="truncate text-[15px] font-semibold text-ink transition-colors hover:text-gold"
                        >
                          {ev?.title ?? "Event"}
                        </Link>
                        {blocked ? (
                          <Badge color="var(--color-failed)" icon="✕">
                            Removed by organiser
                          </Badge>
                        ) : (
                          <Badge color={meta.color} icon={meta.icon}>
                            {meta.label}
                          </Badge>
                        )}
                        {reg.role_at_event === "VOLUNTEER" && (
                          <Badge color="var(--color-free)">Marshal</Badge>
                        )}
                      </div>

                      <p className="mt-1.5 text-[13px] text-ink-3">
                        {ev ? (
                          <>
                            {fullDate(ev.date_time)} · {eventTime(ev.date_time)} · {ev.location}
                            {ev.price > 0 && <> · {inr(ev.price)}</>}
                          </>
                        ) : (
                          "Event details unavailable"
                        )}
                      </p>

                      {blocked ? (
                        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                          An organiser removed you from this event — your ticket is no longer valid.
                        </p>
                      ) : !ready ? (
                        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{meta.note}</p>
                      ) : null}
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {blocked ? (
                        <Button size="sm" variant="outline" onClick={() => setActive(reg)}>
                          Details
                        </Button>
                      ) : ready ? (
                        <Button size="sm" onClick={() => setActive(reg)}>
                          View ticket
                        </Button>
                      ) : (
                        <>
                          {reg.status === "PENDING" && !past && (
                            <Button
                              size="sm"
                              loading={payingId === reg.id}
                              onClick={() => payNow(reg)}
                            >
                              Pay {reg.event ? inr(reg.event.price) : "now"}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setActive(reg)}>
                            Status
                          </Button>
                        </>
                      )}

                      {!past && !blocked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCancelling(reg)}
                          aria-label={`Cancel registration for ${ev?.title ?? "event"}`}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <TicketModal
        registration={active}
        open={active !== null}
        onClose={() => setActive(null)}
      />

      <CancelRegistrationDialog
        registration={cancelling}
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onCancelled={(id) => setData((prev) => (prev ?? []).filter((r) => r.id !== id))}
      />
    </Page>
  );
}
