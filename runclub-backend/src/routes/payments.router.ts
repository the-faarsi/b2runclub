import { Router, Response } from "express";
import crypto from "crypto";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";
import Razorpay from "razorpay";

import {
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_MOCK_MODE,
    RAZORPAY_WEBHOOK_SECRET,
    WEBHOOKS_VERIFIABLE,
} from "../utils/secrets";

const razorpay = new Razorpay({
    // Placeholder strings only; every call is gated behind RAZORPAY_MOCK_MODE.
    key_id: RAZORPAY_KEY_ID ?? "unconfigured",
    key_secret: RAZORPAY_KEY_SECRET ?? "unconfigured",
});

const router = Router();

// Extended request type to support raw body stored by custom JSON parser verification
interface WebhookRequest extends AuthRequest {
    rawBody?: string;
}

// Razorpay Webhook Endpoint
router.post("/webhook", async (req: WebhookRequest, res: Response): Promise<void> => {
    try {
        /**
         * With no webhook secret configured there is nothing to verify against, so
         * every request is refused. Previously this fell back to a default string
         * published in the source, which meant an unconfigured deployment happily
         * accepted forged "payment.captured" events and marked entries paid.
         */
        if (!WEBHOOKS_VERIFIABLE) {
            console.error(
                "[webhook] rejected: RAZORPAY_WEBHOOK_SECRET is not set, so signatures cannot be verified",
            );
            res.status(503).json({
                error: "Webhooks are not configured on this server",
            });
            return;
        }

        const signature = req.headers["x-razorpay-signature"] as string;

        if (!signature) {
            res.status(400).json({ error: "Missing x-razorpay-signature header" });
            return;
        }

        const rawBody = req.rawBody;
        if (!rawBody) {
            res.status(400).json({ error: "Missing raw body for verification" });
            return;
        }

        // Verify signature using HMAC SHA256
        const expectedSignature = crypto
            .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET!)
            .update(rawBody)
            .digest("hex");

        if (expectedSignature !== signature) {
            res.status(400).json({ error: "Invalid webhook signature" });
            return;
        }

        // Parse verified payload body
        const payload = JSON.parse(rawBody);
        const eventType = payload.event;

        // We process "order.paid" or general "payment.captured"
        if (eventType === "order.paid" || eventType === "payment.captured") {
            const paymentEntity = payload.payload.payment.entity;
            const razorpayOrderId = paymentEntity.order_id;
            const razorpayPaymentId = paymentEntity.id;

            if (!razorpayOrderId) {
                res.status(400).json({ error: "Missing order_id in payment payload" });
                return;
            }

            // Find registration by Razorpay order ID
            const registration = await prisma.eventRegistration.findUnique({
                where: { razorpay_order_id: razorpayOrderId },
                include: { event: true, user: true },
            });

            if (!registration) {
                // Log of unrecognized order ID is fine; Razorpay might occasionally resend
                res.status(404).json({ error: `Registration not found for order ${razorpayOrderId}` });
                return;
            }

            // Only update if not already processed
            if (registration.status !== "PAID") {
                await prisma.eventRegistration.update({
                    where: { id: registration.id },
                    data: {
                        status: "PAID",
                        razorpay_payment_id: razorpayPaymentId,
                    },
                });

                // Trigger Notification to member for successful signup
                await prisma.notification.create({
                    data: {
                        user_id: registration.user_id,
                        message: `Payment successful! You are registered for the event "${registration.event.title}". scan your QR code ticket at the entrance.`,
                        link: `/api/events/registration/${registration.id}/ticket`,
                    },
                });
            }
        }

        res.status(200).json({ status: "ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Webhook processing failed" });
    }
});

/**
 * Verify a Razorpay Checkout callback and mark the registration paid.
 *
 * The webhook above is the authoritative path in production, but it requires a
 * publicly reachable URL, so it never fires in local development. Razorpay's
 * documented client flow returns { order_id, payment_id, signature } to the
 * browser after a successful payment; this endpoint verifies that signature
 * server-side (HMAC-SHA256 of "order_id|payment_id" keyed with the API secret)
 * and completes the registration. It is idempotent and safe to call twice.
 */
router.post(
    "/verify",
    requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                res.status(400).json({
                    error: "razorpay_order_id, razorpay_payment_id and razorpay_signature are all required",
                });
                return;
            }

            // Signature is over "<order_id>|<payment_id>" keyed with the API secret.
            const expectedSignature = crypto
                .createHmac("sha256", RAZORPAY_KEY_SECRET!)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest("hex");

            const provided = Buffer.from(String(razorpay_signature));
            const expected = Buffer.from(expectedSignature);

            if (
                provided.length !== expected.length ||
                !crypto.timingSafeEqual(provided, expected)
            ) {
                res.status(400).json({ error: "Payment signature verification failed" });
                return;
            }

            const registration = await prisma.eventRegistration.findUnique({
                where: { razorpay_order_id },
                include: { event: true },
            });

            if (!registration) {
                res.status(404).json({ error: "No registration found for that order" });
                return;
            }

            // A member may only settle their own registration.
            if (registration.user_id !== req.user!.id && req.user!.role !== "ADMIN") {
                res.status(403).json({ error: "Access denied to this registration" });
                return;
            }

            // Idempotent: a webhook may already have processed this order.
            if (registration.status === "PAID") {
                res.json({ message: "Payment already recorded", registration });
                return;
            }

            const updated = await prisma.eventRegistration.update({
                where: { id: registration.id },
                data: { status: "PAID", razorpay_payment_id },
            });

            await prisma.notification.create({
                data: {
                    user_id: registration.user_id,
                    message: `Payment successful! You are registered for the event "${registration.event.title}". Scan your QR code ticket at the entrance.`,
                    link: `/api/events/registration/${registration.id}/ticket`,
                },
            });

            res.json({ message: "Payment verified", registration: updated });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Payment verification failed" });
        }
    }
);

/**
 * Development-only: settle a mock order without Razorpay.
 *
 * With placeholder credentials the backend mints `order_mock_*` ids that real
 * Checkout would reject, so a paid registration could never leave PENDING and
 * the flow was impossible to demonstrate. This completes it locally.
 *
 * Three hard guards, all of which must hold:
 *  - NODE_ENV must not be "production",
 *  - the backend must actually be in mock mode (placeholder key id),
 *  - the order id must carry the `order_mock_` prefix.
 *
 * With real keys configured, this route refuses every request and the genuine
 * Checkout → /verify path is the only way to pay.
 */
const isMockMode = RAZORPAY_MOCK_MODE;

router.post(
    "/simulate",
    requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (process.env.NODE_ENV === "production") {
                res.status(404).json({ error: "Not found" });
                return;
            }
            if (!isMockMode) {
                res.status(400).json({
                    error: "Razorpay keys are configured — use the real Checkout flow.",
                });
                return;
            }

            const { registration_id } = req.body;
            if (!registration_id) {
                res.status(400).json({ error: "registration_id is required" });
                return;
            }

            const registration = await prisma.eventRegistration.findUnique({
                where: { id: registration_id },
                include: { event: true },
            });

            if (!registration) {
                res.status(404).json({ error: "Registration not found" });
                return;
            }

            if (registration.user_id !== req.user!.id && req.user!.role !== "ADMIN") {
                res.status(403).json({ error: "You can only settle your own registration" });
                return;
            }

            if (!registration.razorpay_order_id?.startsWith("order_mock_")) {
                res.status(400).json({
                    error: "This registration has a real Razorpay order — pay through Checkout.",
                });
                return;
            }

            if (registration.status === "PAID") {
                res.json({ message: "Already paid", registration, changed: false });
                return;
            }

            const updated = await prisma.eventRegistration.update({
                where: { id: registration.id },
                data: { status: "PAID", razorpay_payment_id: `pay_simulated_${Date.now()}` },
            });

            await prisma.notification.create({
                data: {
                    user_id: registration.user_id,
                    message: `Payment simulated for "${registration.event.title}" (development mode). Your ticket is live.`,
                    link: `/api/events/registration/${registration.id}/ticket`,
                },
            });

            res.json({
                message: "Payment simulated — your ticket is live",
                registration: updated,
                changed: true,
                simulated: true,
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Simulation failed" });
        }
    }
);

/**
 * Mint a fresh Razorpay order for a registration that cannot be paid.
 *
 * A registration created while Razorpay was unconfigured carries an
 * `order_mock_…` id. Once real keys are added, that registration is stranded:
 * Checkout rejects the order because it does not exist at Razorpay, and
 * `/simulate` refuses because keys are now present. The member is left with a
 * PENDING entry and no way to settle it.
 *
 * This re-mints a genuine order against the same registration, so the spot and
 * the signup date are preserved rather than being cancelled and redone.
 */
router.post(
    "/order/:registrationId/refresh",
    requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (isMockMode) {
                res.status(400).json({
                    error: "Razorpay isn't configured on this server, so a real order can't be created.",
                });
                return;
            }

            const registration = (await prisma.eventRegistration.findUnique({
                where: { id: req.params.registrationId as string },
                include: { event: true },
            })) as any;

            if (!registration) {
                res.status(404).json({ error: "Registration not found" });
                return;
            }
            if (registration.user_id !== req.user!.id && req.user!.role !== "ADMIN") {
                res.status(403).json({ error: "You can only refresh your own registration" });
                return;
            }
            if (registration.status !== "PENDING") {
                res.status(400).json({
                    error: `Only a PENDING registration needs a new order — this one is ${registration.status}.`,
                });
                return;
            }
            if (registration.blocked_at) {
                res.status(403).json({
                    error: "An organiser has removed you from this event.",
                });
                return;
            }
            if (registration.event.price <= 0) {
                res.status(400).json({ error: "This event is free — no payment is required." });
                return;
            }

            let order: { id: string };
            try {
                order = (await (razorpay.orders as any).create({
                    amount: Math.round(registration.event.price * 100), // paise
                    currency: "INR",
                    receipt: `reg_${registration.id.slice(0, 30)}`,
                    notes: {
                        registration_id: registration.id,
                        event: registration.event.title,
                        reason: "re-issued for an unusable order id",
                    },
                })) as { id: string };
            } catch (err: any) {
                const detail =
                    err?.error?.description ||
                    err?.message ||
                    (err?.statusCode === 401
                        ? "Razorpay rejected the API credentials."
                        : `Razorpay refused to create the order${err?.statusCode ? ` (HTTP ${err.statusCode})` : ""}.`);
                console.error(
                    `[order-refresh] registration ${registration.id}:`,
                    JSON.stringify(err, Object.getOwnPropertyNames(err || {})),
                );
                res.status(400).json({ error: detail });
                return;
            }

            const previous = registration.razorpay_order_id;
            const updated = await prisma.eventRegistration.update({
                where: { id: registration.id },
                data: { razorpay_order_id: order.id },
            });

            console.log(
                `[order-refresh] registration ${registration.id}: ${previous} -> ${order.id}`,
            );

            res.json({
                message: "A new payment order is ready",
                registration: updated,
                razorpay_order_id: order.id,
                previous_order_id: previous,
                razorpay_key_id: RAZORPAY_KEY_ID,
                amount: Math.round(registration.event.price * 100),
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Could not create a new order" });
        }
    }
);

/** Lets the client know whether real Checkout is available. */
router.get("/config", async (_req: AuthRequest, res: Response): Promise<void> => {
    res.json({
        mock_mode: isMockMode,
        // Publishable key only — never the secret.
        key_id: isMockMode ? null : RAZORPAY_KEY_ID,
        simulation_available: isMockMode && process.env.NODE_ENV !== "production",
    });
});

/**
 * Refund a paid registration (Admin only).
 *
 * Calls Razorpay's refund API for the captured payment, then records the refund
 * on the registration so it is auditable. The registration is left in place with
 * `refunded_at` set rather than deleted — a deleted row loses the fact that money
 * moved, which is exactly what accounting needs to see.
 */
router.post(
    "/refund/:registrationId",
    requireRole(["ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const registration = await prisma.eventRegistration.findUnique({
                where: { id: req.params.registrationId as string },
                include: { event: true, user: { select: { id: true, name: true } } },
            }) as any;

            if (!registration) {
                res.status(404).json({ error: "Registration not found" });
                return;
            }
            // Checked before the status guard: a refund flips status to FAILED, so
            // asking about status first would report "this one is FAILED" for an
            // already-refunded row instead of saying it was refunded.
            if (registration.refunded_at) {
                res.status(400).json({
                    error: `Already refunded — ₹${registration.refund_amount} on ${new Date(
                        registration.refunded_at
                    ).toLocaleDateString("en-IN")}.`,
                });
                return;
            }
            if (registration.status !== "PAID") {
                res.status(400).json({
                    error: `Only a PAID registration can be refunded — this one is ${registration.status}.`,
                });
                return;
            }
            if (!registration.razorpay_payment_id) {
                res.status(400).json({ error: "No captured payment id to refund against" });
                return;
            }

            // Partial refunds are supported; default to the full entry fee.
            const requested = req.body?.amount;
            const amount =
                requested === undefined ? registration.event.price : Number.parseFloat(requested);

            if (!Number.isFinite(amount) || amount <= 0 || amount > registration.event.price) {
                res.status(400).json({
                    error: `Refund must be between 0 and the entry fee (₹${registration.event.price}).`,
                });
                return;
            }

            let refundId: string;

            if (isMockMode || registration.razorpay_payment_id.startsWith("pay_simulated")) {
                // A simulated payment has no counterpart at Razorpay, so calling
                // their API would 400. Record it locally instead.
                refundId = `rfnd_local_${Date.now()}`;
            } else {
                try {
                    const refund = await (razorpay as any).payments.refund(
                        registration.razorpay_payment_id,
                        {
                            amount: Math.round(amount * 100), // paise
                            speed: "normal",
                            notes: { registration_id: registration.id, event: registration.event.title },
                        }
                    );
                    refundId = refund.id;
                } catch (err: any) {
                    // Razorpay's SDK is inconsistent here: sometimes it gives a full
                    // { error: { description } }, but for a 404 it throws bare
                    // { statusCode: 404 } with no message at all. Falling straight
                    // through to a generic string left the admin with nothing to act
                    // on, so map the status codes we can actually explain.
                    const byStatus: Record<number, string> = {
                        400: "Razorpay rejected the refund — the payment may already be fully refunded.",
                        401: "Razorpay credentials were rejected. Check RAZORPAY_KEY_ID / KEY_SECRET.",
                        404: "Razorpay has no record of this payment. It was likely captured under different API keys.",
                    };
                    const detail =
                        err?.error?.description ||
                        err?.message ||
                        byStatus[err?.statusCode as number] ||
                        `Refund was rejected${err?.statusCode ? ` (HTTP ${err.statusCode})` : ""}.`;
                    console.error(
                        `[refund] registration ${registration.id} failed:`,
                        JSON.stringify(err, Object.getOwnPropertyNames(err || {}))
                    );
                    res.status(400).json({ error: detail });
                    return;
                }
            }

            const updated = await prisma.eventRegistration.update({
                where: { id: registration.id },
                data: {
                    refund_id: refundId,
                    refunded_at: new Date(),
                    refund_amount: amount,
                    // FAILED reads correctly downstream: it drops out of revenue
                    // and out of the ticket-ready count.
                    status: "FAILED",
                },
            });

            await prisma.notification.create({
                data: {
                    user_id: registration.user_id,
                    message: `₹${amount} has been refunded for "${registration.event.title}". It should reach your account in 5–7 days.`,
                },
            });

            res.json({
                message: `₹${amount} refunded to ${registration.user.name}`,
                refund_id: refundId,
                amount,
                simulated: refundId.startsWith("rfnd_local_"),
                registration: updated,
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Refund failed" });
        }
    }
);

export default router;
