"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const razorpay_1 = __importDefault(require("razorpay"));
const router = (0, express_1.Router)();
// Razorpay SDK setup
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "rzp_test_YourTestKeyId";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || "YourTestKeySecret";
const razorpay = new razorpay_1.default({
    key_id: razorpayKeyId,
    key_secret: razorpayKeySecret,
});
// Helper: check if we should mock Razorpay API calls
const isRazorpayMock = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_YourTestKeyId";
// 1. Create Event (Admin only)
router.post("/", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const { title, type, date_time, location, price, status } = req.body;
        const adminId = req.user.id;
        if (!title || !type || !date_time || !location || price === undefined) {
            res.status(400).json({ error: "Missing required fields for event creation" });
            return;
        }
        const eventPrice = parseFloat(price);
        if (isNaN(eventPrice) || eventPrice < 0) {
            res.status(400).json({ error: "Invalid price value" });
            return;
        }
        const eventStatus = status || "DRAFT";
        if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(eventStatus)) {
            res.status(400).json({ error: "Invalid status value" });
            return;
        }
        const event = await prisma_1.default.event.create({
            data: {
                title,
                type,
                date_time: new Date(date_time),
                location,
                price: eventPrice,
                status: eventStatus,
                admin_id: adminId,
            },
        });
        res.status(211).json({ message: "Event created successfully", event });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to create event" });
    }
});
// 2. Get Events (Public & Auth role-restricted)
router.get("/", async (req, res) => {
    try {
        const userRole = req.user ? req.user.role : "VISITOR";
        let events;
        if (userRole === "ADMIN") {
            // Admins see all events (DRAFT, PUBLISHED, ARCHIVED)
            events = await prisma_1.default.event.findMany({
                orderBy: { date_time: "asc" },
            });
        }
        else {
            // Members, Volunteers, Visitors see only PUBLISHED (or ARCHIVED past events, but let's filters PUBLISHED for active)
            events = await prisma_1.default.event.findMany({
                where: { status: "PUBLISHED" },
                orderBy: { date_time: "asc" },
            });
        }
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch events" });
    }
});
// 3. Get Single Event
router.get("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const userRole = req.user ? req.user.role : "VISITOR";
        const event = await prisma_1.default.event.findUnique({
            where: { id },
        });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        if (event.status !== "PUBLISHED" && userRole !== "ADMIN") {
            res.status(403).json({ error: "Access denied to unpublished event" });
            return;
        }
        res.json(event);
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch event" });
    }
});
// 4. Update Event (Admin only)
router.put("/:id", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const id = req.params.id;
        const { title, type, date_time, location, price, status } = req.body;
        const event = await prisma_1.default.event.findUnique({ where: { id } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        const dataToUpdate = {};
        if (title !== undefined)
            dataToUpdate.title = title;
        if (type !== undefined)
            dataToUpdate.type = type;
        if (date_time !== undefined)
            dataToUpdate.date_time = new Date(date_time);
        if (location !== undefined)
            dataToUpdate.location = location;
        if (price !== undefined) {
            const p = parseFloat(price);
            if (isNaN(p) || p < 0) {
                res.status(400).json({ error: "Invalid price value" });
                return;
            }
            dataToUpdate.price = p;
        }
        if (status !== undefined) {
            if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
                res.status(400).json({ error: "Invalid status value" });
                return;
            }
            dataToUpdate.status = status;
        }
        const updatedEvent = await prisma_1.default.event.update({
            where: { id },
            data: dataToUpdate,
        });
        res.json({ message: "Event updated successfully", event: updatedEvent });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to update event" });
    }
});
// 5. Delete Event (Admin only)
router.delete("/:id", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const id = req.params.id;
        const event = await prisma_1.default.event.findUnique({ where: { id } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        // Cascade delete registrations first to maintain relational integrity
        await prisma_1.default.eventRegistration.deleteMany({ where: { event_id: id } });
        await prisma_1.default.event.delete({ where: { id } });
        res.json({ message: "Event deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to delete event" });
    }
});
// 6. Register / Checkout Flow
router.post("/:id/register", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER"]), async (req, res) => {
    try {
        const eventId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.role;
        const { waiver_signed, emergency_contact } = req.body;
        // Check emergency contact is provided (from request or check database)
        const user = await prisma_1.default.user.findUnique({ where: { id: userId } });
        const finalEmergencyContact = emergency_contact || user?.emergency_contact;
        if (!finalEmergencyContact) {
            res.status(400).json({ error: "Emergency contact information is required for registration" });
            return;
        }
        // Validate liability waiver signing
        if (waiver_signed !== true) {
            res.status(400).json({ error: "You must consent and sign the liability waiver to register" });
            return;
        }
        // Check if event exists and is PUBLISHED
        const event = await prisma_1.default.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        if (event.status !== "PUBLISHED") {
            res.status(400).json({ error: "Registration is not open for this event" });
            return;
        }
        // Check if user is already registered for this event
        const existingRegistration = await prisma_1.default.eventRegistration.findFirst({
            where: { event_id: eventId, user_id: userId },
        });
        if (existingRegistration) {
            res.status(400).json({
                error: "You are already registered for this event",
                registration: existingRegistration,
            });
            return;
        }
        // Update emergency contact on User model if provided in this request
        if (emergency_contact && emergency_contact !== user?.emergency_contact) {
            await prisma_1.default.user.update({
                where: { id: userId },
                data: { emergency_contact },
            });
        }
        // Determine initial payment status and roles
        let paymentStatus = "PENDING";
        let roleAtEvent = "MEMBER";
        if (userRole === "VOLUNTEER") {
            paymentStatus = "FREE";
            roleAtEvent = "VOLUNTEER";
        }
        else if (event.price === 0) {
            paymentStatus = "FREE";
        }
        let razorpayOrderId = null;
        if (paymentStatus === "PENDING") {
            // Create Razorpay Order
            if (isRazorpayMock) {
                razorpayOrderId = `order_mock_${Math.random().toString(36).substring(2, 11)}`;
            }
            else {
                const orderOptions = {
                    amount: Math.round(event.price * 100), // In Indian Paisa
                    currency: "INR",
                    receipt: `event_registration_${Date.now()}`,
                    notes: {
                        eventId,
                        userId,
                    },
                };
                const order = await razorpay.orders.create(orderOptions);
                razorpayOrderId = order.id;
            }
        }
        // Create the registration record
        const registration = await prisma_1.default.eventRegistration.create({
            data: {
                event_id: eventId,
                user_id: userId,
                status: paymentStatus,
                role_at_event: roleAtEvent,
                waiver_signed: true,
                razorpay_order_id: razorpayOrderId,
            },
        });
        res.status(211).json({
            message: paymentStatus === "FREE" ? "Registration completed successfully (Free)" : "Registration initiated",
            registration,
            razorpay_key_id: isRazorpayMock ? "mock_key_id" : razorpayKeyId,
            amount: event.price * 100,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Registration failed" });
    }
});
exports.default = router;
