import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email transport.
 *
 * Deliberately plain SMTP so the provider is a config choice, not a code
 * dependency — Resend, SES, Postmark, Mailtrap and Gmail all speak it, and
 * switching means editing .env rather than this file.
 *
 * With no SMTP_HOST configured it falls back to a console transport that logs
 * the message instead of sending. That keeps the scheduling, recipient logic and
 * idempotency fully exercisable before any credentials exist, and means a
 * missing config can never crash a sweep.
 */

export interface Mail {
    to: string;
    subject: string;
    text: string;
    html: string;
}

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || "B2 Club <no-reply@b2club.in>";

/** True when real SMTP credentials are present. */
export const mailerConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transport: Transporter | null = null;

function getTransport(): Transporter | null {
    if (!mailerConfigured) return null;
    if (transport) return transport;

    transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        // 465 is implicit TLS; everything else upgrades via STARTTLS.
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER!, pass: SMTP_PASS! },
    });

    return transport;
}

export interface SendResult {
    ok: boolean;
    /** True when it was logged rather than actually transmitted. */
    simulated: boolean;
    error?: string;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
    const t = getTransport();

    if (!t) {
        // Dev fallback: show enough to verify the content and the recipient.
        console.log(
            [
                "",
                "──────── EMAIL (not sent — SMTP not configured) ────────",
                `To:      ${mail.to}`,
                `From:    ${MAIL_FROM}`,
                `Subject: ${mail.subject}`,
                "",
                mail.text,
                "────────────────────────────────────────────────────────",
            ].join("\n")
        );
        return { ok: true, simulated: true };
    }

    try {
        await t.sendMail({ from: MAIL_FROM, ...mail });
        return { ok: true, simulated: false };
    } catch (error: any) {
        // Never throw at the caller: a failed send must not abort a sweep that
        // still has other recipients to get through.
        console.error(`[mailer] send to ${mail.to} failed:`, error?.message || error);
        return { ok: false, simulated: false, error: error?.message || "send failed" };
    }
}

/**
 * Which mail settings are present, for the admin diagnostics panel.
 *
 * Values are never returned — only whether each is set — so the panel can be
 * looked at over a screen share without leaking the SMTP password.
 */
export function mailerConfig() {
    return {
        configured: mailerConfigured,
        host: SMTP_HOST ?? null,
        port: SMTP_PORT,
        /** Implicit TLS on 465, STARTTLS elsewhere. */
        secure: SMTP_PORT === 465,
        user_set: Boolean(SMTP_USER),
        pass_set: Boolean(SMTP_PASS),
        from: MAIL_FROM,
        app_url: process.env.APP_URL ?? "http://localhost:5173 (default)",
        missing: (
            [
                ["SMTP_HOST", SMTP_HOST],
                ["SMTP_USER", SMTP_USER],
                ["SMTP_PASS", SMTP_PASS],
            ] as const
        )
            .filter(([, v]) => !v)
            .map(([k]) => k),
    };
}

/** A deliberately plain message for confirming delivery actually works. */
export function testEmail(input: { name: string; host: string }): Mail {
    const html = shell(
        `
      <p style="margin:0 0 6px;color:${GOLD};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Test message</p>
      <h1 style="margin:0 0 14px;color:${INK};font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;">Email is working</h1>
      <p style="margin:0 0 18px;color:#a5aab5;font-size:14px;line-height:1.6;">
        Hi ${input.name}, this was sent from the B2 Club backend through
        <strong style="color:${INK};">${input.host}</strong>. If it reached your inbox, event
        reminders and password-reset links will too.
      </p>
      <p style="margin:0;color:#6d737f;font-size:12px;line-height:1.6;">
        Nobody else received this. Sent because an organiser pressed "Send a test email".
      </p>`,
        "B2 Club email is working",
    );

    const text = [
        "Email is working",
        "",
        `Hi ${input.name},`,
        `This was sent from the B2 Club backend through ${input.host}.`,
        "If it reached your inbox, event reminders and password-reset links will too.",
    ].join("\n");

    return { to: "", subject: "B2 Club — test email", html, text };
}

/** Verifies the SMTP connection — used by the admin diagnostics endpoint. */
export async function verifyMailer(): Promise<SendResult> {
    const t = getTransport();
    if (!t) return { ok: true, simulated: true };
    try {
        await t.verify();
        return { ok: true, simulated: false };
    } catch (error: any) {
        return { ok: false, simulated: false, error: error?.message || "verify failed" };
    }
}

/* ── Templates ────────────────────────────────────────────── */

const GOLD = "#e9b949";
const INK = "#f5f5f5";
const SURFACE = "#14161a";
const VOID = "#08090b";

function shell(bodyHtml: string, preheader: string) {
    // Inline styles only, and a table shell — that is what survives Gmail,
    // Outlook and Apple Mail. No external CSS, no web fonts.
    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>B2 Club</title></head>
<body style="margin:0;padding:0;background:${VOID};">
<div style="display:none;font-size:1px;color:${VOID};max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${VOID};padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${SURFACE};border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <tr><td style="padding:22px 26px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:${GOLD};border-radius:9px;width:32px;height:32px;text-align:center;vertical-align:middle;font-weight:800;color:#161000;font-size:15px;">B2</td>
        <td style="padding-left:10px;font-weight:800;letter-spacing:-0.02em;color:${INK};font-size:16px;">B2 CLUB</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px 26px 28px;">${bodyHtml}</td></tr>
    <tr><td style="padding:16px 26px 22px;border-top:1px solid rgba(255,255,255,0.08);color:#6d737f;font-size:11px;line-height:1.6;">
      You're getting this because you registered for a B2 Club session.<br>
      Every run starts with one step. Bring water.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function passwordResetEmail(input: {
    name: string;
    link: string;
    minutes: number;
}): Mail {
    const html = shell(
        `
      <p style="margin:0 0 6px;color:${GOLD};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Password reset</p>
      <h1 style="margin:0 0 14px;color:${INK};font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;">Set a new password</h1>
      <p style="margin:0 0 18px;color:#a5aab5;font-size:14px;line-height:1.6;">
        Hi ${input.name}, use the button below to choose a new password. The link works once and
        expires in ${input.minutes} minutes.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0;">
        <tr><td style="background:${GOLD};border-radius:10px;">
          <a href="${input.link}" style="display:inline-block;padding:12px 22px;color:#161000;font-size:14px;font-weight:700;text-decoration:none;">Choose a new password</a>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;color:#6d737f;font-size:12px;line-height:1.6;">
        If you didn't ask for this, you can ignore it — your password stays as it is.
      </p>`,
        "Set a new B2 Club password"
    );

    const text = [
        "Set a new password",
        "",
        `Hi ${input.name},`,
        `Use this link to choose a new password. It works once and expires in ${input.minutes} minutes.`,
        "",
        input.link,
        "",
        "If you didn't ask for this, ignore it — your password stays as it is.",
    ].join("\n");

    return { to: "", subject: "Reset your B2 Club password", html, text };
}

/**
 * The one-time code for proving an email address.
 *
 * No link, deliberately. A click-to-verify link in an email is a redirect a
 * phishing kit can imitate, and it breaks when the member opens their mail on a
 * different device from the one they signed up on — which for a club whose
 * members sign up on a phone and read Gmail on a laptop is most of them. A code
 * they read and type works from anywhere and proves the same thing.
 */
export function verificationCodeEmail(input: {
    name: string;
    code: string;
    minutes: number;
}): Mail {
    const html = shell(
        `
      <p style="margin:0 0 6px;color:${GOLD};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Verify your email</p>
      <h1 style="margin:0 0 14px;color:${INK};font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;">Your code is ${input.code}</h1>
      <p style="margin:0 0 18px;color:#a5aab5;font-size:14px;line-height:1.6;">
        Hi ${input.name}, enter this code in the app to confirm this is your address.
        It expires in ${input.minutes} minutes.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0;">
        <tr><td style="background:rgba(233,185,73,0.10);border:1px solid rgba(233,185,73,0.35);border-radius:10px;">
          <span style="display:inline-block;padding:14px 26px;color:${GOLD};font-size:30px;font-weight:800;letter-spacing:0.22em;font-family:'SF Mono',Menlo,Consolas,monospace;">${input.code}</span>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;color:#6d737f;font-size:12px;line-height:1.6;">
        If you didn't ask for this, you can ignore it. Nobody can use this code but you,
        and we'll never ask you for it by phone or on WhatsApp.
      </p>`,
        `${input.code} is your B2 Club verification code`,
    );

    const text = [
        "Verify your email",
        "",
        `Hi ${input.name},`,
        `Your B2 Club verification code is ${input.code}.`,
        `It expires in ${input.minutes} minutes.`,
        "",
        "If you didn't ask for this, ignore it. We'll never ask you for this code",
        "by phone or on WhatsApp.",
    ].join("\n");

    return {
        to: "",
        subject: `${input.code} is your B2 Club verification code`,
        html,
        text,
    };
}

export function reminderEmail(input: {
    name: string;
    eventTitle: string;
    when: string;
    location: string;
    hoursBefore: number;
    ticketReady: boolean;
    amountDue: string | null;
    ticketUrl: string;
}): Mail {
    const lead =
        input.hoursBefore >= 24
            ? `in ${Math.round(input.hoursBefore / 24)} day${input.hoursBefore >= 48 ? "s" : ""}`
            : `in ${input.hoursBefore} hour${input.hoursBefore === 1 ? "" : "s"}`;

    const action = input.ticketReady
        ? `<p style="margin:0 0 6px;color:#a5aab5;font-size:14px;line-height:1.6;">Your QR ticket is ready — have it open at the start line.</p>`
        : `<p style="margin:0 0 6px;color:#fab219;font-size:14px;line-height:1.6;">Your spot is held but ${
              input.amountDue ?? "payment"
          } is still outstanding. Settle it before the day to keep your place.</p>`;

    const html = shell(
        `
      <p style="margin:0 0 6px;color:${GOLD};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Starts ${lead}</p>
      <h1 style="margin:0 0 14px;color:${INK};font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;">${input.eventTitle}</h1>
      <p style="margin:0 0 18px;color:#a5aab5;font-size:14px;line-height:1.6;">
        Hi ${input.name}, a quick reminder.<br>
        <strong style="color:${INK};">${input.when}</strong><br>${input.location}
      </p>
      ${action}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;">
        <tr><td style="background:${GOLD};border-radius:10px;">
          <a href="${input.ticketUrl}" style="display:inline-block;padding:12px 22px;color:#161000;font-size:14px;font-weight:700;text-decoration:none;">
            ${input.ticketReady ? "View your ticket" : "Open my tickets"}
          </a>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#6d737f;font-size:12px;line-height:1.6;">
        Arrive 15 minutes early for the briefing. Marshals carry a club ID card — follow their calls at junctions.
      </p>`,
        `${input.eventTitle} starts ${lead} — ${input.when}`
    );

    const text = [
        `${input.eventTitle} starts ${lead}.`,
        "",
        `Hi ${input.name},`,
        `${input.when}`,
        `${input.location}`,
        "",
        input.ticketReady
            ? "Your QR ticket is ready — have it open at the start line."
            : `Your spot is held but ${input.amountDue ?? "payment"} is still outstanding.`,
        "",
        input.ticketUrl,
        "",
        "Arrive 15 minutes early for the briefing.",
    ].join("\n");

    return {
        to: "",
        subject: `${input.eventTitle} — starts ${lead}`,
        html,
        text,
    };
}
