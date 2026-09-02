import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import { Button, Card, Field, Input, Skeleton, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { VerificationStatus } from "../lib/types";

/** Seconds a resend is held back for, matching OTP_RESEND_COOLDOWN_SECONDS. */
const RESEND_COOLDOWN = 60;

/**
 * Confirm the email address on an account.
 *
 * One step, not two. Phone verification used to sit below this one and was
 * removed: the club cannot get a WhatsApp sender approved, so the code had
 * nowhere to go. Members still give a number at signup — it is simply taken on
 * trust rather than proved.
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
    /** Masked destination of a code in flight, if there is one. */
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [simulated, setSimulated] = useState(false);

    const [code, setCode] = useState("");
    const [busy, setBusy] = useState<"send" | "confirm" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        try {
            const res = await api.verification.status();
            setStatus(res);
            /* A code issued before this page loaded — by signup, or by a reload
               mid-flow — still counts as in flight, so the box appears without
               making the member ask for another one they already have. */
            setSentTo((prev) => prev ?? res.outstanding?.sent_to ?? null);
            return res;
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Could not load your account");
            return null;
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

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
            const res = await api.verification.sendEmail();
            setSentTo(res.sent_to);
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
            await api.verification.confirmEmail(value);
            setCode("");
            toast("Email confirmed.", "ok");
            // Refresh both this page and the cached user the banner reads.
            await Promise.all([load(), refreshUser()]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not check that code");
        } finally {
            setBusy(null);
        }
    };

    /* Submit as soon as the last digit lands. Nobody wants to type six digits
       and then hunt for a button, and a wrong code is cheap — five tries. */
    const onCodeChange = (raw: string) => {
        const length = status?.code_length ?? 6;
        const digits = raw.replace(/\D/g, "").slice(0, length);
        setCode(digits);
        if (digits.length === length && !busy) void confirm(digits);
    };

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
                <div className="mt-8">
                    <Skeleton className="h-40 w-full rounded-2xl" />
                </div>
            </Page>
        );
    }

    const done = !status.pending;

    return (
        <Page>
            <PageScene variant="lattice" opacity={0.26} />
            <PageHeader
                eyebrow="Your account"
                title={done ? "You're all set" : "Confirm your email"}
                description={
                    done
                        ? "Your email address is confirmed. Nothing else to do."
                        : "One quick check. Your ticket goes to your inbox, and it's how the organisers reach you if a session changes — so we need an address that works."
                }
            />

            {done ? (
                <Card className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-[14px] text-ink-2">
                                <strong className="text-ink">{status.email}</strong>
                            </p>
                            <p className="mt-1 text-[13px] text-ink-3">
                                Change it from your profile — you'll confirm the new one the same way.
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
                <Card className="p-5 sm:p-6">
                    <p className="text-[13.5px] text-ink-2">
                        We'll send a {status.code_length}-digit code to{" "}
                        <strong className="text-ink">{status.email}</strong>.
                    </p>

                    {!status.delivery.email && (
                        <p className="mt-3 rounded-lg border border-gold/25 bg-gold/8 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
                            The club has no email credentials set, so the code is written to the
                            server log rather than sent. An organiser can set SMTP_HOST, SMTP_USER
                            and SMTP_PASS.
                        </p>
                    )}

                    {sentTo && (
                        <>
                            <p className="mt-3 text-[13.5px] text-ink-2">
                                Code sent to <strong className="text-ink">{sentTo}</strong>. It
                                expires in {status.expires_in_minutes} minutes.
                            </p>
                            {simulated && (
                                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                                    No mail credentials are set, so it went to the server log
                                    instead of being sent.
                                </p>
                            )}

                            <Field
                                label={`${status.code_length}-digit code`}
                                htmlFor="verify-code"
                                className="mt-4"
                            >
                                <Input
                                    ref={inputRef}
                                    id="verify-code"
                                    /* text, not number: a number input strips leading zeros
                                       and shows spinners on a code. */
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={status.code_length}
                                    value={code}
                                    onChange={(e) => onCodeChange(e.target.value)}
                                    placeholder={"0".repeat(status.code_length)}
                                    className="tnum max-w-[11rem] text-center text-[22px] tracking-[0.42em]"
                                />
                            </Field>
                        </>
                    )}

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
                </Card>
            )}

            <p className="mt-6 text-[13px] text-ink-3">
                Stuck? <Link to="/about" className="text-gold hover:underline">Contact an organiser</Link>{" "}
                and they'll sort it out. We'll never ask you for a code by phone or on WhatsApp.
            </p>
        </Page>
    );
}
