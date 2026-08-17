"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 1. Financial Overview (Admin only)
router.get("/financial-overview", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        // Total revenue from PAID registrations
        const paidRegistrations = await prisma_1.default.eventRegistration.findMany({
            where: { status: "PAID" },
            include: { event: true },
        });
        const totalRevenue = paidRegistrations.reduce((sum, reg) => sum + reg.event.price, 0);
        const pendingCounts = await prisma_1.default.eventRegistration.count({
            where: { status: "PENDING" },
        });
        const paidCounts = paidRegistrations.length;
        const failedCounts = await prisma_1.default.eventRegistration.count({
            where: { status: "FAILED" },
        });
        const freeCounts = await prisma_1.default.eventRegistration.count({
            where: { status: "FREE" },
        });
        res.json({
            total_revenue: totalRevenue,
            paid_count: paidCounts,
            pending_count: pendingCounts,
            failed_count: failedCounts,
            volunteer_free_count: freeCounts,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch financial overview" });
    }
});
// 2. Export Roster for an Event as CSV (Admin only)
router.get("/events/:id/roster/export", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const eventId = req.params.id;
        // Check event exists
        const event = await prisma_1.default.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        const registrations = await prisma_1.default.eventRegistration.findMany({
            where: { event_id: eventId },
            include: { user: true },
            orderBy: { user: { name: "asc" } },
        });
        // Generate CSV contents
        const headers = "Registration ID,User Name,User Email,Event Role,Waiver Signed,Payment Status,Payment ID\n";
        const rows = registrations
            .map((reg) => {
            // Escape quotes to prevent CSV injection / parsing bugs
            const escapedName = `"${reg.user.name.replace(/"/g, '""')}"`;
            const escapedEmail = `"${reg.user.email.replace(/"/g, '""')}"`;
            return `${reg.id},${escapedName},${escapedEmail},${reg.role_at_event},${reg.waiver_signed},${reg.status},${reg.razorpay_payment_id || "N/A"}`;
        })
            .join("\n");
        const csvContent = headers + rows;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=event_roster_${eventId}.csv`);
        res.status(200).send(csvContent);
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to export roster" });
    }
});
// 3. Poll Analytics (Admin only)
router.get("/polls/:id/analytics", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const pollId = req.params.id;
        const poll = await prisma_1.default.poll.findUnique({
            where: { id: pollId },
            include: {
                options: {
                    include: {
                        _count: { select: { votes: true } },
                    },
                },
            },
        });
        if (!poll) {
            res.status(404).json({ error: "Poll not found" });
            return;
        }
        // Calculate total votes cast
        const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);
        const optionsAnalytics = poll.options.map((opt) => {
            const voteCount = opt._count.votes;
            const percentage = totalVotes > 0 ? parseFloat(((voteCount / totalVotes) * 100).toFixed(2)) : 0;
            return {
                option_id: opt.id,
                option_text: opt.option_text,
                vote_count: voteCount,
                percentage,
            };
        });
        res.json({
            poll_id: poll.id,
            title: poll.title,
            active: poll.active,
            total_votes: totalVotes,
            options_analytics: optionsAnalytics,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch poll analytics" });
    }
});
exports.default = router;
