"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENFORCE_WHEN_UNDELIVERABLE = void 0;
exports.maskDestination = maskDestination;
exports.issueCode = issueCode;
exports.confirmCode = confirmCode;
exports.emailPending = emailPending;
exports.verificationRequired = verificationRequired;
exports.ensureVerificationNudge = ensureVerificationNudge;
exports.clearVerificationNudge = clearVerificationNudge;
const prisma_1 = __importDefault(require("./prisma"));
const otp_1 = require("./otp");
const mailer_1 = require("./mailer");
/** What the member is shown: never the full address, never the code. */
function maskDestination(_channel, destination) {
    const [local, domain] = destination.split("@");
    if (!domain)
        return "your email";
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
async function issueCode(input) {
    const { userId, name, channel, destination } = input;
    // Cooldown, measured against the last code actually sent on this channel.
    const latest = await prisma_1.default.verificationCode.findFirst({
        where: { user_id: userId, channel },
        orderBy: { created_at: "desc" },
    });
    if (latest) {
        const elapsed = (Date.now() - latest.created_at.getTime()) / 1000;
        if (elapsed < otp_1.OTP_RESEND_COOLDOWN_SECONDS) {
            return {
                ok: false,
                status: 429,
                error: "A code was just sent. Give it a moment before asking for another.",
                retry_after_seconds: Math.ceil(otp_1.OTP_RESEND_COOLDOWN_SECONDS - elapsed),
            };
        }
    }
    const code = (0, otp_1.generateCode)();
    // Retire the old codes before writing the new one, so a failed send below
    // cannot leave two live codes behind.
    await prisma_1.default.verificationCode.updateMany({
        where: { user_id: userId, channel, consumed_at: null },
        data: { consumed_at: new Date() },
    });
    const row = await prisma_1.default.verificationCode.create({
        data: {
            user_id: userId,
            channel,
            destination,
            code_hash: (0, otp_1.hashCode)(code, channel, destination),
            expires_at: (0, otp_1.expiryFromNow)(),
        },
    });
    const sent = await (0, mailer_1.sendMail)({
        ...(0, mailer_1.verificationCodeEmail)({ name, code, minutes: otp_1.OTP_TTL_MINUTES }),
        to: destination,
    });
    if (!sent.ok) {
        // Bin the row. Leaving it would start the cooldown on a code the member
        // never received, locking them out of retrying for a minute for no
        // reason.
        await prisma_1.default.verificationCode.delete({ where: { id: row.id } }).catch(() => { });
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
/** Redeems a code and marks the email address verified. */
async function confirmCode(input) {
    const { userId, channel } = input;
    const code = (0, otp_1.cleanCode)(input.code);
    if (code.length !== otp_1.OTP_LENGTH) {
        return { ok: false, status: 400, error: `Enter the ${otp_1.OTP_LENGTH}-digit code` };
    }
    const row = await prisma_1.default.verificationCode.findFirst({
        where: { user_id: userId, channel, consumed_at: null },
        orderBy: { created_at: "desc" },
    });
    if (!row) {
        return { ok: false, status: 400, error: "Ask for a new code — that one is no longer valid." };
    }
    if (row.expires_at.getTime() < Date.now()) {
        return { ok: false, status: 400, error: "That code has expired. Ask for a new one." };
    }
    if (row.attempts >= otp_1.OTP_MAX_ATTEMPTS) {
        return {
            ok: false,
            status: 429,
            error: "Too many wrong tries. Ask for a new code.",
        };
    }
    if (!(0, otp_1.codeMatches)(code, channel, row.destination, row.code_hash)) {
        const updated = await prisma_1.default.verificationCode.update({
            where: { id: row.id },
            data: { attempts: { increment: 1 } },
        });
        const left = Math.max(0, otp_1.OTP_MAX_ATTEMPTS - updated.attempts);
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
    await prisma_1.default.verificationCode.update({
        where: { id: row.id },
        data: { consumed_at: now },
    });
    await prisma_1.default.user.update({
        where: { id: userId },
        data: { email_verified_at: now },
    });
    return { ok: true, status: 200 };
}
/** Whether the member still has an unconfirmed email address. */
function emailPending(user) {
    return !user.email_verified_at;
}
/**
 * Whether to withhold registration when the club cannot currently send a code.
 *
 * `false` — the default — means an unconfigured mailer does not lock the club
 * out. Refusing somebody a place for failing a step they are physically unable
 * to complete is an outage, not a policy: with no SMTP credentials the code is
 * written to the server log, which a member cannot read.
 *
 * Prompting is unaffected either way, so addresses get confirmed the moment
 * delivery works and the gate tightens on its own.
 *
 * Set to `true` to refuse regardless.
 */
exports.ENFORCE_WHEN_UNDELIVERABLE = false;
/**
 * Whether the registration gate should actually refuse this member.
 *
 * Lives here rather than in the middleware because the client needs the same
 * answer: it intercepts the registration dialog before the form, and if it
 * computed this differently it would refuse a member the server would have let
 * through.
 */
function verificationRequired(user) {
    return emailPending(user) && (mailer_1.mailerConfigured || exports.ENFORCE_WHEN_UNDELIVERABLE);
}
const NUDGE_LINK = "/verify";
/**
 * Leaves one unread reminder in the member's notifications.
 *
 * Idempotent on purpose: this runs on every sign-in, and a fresh row each time
 * would bury everything else in the list. The existing row is left alone rather
 * than rewritten, so its timestamp stays the moment we first asked.
 */
async function ensureVerificationNudge(user) {
    if (!emailPending(user))
        return;
    const existing = await prisma_1.default.notification.findFirst({
        where: { user_id: user.id, link: NUDGE_LINK, is_read: false },
    });
    if (existing)
        return;
    await prisma_1.default.notification.create({
        data: {
            user_id: user.id,
            message: "Confirm your email address to finish setting up your account. " +
                "You'll need it to take a spot in a session.",
            link: NUDGE_LINK,
        },
    });
}
/** Clears the reminder once the address is confirmed. */
async function clearVerificationNudge(userId) {
    await prisma_1.default.notification.updateMany({
        where: { user_id: userId, link: NUDGE_LINK, is_read: false },
        data: { is_read: true },
    });
}
