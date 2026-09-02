import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import { Button, Card, Field, Input, Skeleton, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/format";
import type { VerificationStatus } from "../lib/types";

/** Seconds a resend is held back for, matching OTP_RESEND_COOLDOWN_SECONDS. */
const RESEND_COOLDOWN = 60;

function TickIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
            <path
                d="m5 13 4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * One channel's worth of the flow: send a code, type it back, done.
 *
 * Both channels are the same three states, so they are one component — the
 * alternative is two near-identical blocks where a fix to one silently misses
 * the other.
 */
function CodeStep({
    title,
    step,
    done,
    doneLabel,
    /** Rendered above the code box — the address, or a field to correct it. */
    children,
    sentTo,
    codeLength,
    minutes,
    onSend,
    onConfirm,
    /** Warning when the club has no credentials for this channel. */
    undelivered,
}: {
    title: string;
    step: number;
    done: boolean;
    doneLabel: string;
    children?: React.ReactNode;
    sentTo: string | null;
    codeLength: number;
    minutes: number;
    onSend: () => Promise<{ sent_to: string; simulated: boolean }>;
    onConfirm: (code: string) => Promise<void>;
    undelivered?: string | null;
}) {
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState<"send" | "confirm" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);
    const [simulated, setSimulated] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // One interval for the whole countdown rather than one per tick.
    useEffect(() => {
        if (cooldown <= 0) return;
        const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
        return () => clearInterval(id);
    }, [cooldown]);

    const send = async () => {
        setBusy("send");
        setError(null);
        try {
            const res = await onSend();
            setSimulated(res.simulated);
            setCooldown(RESEND_COOLDOWN);
            // Straight into the box, so a phone keyboard opens on the right field.
            inputRef.current?.focus();
        } catch (err) {
            const retry = err instanceof ApiError ? err.retryAfterSeconds : undefined;
            if (retry) setCooldown(retry);
            setError(err instanceof Error ? err.message : "Could not send the code");
        } finally {
            setBusy(null);
        }
    };

    const confirm = async (value: string) => {
        setBusy("confirm");
        setError(null);
        try {
            await onConfirm(value);
            setCode("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not check that code");
        } finally {
            setBusy(null);
        }
    };

    /* Submit as soon as the last digit lands. Nobody wants to type six digits
       and then hunt for a button, and a wrong code is cheap — five tries. */
    const onCodeChange = (raw: string) => {
        const digits = raw.replace(/\D/g, "").slice(0, codeLength);
        setCode(digits);
        if (digits.length === codeLength && !busy) void confirm(digits);
    };

    return (
        <Card className={cn("p-5 sm:p-6", done && "border-[color:var(--color-paid)]/30")}>
            <div className="flex items-start gap-4">
                <span
                    className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold",
                        done
                            ? "bg-[color:var(--color-paid)]/15 text-[color:var(--color-paid)]"
                            : "bg-gold/15 text-gold",
                    )}
                    aria-hidden
                >
                    {done ? <TickIcon className="size-4" /> : step}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="display text-lg">{title}</h2>
                        {done && (
                            <span className="text-[12px] font-semibold text-[color:var(--color-paid)]">
                                {doneLabel}
                            </span>
                        )}
                    </div>

                    {done ? null : (
                        <>
                            {children}

                            {undelivered && (
                                <p className="mt-3 rounded-lg border border-gold/25 bg-gold/8 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
                                    {undelivered}
                                </p>
                            )}

                            {sentTo ? (
                                <>
                                    <p className="mt-3 text-[13.5px] text-ink-2">
                                        Code sent to <strong className="text-ink">{sentTo}</strong>. It
                                        expires in {minutes} minutes.
                                    </p>
                                    {simulated && (
                                        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                                            No delivery credentials are set, so the code was written to
                                            the server log instead of being sent.
                                        </p>
                                    )}

                                    <Field
                                        label={`${codeLength}-digit code`}
                                        htmlFor={`code-${step}`}
                                        className="mt-4"
                                    >
                                        <Input
                                            ref={inputRef}
                                            id={`code-${step}`}
                                            /* text, not number: a number input strips leading
                                               zeros and shows spinners on a code. */
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={codeLength}
                                            value={code}
                                            onChange={(e) => onCodeChange(e.target.value)}
                                            placeholder={"0".repeat(codeLength)}
                                            className="tnum max-w-[11rem] text-center text-[22px] tracking-[0.42em]"
                                        />
                                    </Field>
                                </>
                            ) : null}

                            {error && (
                                <p
                                    role="alert"
                                    className="mt-3 rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[13px] text-ink-2"
                                >
                                    <span
                                        aria-hidden
                                        className="mr-1.5 font-bold text-[color:var(--color-failed)]"
                                    >
                                        !
                                    </span>
                                    {error}
                                </p>
                            )}

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <Button
                                    variant={sentTo ? "outline" : "gold"}
                                    onClick={send}
                                    disabled={busy !== null || cooldown > 0}
                                >
                                    {busy === "send"
                                        ? "Sending…"
                                        : cooldown > 0
                                          ? `Resend in ${cooldown}s`
                                          : sentTo
                                            ? "Send a new code"
                                            : "Send the code"}
                                </Button>
                                {busy === "confirm" && (
                                    <span className="text-[13px] text-ink-3">Checking…</span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
}

/**
 * Finish setting up an account: confirm the email address, confirm the phone
 * number.
 *
 * Reachable any time from the banner, not only straight after signup — most of
 * the people who need it are existing members who never had this step.
 */
export function Verify() {
    const { refreshUser } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    const [status, setStatus] = useState<VerificationStatus | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [phone, setPhone] = useState("");
    /** Masked destinations of codes in flight, per channel. */
    const [sent, setSent] = useState<{ email: string | null; phone: string | null }>({
        email: null,
        phone: null,
    });

    const load = useCallback(async () => {
        try {
            const res = await api.verification.status();
            setStatus(res);
            setPhone((p) => p || res.phone || "");
            /* A code issued before this page loaded — by signup, or by a reload
               mid-flow — still counts as in flight, so the box appears without
               making the member ask for another one they already have. */
            setSent((prev) => ({
                email: prev.email ?? res.outstanding.email?.sent_to ?? null,
                phone: prev.phone ?? res.outstanding.phone?.sent_to ?? null,
            }));
            return res;
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Could not load your account");
            return null;
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    /** Re-reads both the page's status and the cached user the banner reads. */
    const settle = useCallback(async () => {
        const [next] = await Promise.all([load(), refreshUser()]);
        return next;
    }, [load, refreshUser]);

    if (loadError) {
        return (
            <Page>
                <Card className="p-6">
                    <p className="text-sm text-ink-2">{loadError}</p>
                </Card>
            </Page>
        );
    }

    if (!status) {
        return (
            <Page>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-4 h-9 w-64" />
                <div className="mt-8 space-y-4">
                    <Skeleton className="h-32 w-full rounded-2xl" />
                    <Skeleton className="h-32 w-full rounded-2xl" />
                </div>
            </Page>
        );
    }

    const allDone = !status.pending.email && !status.pending.phone;

    return (
        <Page>
            <PageScene variant="lattice" opacity={0.26} />
            <PageHeader
                eyebrow="Your account"
                title={allDone ? "You're all set" : "Confirm your details"}
                description={
                    allDone
                        ? "Your email address and phone number are both confirmed. Nothing else to do."
                        : "Two quick checks. The club needs an address that reaches you and a number that rings on race day — so we can send your ticket, and reach you if something changes."
                }
            />

            {allDone ? (
                <Card className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-[14px] text-ink-2">
                                <strong className="text-ink">{status.email}</strong> and{" "}
                                <strong className="text-ink">{status.phone}</strong>
                            </p>
                            <p className="mt-1 text-[13px] text-ink-3">
                                Change either from your profile — you'll confirm the new one the same
                                way.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => navigate("/profile")}>
                                Profile
                            </Button>
                            <Button onClick={() => navigate("/events")}>Find a session</Button>
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="space-y-4">
                    <CodeStep
                        step={1}
                        title="Your email address"
                        done={!status.pending.email}
                        doneLabel="Confirmed"
                        sentTo={sent.email}
                        codeLength={status.code_length}
                        minutes={status.expires_in_minutes}
                        undelivered={
                            status.delivery.email
                                ? null
                                : "The club has no email credentials set, so the code is written to the server log rather than sent. An organiser can set SMTP_HOST, SMTP_USER and SMTP_PASS."
                        }
                        onSend={async () => {
                            const res = await api.verification.sendEmail();
                            setSent((s) => ({ ...s, email: res.sent_to }));
                            return res;
                        }}
                        onConfirm={async (code) => {
                            await api.verification.confirmEmail(code);
                            toast("Email confirmed.", "ok");
                            await settle();
                        }}
                    >
                        <p className="mt-1 text-[13.5px] text-ink-2">
                            We'll send a code to <strong className="text-ink">{status.email}</strong>.
                        </p>
                    </CodeStep>

                    <CodeStep
                        step={2}
                        title="Your mobile number"
                        done={!status.pending.phone}
                        doneLabel="Confirmed"
                        sentTo={sent.phone}
                        codeLength={status.code_length}
                        minutes={status.expires_in_minutes}
                        undelivered={
                            status.delivery.whatsapp
                                ? null
                                : "The club's WhatsApp sender isn't connected yet, so the code is written to the server log rather than sent. An organiser can set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN."
                        }
                        onSend={async () => {
                            const res = await api.verification.sendPhone(phone.trim() || undefined);
                            setSent((s) => ({ ...s, phone: res.sent_to }));
                            return res;
                        }}
                        onConfirm={async (code) => {
                            await api.verification.confirmPhone(code);
                            toast("Phone number confirmed.", "ok");
                            await settle();
                        }}
                    >
                        <Field
                            label="Mobile number"
                            htmlFor="verify-phone"
                            hint="We'll message this on WhatsApp. Change it here if it's wrong."
                            className="mt-3"
                        >
                            <Input
                                id="verify-phone"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="98765 43210"
                                className="max-w-xs"
                            />
                        </Field>
                    </CodeStep>
                </div>
            )}

            <p className="mt-6 text-[13px] text-ink-3">
                Stuck? <Link to="/about" className="text-gold hover:underline">Contact an organiser</Link>{" "}
                and they'll sort it out. We'll never ask you for a code by phone or on WhatsApp.
            </p>
        </Page>
    );
}
