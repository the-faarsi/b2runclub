"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const otp_1 = require("../utils/otp");
const verification_1 = require("../utils/verification");
const mailer_1 = require("../utils/mailer");
/**
 * Email verification. Mounted at /api/auth/verify.
 *
 * Every route needs a signed-in account, and the destination is never taken
 * from the request body — a code only ever goes to the address already on the
 * account. Accepting a destination would make this an open relay for sending
 * codes to strangers.
 *
 * Phone verification used to live here too. It was removed because the club
 * cannot get a WhatsApp sender approved; numbers are still collected at signup,
 * just not proved. See git history at fa37999.
 */
const router = (0, express_1.Router)();
router.use(auth_1.requireAccount);
/** Where the member is up to, and what they need to do next. */
router.get("/status", async (req, res) => {
    const user = await prisma_1.default.user.findUnique({
        where: { id: req.user.id },
        select: { email: true, email_verified_at: true },
    });
    if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
    }
    // A code still in flight, so a reload of the verify screen shows the box
    // rather than making the member ask for one they already have.
    const row = await prisma_1.default.verificationCode.findFirst({
        where: {
            user_id: req.user.id,
            channel: "EMAIL",
            consumed_at: null,
            expires_at: { gt: new Date() },
        },
        orderBy: { created_at: "desc" },
    });
    res.json({
        email: user.email,
        email_verified: Boolean(user.email_verified_at),
        pending: (0, verification_1.emailPending)(user),
        code_length: otp_1.OTP_LENGTH,
        expires_in_minutes: otp_1.OTP_TTL_MINUTES,
        outstanding: row
            ? {
                sent_to: (0, verification_1.maskDestination)("EMAIL", row.destination),
                expires_at: row.expires_at,
                attempts_left: Math.max(0, otp_1.OTP_MAX_ATTEMPTS - row.attempts),
            }
            : null,
        /* So the UI can warn that a code will only appear in the server log
           rather than leaving somebody waiting for a message that is not
           coming. A boolean only — no credentials. */
        delivery: { email: mailer_1.mailerConfigured },
    });
});
/** Sends a code to the address already on the account. */
router.post("/email/send", async (req, res) => {
    const user = await prisma_1.default.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
    }
    if (user.email_verified_at) {
        res.json({ message: "Your email is already confirmed", already: true });
        return;
    }
    const outcome = await (0, verification_1.issueCode)({
        userId: user.id,
        name: user.name,
        channel: "EMAIL",
        destination: user.email,
    });
    res.status(outcome.status).json(outcome.ok
        ? {
            message: `Code sent to ${outcome.sent_to}`,
            sent_to: outcome.sent_to,
            simulated: outcome.simulated,
            expires_in_minutes: otp_1.OTP_TTL_MINUTES,
        }
        : { error: outcome.error, retry_after_seconds: outcome.retry_after_seconds });
});
router.post("/email/confirm", async (req, res) => {
    const outcome = await (0, verification_1.confirmCode)({
        userId: req.user.id,
        channel: "EMAIL",
        code: req.body?.code,
    });
    if (!outcome.ok) {
        res.status(outcome.status).json({
            error: outcome.error,
            attempts_left: outcome.attempts_left,
        });
        return;
    }
    await settleNudge(req.user.id);
    res.json({ message: "Email confirmed", email_verified: true });
});
/** Retires the reminder once the address is confirmed. */
async function settleNudge(userId) {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { email_verified_at: true },
    });
    if (!user)
        return null;
    if (!(0, verification_1.emailPending)(user))
        await (0, verification_1.clearVerificationNudge)(userId);
    return user;
}
exports.default = router;
