import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireAccount } from "../middleware/auth";
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from "../utils/otp";
import {
    clearVerificationNudge,
    confirmCode,
    emailPending,
    issueCode,
    maskDestination,
} from "../utils/verification";
import { mailerConfigured } from "../utils/mailer";

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
const router = Router();

router.use(requireAccount);

/** Where the member is up to, and what they need to do next. */
router.get("/status", async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { email: true, email_verified_at: true },
    });

    if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
    }

    // A code still in flight, so a reload of the verify screen shows the box
    // rather than making the member ask for one they already have.
    const row = await prisma.verificationCode.findFirst({
        where: {
            user_id: req.user!.id,
            channel: "EMAIL",
            consumed_at: null,
            expires_at: { gt: new Date() },
        },
        orderBy: { created_at: "desc" },
    });

    res.json({
        email: user.email,
        email_verified: Boolean(user.email_verified_at),
        pending: emailPending(user),
        code_length: OTP_LENGTH,
        expires_in_minutes: OTP_TTL_MINUTES,
        outstanding: row
            ? {
                  sent_to: maskDestination("EMAIL", row.destination),
                  expires_at: row.expires_at,
                  attempts_left: Math.max(0, OTP_MAX_ATTEMPTS - row.attempts),
              }
            : null,
        /* So the UI can warn that a code will only appear in the server log
           rather than leaving somebody waiting for a message that is not
           coming. A boolean only — no credentials. */
        delivery: { email: mailerConfigured },
    });
});

/** Sends a code to the address already on the account. */
router.post("/email/send", async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
    }
    if (user.email_verified_at) {
        res.json({ message: "Your email is already confirmed", already: true });
        return;
    }

    const outcome = await issueCode({
        userId: user.id,
        name: user.name,
        channel: "EMAIL",
        destination: user.email,
    });

    res.status(outcome.status).json(
        outcome.ok
            ? {
                  message: `Code sent to ${outcome.sent_to}`,
                  sent_to: outcome.sent_to,
                  simulated: outcome.simulated,
                  expires_in_minutes: OTP_TTL_MINUTES,
              }
            : { error: outcome.error, retry_after_seconds: outcome.retry_after_seconds },
    );
});

router.post("/email/confirm", async (req: AuthRequest, res: Response): Promise<void> => {
    const outcome = await confirmCode({
        userId: req.user!.id,
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

    await settleNudge(req.user!.id);
    res.json({ message: "Email confirmed", email_verified: true });
});

/** Retires the reminder once the address is confirmed. */
async function settleNudge(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email_verified_at: true },
    });
    if (!user) return null;
    if (!emailPending(user)) await clearVerificationNudge(userId);
    return user;
}

export default router;
