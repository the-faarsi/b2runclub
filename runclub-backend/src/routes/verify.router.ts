import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireAccount } from "../middleware/auth";
import { normalisePhone } from "../utils/phone";
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from "../utils/otp";
import {
    clearVerificationNudge,
    confirmCode,
    issueCode,
    maskDestination,
    pendingVerification,
} from "../utils/verification";
import { mailerConfigured } from "../utils/mailer";
import { whatsappConfigured } from "../utils/whatsapp";

/**
 * Email and phone verification. Mounted at /api/auth/verify.
 *
 * Every route needs a signed-in account: a code is always issued to *your own*
 * address, never to one named in the request. Taking the destination from the
 * body would make this an open relay for sending codes to strangers.
 */
const router = Router();

router.use(requireAccount);

/** Where the member is up to, and what they need to do next. */
router.get("/status", async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
            email: true,
            phone: true,
            email_verified_at: true,
            phone_verified_at: true,
        },
    });

    if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
    }

    // Any code still in flight, so a reload of the verify screen can say which
    // address it went to instead of asking for the number again.
    const outstanding = await prisma.verificationCode.findMany({
        where: { user_id: req.user!.id, consumed_at: null, expires_at: { gt: new Date() } },
        orderBy: { created_at: "desc" },
    });

    const live = (channel: "EMAIL" | "PHONE") => {
        const row = outstanding.find((c) => c.channel === channel);
        if (!row) return null;
        return {
            sent_to: maskDestination(channel, row.destination),
            expires_at: row.expires_at,
            attempts_left: Math.max(0, OTP_MAX_ATTEMPTS - row.attempts),
        };
    };

    res.json({
        email: user.email,
        email_verified: Boolean(user.email_verified_at),
        phone: user.phone,
        phone_verified: Boolean(user.phone_verified_at),
        pending: pendingVerification(user),
        code_length: OTP_LENGTH,
        expires_in_minutes: OTP_TTL_MINUTES,
        outstanding: { email: live("EMAIL"), phone: live("PHONE") },
        /* So the UI can warn that a code will only appear in the server log
           rather than leaving somebody waiting for a message that is not
           coming. Booleans only — no credentials. */
        delivery: { email: mailerConfigured, whatsapp: whatsappConfigured },
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

/**
 * Sends a code to a phone number.
 *
 * The number comes in on this call rather than being read from the account,
 * because most members have not got one on record yet — that is the whole point
 * of the exercise. It is normalised here and kept only on the code row; it
 * reaches the user record in confirm, once somebody has proved they hold it.
 */
router.post("/phone/send", async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
    }

    // Falls back to the stored number, so "resend" works without retyping.
    const supplied = req.body?.phone ?? user.phone;
    const phone = normalisePhone(supplied);
    if (!phone.ok) {
        res.status(400).json({ error: phone.error });
        return;
    }

    if (user.phone === phone.e164 && user.phone_verified_at) {
        res.json({ message: "That number is already confirmed", already: true });
        return;
    }

    const outcome = await issueCode({
        userId: user.id,
        name: user.name,
        channel: "PHONE",
        destination: phone.e164!,
    });

    res.status(outcome.status).json(
        outcome.ok
            ? {
                  message: `Code sent on WhatsApp to ${outcome.sent_to}`,
                  sent_to: outcome.sent_to,
                  simulated: outcome.simulated,
                  expires_in_minutes: OTP_TTL_MINUTES,
              }
            : { error: outcome.error, retry_after_seconds: outcome.retry_after_seconds },
    );
});

router.post("/phone/confirm", async (req: AuthRequest, res: Response): Promise<void> => {
    const outcome = await confirmCode({
        userId: req.user!.id,
        channel: "PHONE",
        code: req.body?.code,
    });

    if (!outcome.ok) {
        res.status(outcome.status).json({
            error: outcome.error,
            attempts_left: outcome.attempts_left,
        });
        return;
    }

    const user = await settleNudge(req.user!.id);
    res.json({ message: "Phone number confirmed", phone_verified: true, phone: user?.phone ?? null });
});

/** Retires the reminder once both channels are done. */
async function settleNudge(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, email_verified_at: true, phone_verified_at: true },
    });
    if (!user) return null;
    const pending = pendingVerification(user);
    if (!pending.email && !pending.phone) await clearVerificationNudge(userId);
    return user;
}

export default router;
