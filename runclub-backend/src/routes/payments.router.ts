import { Router, Response } from "express";
import crypto from "crypto";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "CreateAStrongSecret";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || "YourTestKeySecret";

// Extended request type to support raw body stored by custom JSON parser verification
interface WebhookRequest extends AuthRequest {
    rawBody?: string;
}

// Razorpay Webhook Endpoint
router.post("/webhook", async (req: WebhookRequest, res: Response): Promise<void> => {
    try {
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
            .createHmac("sha256", webhookSecret)
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
                .createHmac("sha256", razorpayKeySecret)
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
const isMockMode =
    !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_YourTestKeyId";

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

/** Lets the client know whether real Checkout is available. */
router.get("/config", async (_req: AuthRequest, res: Response): Promise<void> => {
    res.json({
        mock_mode: isMockMode,
        // Publishable key only — never the secret.
        key_id: isMockMode ? null : process.env.RAZORPAY_KEY_ID,
        simulation_available: isMockMode && process.env.NODE_ENV !== "production",
    });
});

export default router;
