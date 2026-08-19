import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  cn,
  countdown,
  dateParts,
  eventTime,
  inr,
  isPast,
  PAYMENT_META,
  ticketReady,
} from "../lib/format";
import { DUR, EASE } from "../lib/motion";
import { CheckoutDismissed, isMockPayment, openCheckout } from "../lib/razorpay";
import { downloadQr, extractQrDataUrl } from "../lib/share";
import type { ClubEvent, Registration } from "../lib/types";
import { ClockIcon, DisciplineIcon, DownloadIcon, PinIcon } from "./icons";
import { Confetti, Spotlight } from "./motion";
import { FlipCard, Tilt } from "./tilt";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, Spinner, useToast } from "./ui";

const EVENT_STATUS_TINT: Record<string, string> = {
  DRAFT: "var(--color-pending)",
  PUBLISHED: "var(--color-paid)",
  ARCHIVED: "var(--color-ink-3)",
};

/* ── Event card ───────────────────────────────────────────── */

export function EventCard({
  event,
  registration,
  index = 0,
  showStatus = false,
}: {
  event: ClubEvent;
  /** The viewer's registration for this event, if any. */
  registration?: Registration;
  index?: number;
  /** Admins see DRAFT/ARCHIVED badges. */
  showStatus?: boolean;
}) {
  const { day, month, weekday } = dateParts(event.date_time);
  const past = isPast(event.date_time);
  const left = countdown(event.date_time);
  const free = event.price === 0;
  const soon = !past && new Date(event.date_time).getTime() - Date.now() < 72 * 3600_000;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.reveal, delay: Math.min(index * 0.05, 0.3), ease: EASE }}
      className="h-full"
    >
      <Tilt className="h-full" max={8} lift={9}>
      <Spotlight className="h-full rounded-[var(--radius-card)]">
        <Card hover className="group h-full overflow-hidden edge-gold">
          <Link to={`/events/${event.id}`} className="flex h-full flex-col p-5">
            <div className="flex items-start gap-4" style={{ transformStyle: "preserve-3d" }}>
              {/* Calendar chip — floats above the card surface */}
              <div
                style={{ transform: "translateZ(30px)" }}
                className={cn(
                  "grid shrink-0 place-items-center rounded-xl border px-3 py-2 text-center",
                  "transition-all duration-300 group-hover:-translate-y-0.5",
                  past
                    ? "border-white/8 bg-white/3"
                    : "border-gold/25 bg-gold/8 group-hover:border-gold/50 group-hover:bg-gold/12",
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  {weekday}
                </span>
                <span
                  className={cn(
                    "display tnum text-[22px] leading-none",
                    past ? "text-ink-2" : "text-gold",
                  )}
                >
                  {day}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  {month}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-gold transition-transform duration-300 group-hover:scale-110">
                    <DisciplineIcon type={event.type} className="size-3.5" />
                  </span>
                  <span className="eyebrow truncate">{event.type}</span>
                  {soon && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-gold/12 px-1.5 py-0.5">
                      <span className="size-1 rounded-full bg-gold pulse-ring" aria-hidden />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gold">
                        Soon
                      </span>
                    </span>
                  )}
                </div>
                <h3 className="mt-1.5 truncate text-[16px] font-semibold leading-snug text-ink transition-colors duration-300 group-hover:text-gold">
                  {event.title}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-ink-3">
                  <PinIcon className="size-3.5 shrink-0" />
                  {event.location}
                </p>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
              <span
                className={cn(
                  "rounded-lg px-2 py-1 text-[12px] font-semibold",
                  free ? "bg-gold/14 text-gold" : "bg-white/6 text-ink",
                )}
              >
                {free ? "Free" : inr(event.price)}
              </span>

              <span className="flex items-center gap-1 text-[12px] text-ink-3">
                <ClockIcon className="size-3.5" />
                {eventTime(event.date_time)}
              </span>

              {showStatus && event.status !== "PUBLISHED" && (
                <Badge color={EVENT_STATUS_TINT[event.status]}>{event.status}</Badge>
              )}

              {/* Places remaining. Only worth the space when it's scarce or gone —
                  "38 of 40 left" is noise on a card. */}
              {!past && event.capacity != null && (
                event.full ? (
                  <Badge color="var(--color-failed)">Full</Badge>
                ) : event.spots_left != null && event.spots_left <= 5 ? (
                  <Badge color="var(--color-pending)">
                    {event.spots_left} left
                  </Badge>
                ) : null
              )}

              <span className="ml-auto flex items-center gap-2">
                {registration?.blocked_at ? (
                  <Badge color="var(--color-failed)" icon="✕">
                    Removed
                  </Badge>
                ) : registration ? (
                  <Badge
                    color={PAYMENT_META[registration.status].color}
                    icon={PAYMENT_META[registration.status].icon}
                  >
                    {PAYMENT_META[registration.status].label}
                  </Badge>
                ) : past ? (
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Done
                  </span>
                ) : left ? (
                  <span className="tnum text-[11px] font-semibold uppercase tracking-wider text-gold">
                    in {left}
                  </span>
                ) : null}
              </span>
            </div>
          </Link>
        </Card>
      </Spotlight>
      </Tilt>
    </motion.div>
  );
}

/* ── Registration dialog ──────────────────────────────────── */

export function RegisterDialog({
  event,
  open,
  onClose,
  onDone,
}: {
  event: ClubEvent;
  open: boolean;
  onClose: () => void;
  onDone: (registration: Registration) => void;
}) {
  const { user, patchUser, role } = useAuth();
  const toast = useToast();

  const [contact, setContact] = useState(user?.emergency_contact ?? "");
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Drives the button label through hold → pay → verify. */
  const [stage, setStage] = useState<"idle" | "paying" | "verifying">("idle");
  const [celebrate, setCelebrate] = useState(false);

  /** Short gold burst once a spot is actually secured. */
  const cheer = () => {
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 1700);
  };

  useEffect(() => {
    if (open) {
      setContact(user?.emergency_contact ?? "");
      setWaiver(false);
      setError(null);
      setStage("idle");
    }
  }, [open, user?.emergency_contact]);

  // Volunteers are comped by the backend regardless of price.
  const comped = role === "VOLUNTEER" || event.price === 0;

  const submit = async () => {
    setError(null);
    if (!contact.trim()) {
      setError("An emergency contact is required to register.");
      return;
    }
    if (!waiver) {
      setError("You must sign the liability waiver to register.");
      return;
    }

    setBusy(true);

    // Held outside the try so the catch can still report the reserved spot if
    // the payment step is abandoned — registration and payment are separate.
    let held: Registration | null = null;

    try {
      const res = await api.registerForEvent(event.id, {
        waiver_signed: true,
        emergency_contact: contact.trim(),
      });
      patchUser({ emergency_contact: contact.trim() });
      held = res.registration;

      // Comped and free entries are already settled server-side.
      if (res.registration.status !== "PENDING") {
        cheer();
        toast(res.message, "ok");
        onDone(res.registration);
        onClose();
        return;
      }

      const orderId = res.registration.razorpay_order_id;

      // No real credentials on the backend: the order id is a mock that
      // Checkout would reject, so don't pretend to open a payment window.
      if (!orderId || isMockPayment(res.razorpay_key_id, orderId)) {
        toast("Spot held — card payments aren't configured on this backend.", "info");
        onDone(res.registration);
        onClose();
        return;
      }

      setStage("paying");
      const result = await openCheckout({
        keyId: res.razorpay_key_id,
        orderId,
        amountPaise: res.amount,
        eventTitle: event.title,
        userName: user?.name ?? "",
        userEmail: user?.email ?? "",
        contact: contact.trim(),
      });

      setStage("verifying");
      const verified = await api.verifyPayment(result);
      cheer();
      toast("Payment confirmed — your ticket is live.", "ok");
      onDone(verified.registration);
      onClose();
    } catch (err) {
      // Closing the payment overlay is not a failure: the spot is still held.
      if (err instanceof CheckoutDismissed && held) {
        toast("Spot held — pay from My tickets when you're ready.", "info");
        onDone(held);
        onClose();
        return;
      }
      /**
       * 409 means the last place went while this dialog was open. Say so plainly —
       * the generic "Registration failed" reads like a bug when it isn't, and there
       * is nothing the member can retry.
       */
      if (err instanceof ApiError && err.status === 409) {
        setError("The last place just went — this event filled up while you were signing up.");
      } else {
        setError(err instanceof Error ? err.message : "Registration failed");
      }
      // The registration exists even though payment didn't finish; surface it
      // so the caller's list stays in step with the server.
      if (held) onDone(held);
    } finally {
      setBusy(false);
      setStage("idle");
    }
  };

  return (
    <>
      <Confetti show={celebrate} />
    <Modal
      open={open}
      onClose={onClose}
      title={`Register — ${event.title}`}
      subtitle={`${dateParts(event.date_time).weekday} ${dateParts(event.date_time).day} ${
        dateParts(event.date_time).month
      } · ${eventTime(event.date_time)} · ${event.location}`}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-surface-2/60 px-4 py-3">
          <span className="eyebrow">Your total</span>
          <span className="display text-xl">
            {comped ? "Free" : inr(event.price)}
          </span>
        </div>

        {comped && (
          <p className="rounded-xl border border-[color:var(--color-free)]/25 bg-[color:var(--color-free)]/8 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
            <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-free)]">
              ★
            </span>
            {role === "VOLUNTEER"
              ? "Volunteers are comped — your ticket is issued immediately."
              : "This event is free — your ticket is issued immediately."}
          </p>
        )}

        <Field
          label="Emergency contact"
          htmlFor="contact"
          hint="Saved to your profile and shared with organisers on the day."
        >
          <Input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="+91 99999 88888"
            autoComplete="tel"
          />
        </Field>

        <div className="rounded-xl border border-white/8 bg-surface-2/40 p-4">
          <Checkbox
            checked={waiver}
            onChange={setWaiver}
            label="I sign the liability waiver"
            description="I confirm I am medically fit to take part, and I accept that B Squared Run Club is not liable for injury or loss during the event."
          />
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
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} className="flex-1">
            {comped
              ? "Confirm spot"
              : stage === "paying"
                ? "Waiting for payment…"
                : stage === "verifying"
                  ? "Confirming…"
                  : `Pay ${inr(event.price)}`}
          </Button>
        </div>

        {!comped && (
          <p className="text-center text-[11px] leading-relaxed text-ink-3">
            Your spot is held, then the Razorpay payment window opens over this page. The ticket
            unlocks as soon as the payment is confirmed.
          </p>
        )}
      </div>
    </Modal>
    </>
  );
}

/* ── Ticket viewer ────────────────────────────────────────── */

/** The backend renders the ticket as a standalone HTML document (with the QR
 *  as an embedded data URL), and requires the bearer token — so it is fetched
 *  here and shown in a sandboxed iframe rather than opened in a new tab. */
export function TicketModal({
  registration,
  open,
  onClose,
}: {
  registration: Registration | null;
  open: boolean;
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The ticket lands face-down and flips over once the QR has loaded. */
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!open || !registration) return;
    let cancelled = false;
    setHtml(null);
    setQr(null);
    setError(null);
    setFlipped(false);

    api
      .ticketHtml(registration.id)
      .then((doc) => {
        if (cancelled) return;
        setHtml(doc);
        // Pull the inlined QR out so it can be saved on its own.
        setQr(extractQrDataUrl(doc));
        // Turn it face-up a beat later, so the flip is actually seen.
        setTimeout(() => setFlipped(true), 220);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load ticket");
      });

    return () => {
      cancelled = true;
    };
  }, [open, registration]);

  const meta = registration ? PAYMENT_META[registration.status] : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={registration?.event?.title ?? "Your ticket"}
      subtitle="Show this QR code at the start line."
    >
      {registration && !ticketReady(registration.status) ? (
        <div className="rounded-xl border border-white/8 bg-surface-2/50 p-5 text-center">
          <span
            aria-hidden
            className="mx-auto mb-3 grid size-10 place-items-center rounded-full text-lg font-bold"
            style={{ background: `${meta?.color}26`, color: meta?.color }}
          >
            {meta?.icon}
          </span>
          <p className="text-sm font-semibold text-ink">{meta?.label}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{meta?.note}</p>
        </div>
      ) : error ? (
        <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-3 text-[13px] text-ink-2">
          {error}
        </p>
      ) : html ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DUR.base, ease: EASE }}
        >
          <FlipCard
            flipped={flipped}
            className="h-[560px] w-full"
            front={
              <div className="grid h-[560px] w-full place-items-center rounded-xl border border-gold/25 bg-gradient-to-br from-surface-2 to-surface text-center">
                <div>
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold text-[color:var(--color-gold-ink)]">
                    <span className="display flex items-start text-[22px] leading-none">
                      B<span className="ml-px text-[12px] leading-none">2</span>
                    </span>
                  </div>
                  <p className="eyebrow mt-4">B Squared Run Club</p>
                  <p className="mt-1 text-[13px] text-ink-3">Turning your ticket over…</p>
                </div>
              </div>
            }
            back={
              <iframe
                title="Event ticket"
                sandbox=""
                srcDoc={html}
                className="h-[560px] w-full rounded-xl border border-white/8 bg-white"
              />
            }
          />

          <div className="mt-4 flex flex-wrap gap-2.5">
            {qr && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => downloadQr(qr, registration?.event?.title ?? "ticket")}
              >
                <DownloadIcon className="size-3.5" />
                Save QR
              </Button>
            )}
            <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>
              Done
            </Button>
          </div>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-3">
            A screenshot works too — we only need to scan the code.
          </p>
        </motion.div>
      ) : (
        <div className="grid h-[560px] place-items-center rounded-xl border border-white/8 bg-surface-2/40">
          <Spinner className="size-6 text-ink-3" />
        </div>
      )}
    </Modal>
  );
}
