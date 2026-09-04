"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const brand_1 = require("../utils/brand");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
/**
 * Race-day operations: ticket scanning, checkpoint splits, volunteer shifts and
 * the live dashboard.
 *
 * Admins and volunteers share these — volunteers are the ones actually standing
 * at the start line and the junctions, so locking scanning to admins would make
 * the feature useless in practice.
 */
const CREW = ["ADMIN", "VOLUNTEER"];
/* ── Check-in ─────────────────────────────────────────────── */
/**
 * Scan a ticket. The QR encodes JSON with a `registrationId`, so the client may
 * post either the decoded payload or the bare id.
 *
 * Deliberately idempotent: scanning the same person twice reports
 * `already_checked_in` rather than erroring, because at a start line a double
 * beep is normal and an error dialog is not.
 */
router.post("/check-in", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const { registration_id, qr_payload, event_id } = req.body ?? {};
        let regId = registration_id;
        /**
         * Accept the raw QR text and pull the id out of it.
         *
         * `reg_id` is what utils/qr.ts actually encodes on the ticket; the other
         * two spellings are tolerated so a ticket minted by an older or newer
         * generator still scans rather than failing at the start line.
         */
        if (!regId && qr_payload) {
            try {
                const parsed = typeof qr_payload === "string" ? JSON.parse(qr_payload) : qr_payload;
                regId = parsed.reg_id || parsed.registrationId || parsed.registration_id;
            }
            catch {
                res.status(400).json({ error: `That QR code isn't a ${brand_1.CLUB_NAME} ticket` });
                return;
            }
            if (!regId) {
                res.status(400).json({ error: `That QR code isn't a ${brand_1.CLUB_NAME} ticket` });
                return;
            }
        }
        if (!regId) {
            res.status(400).json({ error: "A registration id or QR payload is required" });
            return;
        }
        const reg = (await prisma_1.default.eventRegistration.findUnique({
            where: { id: regId },
            include: { event: true, user: { select: { id: true, name: true, email: true } } },
        }));
        if (!reg) {
            res.status(404).json({ error: "Unrecognised ticket" });
            return;
        }
        // Guard against scanning a valid ticket at the wrong event — the most
        // likely real mistake when two sessions run close together.
        if (event_id && reg.event_id !== event_id) {
            res.status(400).json({
                error: `That ticket is for "${reg.event.title}", not this event.`,
                wrong_event: true,
                name: reg.user.name,
            });
            return;
        }
        if (reg.blocked_at) {
            res.status(403).json({
                error: `${reg.user.name} has been removed from this event.`,
                blocked: true,
                name: reg.user.name,
            });
            return;
        }
        if (reg.status !== "PAID" && reg.status !== "FREE") {
            res.status(400).json({
                error: `${reg.user.name} hasn't completed payment (${reg.status}).`,
                unpaid: true,
                name: reg.user.name,
                status: reg.status,
            });
            return;
        }
        if (reg.attended_at) {
            res.json({
                message: `${reg.user.name} was already checked in`,
                already_checked_in: true,
                name: reg.user.name,
                attended_at: reg.attended_at,
                event_title: reg.event.title,
            });
            return;
        }
        const updated = (await prisma_1.default.eventRegistration.update({
            where: { id: reg.id },
            data: { attended_at: new Date(), checked_in_by: req.user.id },
        }));
        res.json({
            message: `${reg.user.name} checked in`,
            already_checked_in: false,
            name: reg.user.name,
            role_at_event: reg.role_at_event,
            attended_at: updated.attended_at,
            event_title: reg.event.title,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Check-in failed" });
    }
});
/** Undo a check-in — scanning the wrong person happens. */
router.post("/check-in/:registrationId/undo", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const reg = await prisma_1.default.eventRegistration.findUnique({
            where: { id: req.params.registrationId },
        });
        if (!reg) {
            res.status(404).json({ error: "Registration not found" });
            return;
        }
        await prisma_1.default.eventRegistration.update({
            where: { id: reg.id },
            data: { attended_at: null, checked_in_by: null },
        });
        res.json({ message: "Check-in undone" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not undo" });
    }
});
/* ── Live dashboard ───────────────────────────────────────── */
/**
 * One payload for the event-day screen: turnout, check-in progress, shift
 * coverage and checkpoint counts. A single request keeps the big-screen view
 * cheap to poll.
 */
router.get("/events/:id/dashboard", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const eventId = req.params.id;
        const event = await prisma_1.default.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        const [registrations, shifts, checkpoints] = await Promise.all([
            prisma_1.default.eventRegistration.findMany({
                where: { event_id: eventId },
                include: { user: { select: { id: true, name: true } } },
                orderBy: { user: { name: "asc" } },
            }),
            prisma_1.default.eventShift.findMany({
                where: { event_id: eventId },
                orderBy: [{ sort_order: "asc" }, { title: "asc" }],
                include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
            }),
            prisma_1.default.checkpoint.findMany({
                where: { event_id: eventId },
                orderBy: [{ sort_order: "asc" }, { name: "asc" }],
                include: { splits: { select: { user_id: true, recorded_at: true } } },
            }),
        ]);
        const attending = registrations.filter((r) => !r.blocked_at);
        const expected = attending.filter((r) => r.status === "PAID" || r.status === "FREE");
        const checkedIn = expected.filter((r) => r.attended_at);
        res.json({
            event: {
                id: event.id,
                title: event.title,
                date_time: event.date_time,
                location: event.location,
                status: event.status,
            },
            turnout: {
                registered: attending.length,
                expected: expected.length,
                checked_in: checkedIn.length,
                awaiting_payment: attending.filter((r) => r.status === "PENDING").length,
                blocked: registrations.length - attending.length,
                // Everyone ticket-ready who has not scanned in yet.
                no_show: expected.length - checkedIn.length,
            },
            // Most recent scans first, for the live ticker.
            recent_check_ins: checkedIn
                .sort((a, b) => +new Date(b.attended_at) - +new Date(a.attended_at))
                .slice(0, 12)
                .map((r) => ({
                registration_id: r.id,
                // Checkpoint splits key on the user, not the registration, so
                // the id has to travel with the row or the client would have to
                // match people by name — which breaks on two identical names.
                user_id: r.user.id,
                name: r.user.name,
                role_at_event: r.role_at_event,
                attended_at: r.attended_at,
            })),
            not_yet_in: expected
                .filter((r) => !r.attended_at)
                .map((r) => ({ registration_id: r.id, user_id: r.user.id, name: r.user.name })),
            shifts: shifts.map((s) => ({
                id: s.id,
                title: s.title,
                location_note: s.location_note,
                capacity: s.capacity,
                assigned: s.assignments.map((a) => ({
                    user_id: a.user.id,
                    name: a.user.name,
                })),
                // Drives the "needs cover" warning on the dashboard.
                open_slots: Math.max(0, s.capacity - s.assignments.length),
            })),
            checkpoints: checkpoints.map((c) => ({
                id: c.id,
                name: c.name,
                distance_km: c.distance_km,
                passed: c.splits.length,
                last_at: c.splits.length
                    ? c.splits.map((s) => s.recorded_at).sort().slice(-1)[0]
                    : null,
            })),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to build the dashboard" });
    }
});
/* ── Volunteer shifts ─────────────────────────────────────── */
/** Shifts for an event, with who is on them. Crew-visible. */
router.get("/events/:id/shifts", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const shifts = (await prisma_1.default.eventShift.findMany({
            where: { event_id: req.params.id },
            orderBy: [{ sort_order: "asc" }, { title: "asc" }],
            include: {
                assignments: {
                    include: { user: { select: { id: true, name: true, role: true } } },
                },
            },
        }));
        const me = req.user.id;
        res.json(shifts.map((s) => ({
            id: s.id,
            title: s.title,
            location_note: s.location_note,
            capacity: s.capacity,
            sort_order: s.sort_order,
            assigned: s.assignments.map((a) => ({
                user_id: a.user.id,
                name: a.user.name,
                role: a.user.role,
            })),
            open_slots: Math.max(0, s.capacity - s.assignments.length),
            /** Lets the UI show "You're on this" without a second lookup. */
            mine: s.assignments.some((a) => a.user_id === me),
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch shifts" });
    }
});
/** Create a marshal post (Admin only). */
router.post("/events/:id/shifts", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const { title, location_note, capacity, sort_order } = req.body ?? {};
        if (!title?.trim()) {
            res.status(400).json({ error: "A shift title is required" });
            return;
        }
        const event = await prisma_1.default.event.findUnique({ where: { id: req.params.id } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        const shift = await prisma_1.default.eventShift.create({
            data: {
                event_id: event.id,
                title: title.trim(),
                location_note: location_note?.trim() || null,
                capacity: Math.max(1, Number.parseInt(capacity, 10) || 1),
                sort_order: Number.parseInt(sort_order, 10) || 0,
            },
        });
        res.status(211).json({ message: `"${shift.title}" added`, shift });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to create the shift" });
    }
});
router.delete("/shifts/:id", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const shift = await prisma_1.default.eventShift.findUnique({ where: { id: req.params.id } });
        if (!shift) {
            res.status(404).json({ error: "Shift not found" });
            return;
        }
        await prisma_1.default.eventShift.delete({ where: { id: shift.id } });
        res.json({ message: `"${shift.title}" removed` });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to remove the shift" });
    }
});
/**
 * Claim or release a shift.
 *
 * A volunteer may only move themselves; an admin may assign anyone, which is how
 * gaps get filled when nobody volunteers.
 */
router.post("/shifts/:id/claim", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const isAdmin = req.user.role === "ADMIN";
        const targetUserId = isAdmin && req.body?.user_id ? String(req.body.user_id) : req.user.id;
        const shift = (await prisma_1.default.eventShift.findUnique({
            where: { id: req.params.id },
            include: { assignments: true, event: true },
        }));
        if (!shift) {
            res.status(404).json({ error: "Shift not found" });
            return;
        }
        if (shift.assignments.some((a) => a.user_id === targetUserId)) {
            res.json({ message: "Already on this shift", changed: false });
            return;
        }
        if (shift.assignments.length >= shift.capacity) {
            res.status(400).json({ error: `"${shift.title}" is already fully covered` });
            return;
        }
        await prisma_1.default.shiftAssignment.create({
            data: { shift_id: shift.id, user_id: targetUserId },
        });
        // Tell the person if an organiser put them on it.
        if (targetUserId !== req.user.id) {
            await prisma_1.default.notification.create({
                data: {
                    user_id: targetUserId,
                    message: `You've been assigned to "${shift.title}" at ${shift.event.title}.`,
                },
            });
        }
        res.json({ message: `On "${shift.title}"`, changed: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not claim the shift" });
    }
});
router.post("/shifts/:id/release", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const isAdmin = req.user.role === "ADMIN";
        const targetUserId = isAdmin && req.body?.user_id ? String(req.body.user_id) : req.user.id;
        const existing = await prisma_1.default.shiftAssignment.findFirst({
            where: { shift_id: req.params.id, user_id: targetUserId },
        });
        if (!existing) {
            res.json({ message: "Not on this shift", changed: false });
            return;
        }
        await prisma_1.default.shiftAssignment.delete({ where: { id: existing.id } });
        res.json({ message: "Stepped off the shift", changed: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not release the shift" });
    }
});
/* ── Checkpoints & live tracking ──────────────────────────── */
router.get("/events/:id/checkpoints", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const checkpoints = (await prisma_1.default.checkpoint.findMany({
            where: { event_id: req.params.id },
            orderBy: [{ sort_order: "asc" }, { name: "asc" }],
            include: {
                splits: {
                    include: { user: { select: { id: true, name: true } } },
                    orderBy: { recorded_at: "desc" },
                },
            },
        }));
        res.json(checkpoints.map((c) => ({
            id: c.id,
            name: c.name,
            distance_km: c.distance_km,
            sort_order: c.sort_order,
            passed: c.splits.length,
            splits: c.splits.map((s) => ({
                user_id: s.user.id,
                name: s.user.name,
                recorded_at: s.recorded_at,
            })),
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch checkpoints" });
    }
});
router.post("/events/:id/checkpoints", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const { name, distance_km, sort_order } = req.body ?? {};
        if (!name?.trim()) {
            res.status(400).json({ error: "A checkpoint name is required" });
            return;
        }
        const checkpoint = await prisma_1.default.checkpoint.create({
            data: {
                event_id: req.params.id,
                name: name.trim(),
                distance_km: distance_km === undefined ? null : Number.parseFloat(distance_km),
                sort_order: Number.parseInt(sort_order, 10) || 0,
            },
        });
        res.status(211).json({ message: `"${checkpoint.name}" added`, checkpoint });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to create the checkpoint" });
    }
});
router.delete("/checkpoints/:id", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        await prisma_1.default.checkpoint.delete({ where: { id: req.params.id } });
        res.json({ message: "Checkpoint removed" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to remove the checkpoint" });
    }
});
/**
 * Tap a runner through a checkpoint. Idempotent per (checkpoint, runner) — a
 * marshal tapping twice must not create a second split.
 */
router.post("/checkpoints/:id/pass", (0, auth_1.requireRole)(CREW), async (req, res) => {
    try {
        const { user_id } = req.body ?? {};
        if (!user_id) {
            res.status(400).json({ error: "A user_id is required" });
            return;
        }
        const checkpoint = await prisma_1.default.checkpoint.findUnique({
            where: { id: req.params.id },
        });
        if (!checkpoint) {
            res.status(404).json({ error: "Checkpoint not found" });
            return;
        }
        try {
            const split = await prisma_1.default.checkpointSplit.create({
                data: {
                    checkpoint_id: checkpoint.id,
                    user_id: String(user_id),
                    recorded_by: req.user.id,
                },
            });
            res.json({ message: "Recorded", split, changed: true });
        }
        catch {
            // Unique constraint — already tapped through here.
            res.json({ message: "Already recorded at this checkpoint", changed: false });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not record the split" });
    }
});
exports.default = router;
