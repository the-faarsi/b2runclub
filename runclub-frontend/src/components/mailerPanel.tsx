import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { cn } from "../lib/format";
import { useFetch } from "../lib/useFetch";
import { ClockIcon } from "./icons";
import { Badge, Button, Card, ErrorState, Skeleton, useToast } from "./ui";

/** One `KEY  value` line, monospaced so a misconfiguration is easy to spot. */
function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 font-mono text-[11.5px] tracking-tight text-ink-3">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-mono text-[11.5px]",
          ok === false ? "text-[color:var(--color-failed)]" : "text-ink-2",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Email configuration and delivery check for organisers.
 *
 * Two separate signals, because they fail independently: whether the backend can
 * *authenticate* against the relay, and whether a message is actually *accepted*.
 * A correct username and password with an unverified sender address passes the
 * first and fails the second, which is the most common way this breaks.
 */
export function MailerPanel() {
  const toast = useToast();
  const load = useCallback(() => api.mailerStatus(), []);
  const { data, loading, error, reload } = useFetch(load);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const sendTest = async () => {
    setResult(null);
    setBusy(true);
    try {
      const res = await api.sendTestEmail();
      setResult({ ok: true, text: `${res.message} in ${res.took_ms} ms — check your inbox.` });
      toast("Test email sent", "ok");
      reload();
    } catch (err) {
      const text = err instanceof Error ? err.message : "The test failed";
      setResult({ ok: false, text });
      toast("Test email failed", "err");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-28 w-full rounded-xl" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <ErrorState message={error ?? "Could not read the mail settings"} onRetry={reload} />
      </Card>
    );
  }

  const { config } = data;
  const live = data.configured && data.ok;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Email</h3>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-3">
            Drives event reminders and password-reset links.
          </p>
        </div>
        {live ? (
          <Badge color="var(--color-paid)" icon="✓">
            Sending
          </Badge>
        ) : data.configured ? (
          <Badge color="var(--color-failed)" icon="!">
            Misconfigured
          </Badge>
        ) : (
          <Badge color="var(--color-pending)">Not configured</Badge>
        )}
      </div>

      {/* State explained in words, not just a chip */}
      <div
        className={cn(
          "mt-4 rounded-xl border px-4 py-3 text-[13px] leading-relaxed",
          live
            ? "border-[color:var(--color-paid)]/30 bg-[color:var(--color-paid)]/8 text-ink-2"
            : data.configured
              ? "border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 text-ink-2"
              : "border-[color:var(--color-pending)]/30 bg-[color:var(--color-pending)]/8 text-ink-2",
        )}
      >
        {live ? (
          <>
            Connected to <strong className="text-ink">{config.host}</strong> and authenticated.
            Send a test below to confirm messages actually arrive.
          </>
        ) : data.configured ? (
          <>
            The settings are present but the connection failed:{" "}
            <strong className="text-ink">{data.error}</strong>
          </>
        ) : (
          <>
            No SMTP is set, so every email is written to the server log instead of sent.
            {config.missing.length > 0 && (
              <>
                {" "}
                Still needed:{" "}
                <strong className="font-mono text-ink">{config.missing.join(", ")}</strong>.
              </>
            )}
          </>
        )}
      </div>

      {/* Settings the backend can see. No secret values, only presence. */}
      <div className="mt-4 divide-y divide-white/5 rounded-xl border border-white/8 bg-surface-2/40 px-4 py-2">
        <Row label="SMTP_HOST" value={config.host ?? "not set"} ok={Boolean(config.host)} />
        <Row label="SMTP_PORT" value={`${config.port}${config.secure ? "  (TLS)" : "  (STARTTLS)"}`} />
        <Row label="SMTP_USER" value={config.user_set ? "set" : "not set"} ok={config.user_set} />
        <Row label="SMTP_PASS" value={config.pass_set ? "set" : "not set"} ok={config.pass_set} />
        <Row label="MAIL_FROM" value={config.from} />
        <Row label="APP_URL" value={config.app_url} />
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
        Set these in <span className="font-mono">runclub-backend/.env</span> and restart the
        backend. Passwords are never shown here — only whether they're present.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button loading={busy} disabled={!data.configured} onClick={sendTest}>
          <ClockIcon className="size-3.5" />
          Send a test email
        </Button>
        <Button variant="ghost" onClick={reload}>
          Re-check
        </Button>
        {!data.configured && (
          <span className="text-[12px] text-ink-3">Configure SMTP first</span>
        )}
      </div>

      {result && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mt-4 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed",
            result.ok
              ? "border-[color:var(--color-paid)]/30 bg-[color:var(--color-paid)]/8 text-ink-2"
              : "border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 text-ink-2",
          )}
          role="status"
        >
          <span aria-hidden className="mr-1.5 font-bold">
            {result.ok ? "✓" : "!"}
          </span>
          {result.text}
        </motion.p>
      )}
    </Card>
  );
}
