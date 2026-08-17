import { useState } from "react";
import { api } from "../lib/api";
import { eventTime, fullDate, inr, PAYMENT_META } from "../lib/format";
import type { Registration } from "../lib/types";
import { Button, Modal, useToast } from "./ui";

/**
 * Confirmation for giving up a spot. Used from My tickets, the event page and
 * the calendar so the wording and the rules are identical everywhere.
 *
 * A PAID entry cannot be self-cancelled — the backend refuses it because it
 * implies a refund — so the dialog says so instead of offering a button that
 * would fail.
 */
export function CancelRegistrationDialog({
  registration,
  open,
  onClose,
  onCancelled,
  /** Admins may remove a paid entry on someone's behalf. */
  asAdmin = false,
}: {
  registration: Registration | null;
  open: boolean;
  onClose: () => void;
  onCancelled: (registrationId: string) => void;
  asAdmin?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const ev = registration?.event;
  const needsRefund = registration?.status === "PAID";
  const blocked = Boolean(registration?.blocked_at);
  const canProceed = registration !== null && !blocked && (asAdmin || !needsRefund);

  const submit = async () => {
    if (!registration) return;
    setBusy(true);
    try {
      const res = await api.cancelRegistration(registration.id);
      onCancelled(registration.id);
      toast(
        res.refund_due
          ? "Spot released. This entry was paid — arrange the refund separately."
          : "Spot released. You're no longer registered.",
        "ok",
      );
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not cancel", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Give up your spot?"
      subtitle={
        ev ? `${ev.title} · ${fullDate(ev.date_time)} · ${eventTime(ev.date_time)}` : undefined
      }
    >
      {registration && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-surface-2/60 px-4 py-3">
            <span className="eyebrow">Current status</span>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid size-5 place-items-center rounded-full text-[11px] font-bold"
                style={{
                  background: `${PAYMENT_META[registration.status].color}26`,
                  color: PAYMENT_META[registration.status].color,
                }}
              >
                {PAYMENT_META[registration.status].icon}
              </span>
              <span className="text-[13px] font-semibold text-ink">
                {PAYMENT_META[registration.status].label}
              </span>
            </span>
          </div>

          {blocked ? (
            <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
              An organiser has removed you from this event, so there is nothing to cancel. Contact
              them if you think that's a mistake.
            </p>
          ) : needsRefund && !asAdmin ? (
            <p className="rounded-xl border border-[color:var(--color-pending)]/30 bg-[color:var(--color-pending)]/8 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
              You've already paid {ev ? inr(ev.price) : "for this event"}. Cancelling means a
              refund, so an organiser has to do it — ask in the forum and they'll sort it out.
            </p>
          ) : (
            <>
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                Your place goes back to the club and your ticket stops working. You can register
                again later if there's still room.
              </p>
              {needsRefund && asAdmin && (
                <p className="rounded-xl border border-[color:var(--color-pending)]/30 bg-[color:var(--color-pending)]/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                  <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-pending)]">
                    ◍
                  </span>
                  This entry was paid. Cancelling removes it from the roster and from revenue — the
                  refund itself has to be issued in Razorpay.
                </p>
              )}
            </>
          )}

          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              {canProceed ? "Keep my spot" : "Close"}
            </Button>
            {canProceed && (
              <Button variant="danger" className="flex-1" loading={busy} onClick={submit}>
                Cancel registration
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
