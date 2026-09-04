import { useCallback, useState } from "react";
import { api, ApiError } from "../lib/api";
import { cn, relativeTime } from "../lib/format";
import type { CheckInResult, ClubEvent } from "../lib/types";
import { PartyPanel, partyFromScan, type ScannedParty } from "./partyPanel";
import { QrScanner, insecureContext, scannerSupported } from "./qrScanner";
import { Badge, Button, Card, Input, Modal, useToast } from "./ui";

type Feedback = { kind: "ok" | "repeat" | "err"; title: string; body?: string };

const FEEDBACK_TINT: Record<Feedback["kind"], string> = {
    ok: "var(--color-paid)",
    repeat: "var(--color-pending)",
    err: "var(--color-failed)",
};

/**
 * Check-in from the event page, in a full-screen sheet.
 *
 * The event-day console exists and does more, but it is a three-panel layout
 * built for a laptop on a table. At a start line the organiser is holding a
 * phone in one hand, so scanning needs to be reachable in one tap from the page
 * they are already on, with the camera filling the screen and the controls under
 * a thumb.
 *
 * Deliberately only scanning and a manual fallback — marshal posts and
 * checkpoints stay in the console, where there is room for them.
 */
export function QuickCheckIn({ event }: { event: ClubEvent }) {
    const toast = useToast();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [manual, setManual] = useState("");
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [party, setParty] = useState<ScannedParty | null>(null);
    const [count, setCount] = useState(0);

    const supported = scannerSupported();
    const insecure = insecureContext();

    /** Clears the banner so the scanner resumes rather than staying paused. */
    const flash = useCallback((f: Feedback) => {
        setFeedback(f);
        window.setTimeout(() => setFeedback((cur) => (cur === f ? null : cur)), 3500);
    }, []);

    const submit = useCallback(
        async (input: { registration_id?: string; qr_payload?: string }) => {
            setBusy(true);
            try {
                const res: CheckInResult = await api.checkIn({ ...input, event_id: event.id });

                /*
                 * A booking for several people opens the list instead of
                 * flashing a name — the scan cannot decide who arrived, so the
                 * crew admit them by name.
                 */
                const scanned = partyFromScan(res, input.registration_id);
                if (scanned) {
                    setParty(scanned);
                    setFeedback(null);
                    return;
                }

                if (res.already_checked_in) {
                    flash({
                        kind: "repeat",
                        title: `${res.name} was already in`,
                        body: res.attended_at ? `Scanned ${relativeTime(res.attended_at)}.` : undefined,
                    });
                } else {
                    flash({ kind: "ok", title: `${res.name} checked in`, body: "Send them through." });
                    setCount((c) => c + 1);
                }
            } catch (err) {
                // The backend distinguishes wrong event / blocked / unpaid, and
                // each of those tells the organiser what to actually do.
                flash({ kind: "err", title: err instanceof ApiError ? err.message : "Check-in failed" });
            } finally {
                setBusy(false);
            }
        },
        [event.id, flash],
    );

    const submitManual = async () => {
        const id = manual.trim();
        if (!id) return;
        await submit({ registration_id: id });
        setManual("");
    };

    return (
        <>
            {/* The prompt. Gold-bordered so it reads as the primary action on the
                page for crew, not another link in a list. */}
            <Card className="border-gold/35 bg-gold/[0.05] p-5">
                <div className="flex items-start gap-3">
                    <span
                        className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold text-[color:var(--color-gold-ink)]"
                        aria-hidden
                    >
                        <svg viewBox="0 0 24 24" className="size-5" fill="none">
                            <path
                                d="M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2m10-16h2a1 1 0 0 1 1 1v2m-3 13h2a1 1 0 0 0 1-1v-2M8 8h3v3H8zm5 5h3v3h-3zm0-5h3M8 13h3"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-ink">Scan tickets</h3>
                            {count > 0 && (
                                <Badge color="var(--color-paid)" icon="✓">
                                    {count} in
                                </Badge>
                            )}
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                            Works on your phone — rear camera, torch, full screen. Check people in
                            at the line without opening the console.
                        </p>
                    </div>
                </div>

                <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
                    Open the scanner
                </Button>
            </Card>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title="Check in"
                subtitle={event.title}
                size="lg"
            >
                <div className="space-y-4">
                    {/* Result banner sits above the camera so a thumb on the
                        controls never covers it. */}
                    {feedback && (
                        <div
                            className="rounded-xl border p-3.5"
                            style={{
                                borderColor: `color-mix(in oklab, ${FEEDBACK_TINT[feedback.kind]} 45%, transparent)`,
                                background: `color-mix(in oklab, ${FEEDBACK_TINT[feedback.kind]} 12%, transparent)`,
                            }}
                            role="status"
                        >
                            <p
                                className="text-[14px] font-semibold"
                                style={{ color: FEEDBACK_TINT[feedback.kind] }}
                            >
                                {feedback.title}
                            </p>
                            {feedback.body && (
                                <p className="mt-0.5 text-[12.5px] text-ink-2">{feedback.body}</p>
                            )}
                        </div>
                    )}

                    {/* The scanned party — everyone the QR admits, with a
                        tap each. Shared with the event-day console so a party
                        half-admitted on one screen reads the same on both. */}
                    {party && (
                        <PartyPanel
                            party={party}
                            onChange={(members) =>
                                setParty((cur) => (cur ? { ...cur, members } : cur))
                            }
                            onClose={() => setParty(null)}
                            // The tally counts people through the line, so an
                            // undo takes one back off rather than leaving the
                            // figure overstated.
                            onAdmittedCountChange={(d) => setCount((c) => Math.max(0, c + d))}
                        />
                    )}

                    {insecure ? (
                        <p className="rounded-xl border border-[color:var(--color-pending)]/30 bg-[color:var(--color-pending)]/8 p-3.5 text-[13px] leading-relaxed text-ink-2">
                            The camera needs an https:// page. Open the site on its secure address —
                            reaching it by IP on the local network will not work. Manual entry below
                            still does.
                        </p>
                    ) : supported ? (
                        <QrScanner
                            // Also paused while a party is open: the camera
                            // would otherwise re-read the same code and reset
                            // the list the crew are working through.
                            paused={busy || feedback !== null || party !== null}
                            onScan={(text) => void submit({ qr_payload: text })}
                        />
                    ) : (
                        <p className="rounded-xl border border-white/10 bg-surface-2/50 p-3.5 text-[13px] leading-relaxed text-ink-2">
                            This browser has no camera API. Use manual entry below.
                        </p>
                    )}

                    <div>
                        <p className="eyebrow mb-1.5 text-ink-2">Or type a ticket id</p>
                        <div className="flex gap-2">
                            <Input
                                value={manual}
                                onChange={(e) => setManual(e.target.value)}
                                placeholder="Registration id"
                                aria-label="Registration id"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void submitManual();
                                }}
                            />
                            <Button
                                variant="outline"
                                loading={busy}
                                onClick={() => void submitManual()}
                                className={cn(!manual.trim() && "pointer-events-none opacity-40")}
                            >
                                Check in
                            </Button>
                        </div>
                    </div>

                    <p className="text-[11.5px] leading-relaxed text-ink-3">
                        Scanning the same ticket twice is harmless — it reports who is already in
                        rather than double-counting. A booking made for several people lists them
                        all, and you can re-scan it later to admit whoever turns up late. Marshal
                        posts and checkpoints live in the event-day console.
                    </p>

                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                            toast(count > 0 ? `${count} checked in.` : "Scanner closed.", "ok");
                            setParty(null);
                            setOpen(false);
                        }}
                    >
                        Done
                    </Button>
                </div>
            </Modal>
        </>
    );
}
