"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const router = (0, express_1.Router)();
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "CreateAStrongSecret";
// Razorpay Webhook Endpoint
router.post("/webhook", async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];
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
        const expectedSignature = crypto_1.default
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
            const registration = await prisma_1.default.eventRegistration.findUnique({
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
                await prisma_1.default.eventRegistration.update({
                    where: { id: registration.id },
                    data: {
                        status: "PAID",
                        razorpay_payment_id: razorpayPaymentId,
                    },
                });
                // Trigger Notification to member for successful signup
                await prisma_1.default.notification.create({
                    data: {
                        user_id: registration.user_id,
                        message: `Payment successful! You are registered for the event "${registration.event.title}". scan your QR code ticket at the entrance.`,
                        link: `/api/events/registration/${registration.id}/ticket`,
                    },
                });
            }
        }
        res.status(200).json({ status: "ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Webhook processing failed" });
    }
});
exports.default = router;
