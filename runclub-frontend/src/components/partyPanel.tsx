import { useCallback, useState } from "react";
import { api, ApiError } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { CheckInResult, PartyMember } from "../lib/types";
import { Badge, Button } from "./ui";

/** A scanned booking that covers more than one person, held open for the crew. */
export type ScannedParty = {
  registrationId: string;
  bookedBy: string;
  members: PartyMember[];
};

/**
 * Reads a scan result and decides whether the crew have a choice to make.
 *
 * A party of one is admitted by the scan itself, so there is nothing to show.
 * Anything larger returns the party: the scan cannot know which of them turned
 * up, so it reports who the QR covers and admits nobody.
 */
export function partyFromScan(
  res: CheckInResult,
  fallbackRegistrationId?: string,
): ScannedParty | null {
  if ((res.party_size ?? 1) <= 1 || !res.party?.length) return null;
  return {
    registrationId: res.registration_id ?? fallbackRegistrationId ?? "",
    bookedBy: res.name,
    members: res.party,
  };
}

/**
 * The people one QR admits, with a tap each.
 *
 * Shared by the phone scanning sheet and the event-day console, which is the
 * whole point: a marshal at the line and an organiser at a table are doing the
 * same job — ticking off arrivals by name — and a party half-admitted on one
 * screen has to read the same on the other.
 *
 * Deliberately not self-dismissing. The banner it replaced cleared itself after
 * a few seconds, which would take the list away mid-job.
 */
export function PartyPanel({
  party,
  onChange,
  onClose,
  onAdmittedCountChange,
}: {
  party: ScannedParty;
  /** Called with the re-seated party after each admit or un-admit. */
  onChange: (members: PartyMember[]) => void;
  onClose: () => void;
  /** +1 when someone is admitted, -1 when put back, for a running tally. */
  onAdmittedCountChange?: (delta: number) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inside = party.members.filter((m) => m.admitted_at).length;
  const all = inside === party.members.length;

  const toggle = useCallback(
    async (member: PartyMember) => {
      const admitting = !member.admitted_at;
      setPending(member.id);
      setError(null);
      try {
        const res = admitting
          ? await api.admitGuest(member.id)
          : await api.unadmitGuest(member.id);
        onChange(res.party);
        onAdmittedCountChange?.(admitting ? 1 : -1);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not update that person");
      } finally {
        setPending(null);
      }
    },
    [onChange, onAdmittedCountChange],
  );

  return (
    <div className="rounded-xl border border-gold/35 bg-gold/[0.05] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">{party.bookedBy}'s booking</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Covers {party.members.length} people. Tap each one as they arrive.
          </p>
        </div>
        <Badge color={all ? "var(--color-paid)" : "var(--color-pending)"}>
          {inside} of {party.members.length} in
        </Badge>
      </div>

      {error && (
        <p className="mt-2.5 rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[12.5px] text-ink-2">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {party.members.map((m) => {
          const here = Boolean(m.admitted_at);
          return (
            <li
              key={m.id}
              className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-surface-2/60 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">{m.name}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  {m.is_booker ? "Booked this" : m.kind === "KID" ? "Child" : "Guest"}
                  {here && ` · in ${relativeTime(m.admitted_at!)}`}
                </p>
              </div>
              <Button
                size="sm"
                variant={here ? "outline" : "gold"}
                loading={pending === m.id}
                onClick={() => void toggle(m)}
              >
                {here ? "Not here" : "Admit"}
              </Button>
            </li>
          );
        })}
      </ul>

      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onClose}>
        {all ? "Next ticket" : "Leave the rest outstanding"}
      </Button>
    </div>
  );
}
