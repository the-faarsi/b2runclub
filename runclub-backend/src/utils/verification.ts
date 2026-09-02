import prisma from "./prisma";
import { maskPhone } from "./phone";
import {
    cleanCode,
    codeMatches,
    expiryFromNow,
    generateCode,
    hashCode,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_MINUTES,
} from "./otp";
import { mailerConfigured, sendMail, verificationCodeEmail } from "./mailer";
import { sendWhatsAppCode, whatsappConfigured } from "./whatsapp";

/**
 * Issuing and redeeming verification codes.
 *
 * One module for both channels because the rules — one live code at a time, a
 * resend cooldown, an attempt cap, single use, and a code that only works
 * against the address it was sent to — must be identical for email and phone.
 * Two copies of this would drift, and the weaker copy would be the one that
 * mattered.
 */

export type Channel = "EMAIL" | "PHONE";

export interface IssueOutcome {
    ok: boolean;
    status: number;
    /** Safe to show the member. */
    error?: string;
    /** True when there are no delivery credentials and it was only logged. */
    simulated?: boolean;
    /** Set on a cooldown rejection. */
    retry_after_seconds?: number;
    /** Masked, so a shared screen does not give the address away. */
    sent_to?: string;
}

export interface ConfirmOutcome {
    ok: boolean;
    status: number;
    error?: string;
    /** Wrong guesses left before this code dies. Only set on a bad code. */
    attempts_left?: number;
}

/** What the member is shown: never the full address, never the code. */
export function maskDestination(channel: Channel, destination: string): string {
    if (channel === "PHONE") return maskPhone(destination);
    const [local, domain] = destination.split("@");
    if (!domain) return "your email";
    const head = local.slice(0, 2);
    return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

/**
 * Sends a fresh code, replacing any outstanding one for the same channel.
 *
 * Superseding rather than accumulating: with several live codes at once, the
 * attempt cap is per-row and an attacker gets OTP_MAX_ATTEMPTS guesses for
 * every resend they trigger.
 */
export async function issueCode(input: {
    userId: string;
    name: string;
    channel: Channel;
    destination: string;
}): Promise<IssueOutcome> {
    const { userId, name, channel, destination } = input;

    // Cooldown, measured against the last code actually sent on this channel.
    const latest = await prisma.verificationCode.findFirst({
        where: { user_id: userId, channel },
        orderBy: { created_at: "desc" },
    });

    if (latest) {
        const elapsed = (Date.now() - latest.created_at.getTime()) / 1000;
        if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
            return {
                ok: false,
                status: 429,
                error: "A code was just sent. Give it a moment before asking for another.",
                retry_after_seconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
            };
        }
    }

    const code = generateCode();

    // Retire the old codes before writing the new one, so a failed send below
    // cannot leave two live codes behind.
    await prisma.verificationCode.updateMany({
        where: { user_id: userId, channel, consumed_at: null },
        data: { consumed_at: new Date() },
    });

    const row = await prisma.verificationCode.create({
        data: {
            user_id: userId,
            channel,
            destination,
            code_hash: hashCode(code, channel, destination),
            expires_at: expiryFromNow(),
        },
    });

    const sent =
        channel === "EMAIL"
            ? await sendMail({
                  ...verificationCodeEmail({ name, code, minutes: OTP_TTL_MINUTES }),
                  to: destination,
              })
            : await sendWhatsAppCode(destination, code);

    if (!sent.ok) {
        // Bin the row. Leaving it would start the cooldown on a code the member
        // never received, locking them out of retrying for a minute for no
        // reason.
        await prisma.verificationCode.delete({ where: { id: row.id } }).catch(() => {});
        return {
            ok: false,
            status: 502,
            error: sent.error || "Could not send the code. Try again in a moment.",
        };
    }

    return {
        ok: true,
        status: 200,
        simulated: sent.simulated,
        sent_to: maskDestination(channel, destination),
    };
}

/**
 * Redeems a code and marks the channel verified.
 *
 * For PHONE the number is written again here, not only at signup. Signup and
 * the profile form both store it unverified so the verify screen can prefill
 * it, which means `phone` alone says nothing about whether anyone holds it —
 * `phone_verified_at` is the only column the gate and the organiser screens
 * read. Rewriting it here covers the case where the member corrected the number
 * on the verify screen itself.
 */
export async function confirmCode(input: {
    userId: string;
    channel: Channel;
    code: unknown;
}): Promise<ConfirmOutcome> {
    const { userId, channel } = input;
    const code = cleanCode(input.code);

    if (code.length !== OTP_LENGTH) {
        return { ok: false, status: 400, error: `Enter the ${OTP_LENGTH}-digit code` };
    }

    const row = await prisma.verificationCode.findFirst({
        where: { user_id: userId, channel, consumed_at: null },
        orderBy: { created_at: "desc" },
    });

    if (!row) {
        return { ok: false, status: 400, error: "Ask for a new code — that one is no longer valid." };
    }
    if (row.expires_at.getTime() < Date.now()) {
        return { ok: false, status: 400, error: "That code has expired. Ask for a new one." };
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
        return {
            ok: false,
            status: 429,
            error: "Too many wrong tries. Ask for a new code.",
        };
    }

    if (!codeMatches(code, channel, row.destination, row.code_hash)) {
        const updated = await prisma.verificationCode.update({
            where: { id: row.id },
            data: { attempts: { increment: 1 } },
        });
        const left = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);
        return {
            ok: false,
            status: 400,
            error: left > 0 ? "That code is not right." : "That code is not right. Ask for a new one.",
            attempts_left: left,
        };
    }

    const now = new Date();

    // Consume first. If the user update somehow fails, a spent code must not
    // still be redeemable.
    await prisma.verificationCode.update({
        where: { id: row.id },
        data: { consumed_at: now },
    });

    await prisma.user.update({
        where: { id: userId },
        data:
            channel === "EMAIL"
                ? { email_verified_at: now }
                : { phone: row.destination, phone_verified_at: now },
    });

    return { ok: true, status: 200 };
}

/** What still needs doing, for the client and for the gate. */
export function pendingVerification(user: {
    email_verified_at: Date | null;
    phone_verified_at: Date | null;
    phone: string | null;
}) {
    return {
        email: !user.email_verified_at,
        // Both "no number at all" and "a number nobody has confirmed" count as
        // outstanding. The club requires one either way, and collapsing them
        // here is what stops the banner, the gate and the verify screen from
        // disagreeing about whether a member is finished.
        phone: !user.phone || !user.phone_verified_at,
    };
}

/**
 * Whether to withhold registration for a channel the club cannot currently send
 * a code on.
 *
 * `false` — the default — means the gate only enforces channels that actually
 * work. It is not defensible to refuse somebody a place for failing a step they
 * are physically unable to complete: with no WhatsApp credentials the phone
 * code goes to the server log, which a member cannot read, so a strict gate
 * would stop every registration in the club until Meta approves the template.
 * That is an outage, not a policy.
 *
 * Prompting is unaffected — the banner and the notification still ask for both,
 * so numbers get confirmed as soon as delivery works and the gate tightens on
 * its own with no code change.
 *
 * Set to `true` for the strictest reading, once both channels are live.
 */
export const ENFORCE_UNDELIVERABLE_CHANNELS = false;

/**
 * The subset of `pendingVerification` that actually withholds anything.
 *
 * Lives here rather than in the middleware because the client needs the same
 * answer: it intercepts the registration dialog before the form, and if it
 * computed this differently it would refuse a member the server would have let
 * through.
 */
export function enforcedVerification(pending: { email: boolean; phone: boolean }) {
    return {
        email: pending.email && (mailerConfigured || ENFORCE_UNDELIVERABLE_CHANNELS),
        phone: pending.phone && (whatsappConfigured || ENFORCE_UNDELIVERABLE_CHANNELS),
    };
}

const NUDGE_LINK = "/verify";

/**
 * Leaves one unread reminder in the member's notifications.
 *
 * Idempotent on purpose: this runs on every sign-in, and a fresh row each time
 * would bury everything else in the list. The existing row is left alone rather
 * than rewritten, so its timestamp stays the moment we first asked.
 */
export async function ensureVerificationNudge(user: {
    id: string;
    email_verified_at: Date | null;
    phone_verified_at: Date | null;
    phone: string | null;
}): Promise<void> {
    const pending = pendingVerification(user);
    if (!pending.email && !pending.phone) return;

    const existing = await prisma.notification.findFirst({
        where: { user_id: user.id, link: NUDGE_LINK, is_read: false },
    });
    if (existing) return;

    const what =
        pending.email && pending.phone
            ? "your email address and your phone number"
            : pending.email
              ? "your email address"
              : "your phone number";

    await prisma.notification.create({
        data: {
            user_id: user.id,
            message: `Confirm ${what} to finish setting up your account. You'll need it to take a spot in a session.`,
            link: NUDGE_LINK,
        },
    });
}

/** Clears the reminder once there is nothing left to confirm. */
export async function clearVerificationNudge(userId: string): Promise<void> {
    await prisma.notification.updateMany({
        where: { user_id: userId, link: NUDGE_LINK, is_read: false },
        data: { is_read: true },
    });
}
