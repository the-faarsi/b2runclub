import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { CLUB_NAME } from "../utils/brand";
import { AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

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
router.post("/check-in", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { registration_id, qr_payload, event_id } = req.body ?? {};

        let regId: string | undefined = registration_id;

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
            } catch {
                res.status(400).json({ error: `That QR code isn't a ${CLUB_NAME} ticket` });
                return;
            }

            if (!regId) {
                res.status(400).json({ error: `That QR code isn't a ${CLUB_NAME} ticket` });
                return;
            }
        }

        if (!regId) {
            res.status(400).json({ error: "A registration id or QR payload is required" });
            return;
        }

        const reg = (await prisma.eventRegistration.findUnique({
            where: { id: regId },
            include: {
                event: true,
                user: { select: { id: true, name: true, email: true } },
                /* The whole party. A ticket covers everyone on the booking, and
                   the crew admit them one at a time — so the scan has to answer
                   "who does this QR cover", not just "whose QR is this". */
                guests: { orderBy: [{ is_booker: "desc" }, { created_at: "asc" }] },
            },
        })) as any;

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

        /*
         * A party of one is admitted on the scan, as it always was — there is
         * nothing to choose, and asking a marshal to tap twice for the common
         * case would be worse than the problem it solves.
         *
         * A party of more than one is not. The scan reports who the booking
         * covers and admits nobody; the crew tick people off as they arrive,
         * which is the whole point — "booked for two, one turned up" is a fact
         * about a person, not about the booking.
         */
        const party = reg.guests as any[];

        if (party.length === 1) {
            const only = party[0];
            if (only.admitted_at) {
                res.json({
                    message: `${only.name} was already checked in`,
                    already_checked_in: true,
                    registration_id: reg.id,
                    name: only.name,
                    attended_at: only.admitted_at,
                    event_title: reg.event.title,
                    party: shapeParty(party),
                    admitted_count: 1,
                    party_size: 1,
                });
                return;
            }

            const now = new Date();
            await prisma.registrationGuest.update({
                where: { id: only.id },
                data: { admitted_at: now, admitted_by: req.user!.id },
            });
            // Kept in step so the roster badges and results, which read the
            // booking rather than the guests, still see a check-in.
            await prisma.eventRegistration.update({
                where: { id: reg.id },
                data: { attended_at: now, checked_in_by: req.user!.id },
            });

            res.json({
                message: `${only.name} checked in`,
                already_checked_in: false,
                auto_admitted: true,
                registration_id: reg.id,
                name: only.name,
                role_at_event: reg.role_at_event,
                attended_at: now,
                event_title: reg.event.title,
                party: shapeParty(party.map((g) => ({ ...g, admitted_at: now }))),
                admitted_count: 1,
                party_size: 1,
            });
            return;
        }

        const admitted = party.filter((g) => g.admitted_at).length;
        res.json({
            message:
                admitted === 0
                    ? `${reg.user.name}'s booking covers ${party.length} people`
                    : admitted === party.length
                      ? `All ${party.length} already checked in`
                      : `${admitted} of ${party.length} already checked in`,
            already_checked_in: admitted === party.length,
            auto_admitted: false,
            registration_id: reg.id,
            name: reg.user.name,
            role_at_event: reg.role_at_event,
            event_title: reg.event.title,
            party: shapeParty(party),
            admitted_count: admitted,
            party_size: party.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Check-in failed" });
    }
});

/** Only what a crew screen needs — no ids of other people, no timestamps of ours. */
function shapeParty(guests: any[]) {
    return guests.map((g) => ({
        id: g.id,
        name: g.name,
        kind: g.kind,
        is_booker: g.is_booker,
        admitted_at: g.admitted_at ?? null,
    }));
}

/**
 * Keeps EventRegistration.attended_at in step with the guest rows.
 *
 * The booking-level timestamp is still read by the roster, the results screen
 * and the member's own ticket, so it cannot be allowed to drift: it means "at
 * least one of this party has arrived", and it clears when the last one is
 * un-admitted.
 */
async function syncBookingAttendance(registrationId: string, crewId: string) {
    const rows = await prisma.registrationGuest.findMany({
        where: { registration_id: registrationId },
        select: { admitted_at: true },
    });
    const first = rows
        .map((r) => r.admitted_at)
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => a.getTime() - b.getTime())[0];

    await prisma.eventRegistration.update({
        where: { id: registrationId },
        data: first
            ? { attended_at: first, checked_in_by: crewId }
            : { attended_at: null, checked_in_by: null },
    });
    return rows.filter((r) => r.admitted_at).length;
}

/** Loads a guest with everything the guards below need. */
async function loadGuest(id: string) {
    return prisma.registrationGuest.findUnique({
        where: { id },
        include: {
            registration: {
                include: {
                    event: { select: { id: true, title: true } },
                    user: { select: { name: true } },
                },
            },
        },
    }) as any;
}

/**
 * Admit one named person.
 *
 * Per guest rather than per booking, which is the thing the club asked for: a
 * QR covering two people where only one turns up leaves the other outstanding
 * until they appear, rather than marking both present or neither.
 */
router.post("/guests/:guestId/admit", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const guest = await loadGuest(req.params.guestId as string);
        if (!guest) {
            res.status(404).json({ error: "Unrecognised person on this booking" });
            return;
        }
        if (guest.registration.blocked_at) {
            res.status(403).json({
                error: `${guest.registration.user.name} has been removed from this event.`,
                blocked: true,
            });
            return;
        }
        if (guest.admitted_at) {
            res.json({
                message: `${guest.name} was already checked in`,
                already_admitted: true,
                guest: shapeParty([guest])[0],
            });
            return;
        }

        const now = new Date();
        await prisma.registrationGuest.update({
            where: { id: guest.id },
            data: { admitted_at: now, admitted_by: req.user!.id },
        });
        const admitted = await syncBookingAttendance(guest.registration_id, req.user!.id);

        const party = await prisma.registrationGuest.findMany({
            where: { registration_id: guest.registration_id },
            orderBy: [{ is_booker: "desc" }, { created_at: "asc" }],
        });
        res.json({
            message: `${guest.name} checked in`,
            already_admitted: false,
            registration_id: guest.registration_id,
            party: shapeParty(party),
            admitted_count: admitted,
            party_size: party.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not admit that person" });
    }
});

/** Undo one person's admission — a marshal tapping the wrong name happens. */
router.post("/guests/:guestId/unadmit", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const guest = await loadGuest(req.params.guestId as string);
        if (!guest) {
            res.status(404).json({ error: "Unrecognised person on this booking" });
            return;
        }
        if (!guest.admitted_at) {
            res.json({
                message: `${guest.name} was not checked in`,
                already_admitted: false,
                guest: shapeParty([guest])[0],
            });
            return;
        }

        await prisma.registrationGuest.update({
            where: { id: guest.id },
            data: { admitted_at: null, admitted_by: null },
        });
        const admitted = await syncBookingAttendance(guest.registration_id, req.user!.id);

        const party = await prisma.registrationGuest.findMany({
            where: { registration_id: guest.registration_id },
            orderBy: [{ is_booker: "desc" }, { created_at: "asc" }],
        });
        res.json({
            message: `${guest.name} put back to not arrived`,
            registration_id: guest.registration_id,
            party: shapeParty(party),
            admitted_count: admitted,
            party_size: party.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not undo that" });
    }
});

/** Undo a check-in — scanning the wrong person happens. */
router.post("/check-in/:registrationId/undo", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reg = await prisma.eventRegistration.findUnique({
            where: { id: req.params.registrationId as string },
        });
        if (!reg) {
            res.status(404).json({ error: "Registration not found" });
            return;
        }
        /*
         * Clears the guest rows as well as the booking.
         *
         * Undoing only the booking would have left every guest still marked
         * admitted while the booking said nobody had arrived — the two are read
         * by different screens, so that disagreement would show up as a party
         * present on the roster and absent on the dashboard. This is the
         * "nobody arrived" undo; to correct one person, use
         * /guests/:guestId/unadmit.
         */
        await prisma.registrationGuest.updateMany({
            where: { registration_id: reg.id },
            data: { admitted_at: null, admitted_by: null },
        });
        await prisma.eventRegistration.update({
            where: { id: reg.id },
            data: { attended_at: null, checked_in_by: null },
        });
        res.json({ message: "Check-in undone for the whole booking" });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not undo" });
    }
});

/* ── Live dashboard ───────────────────────────────────────── */

/**
 * Flattens bookings into one row per person.
 *
 * A booking can cover up to six people behind a single QR, so anything the
 * event-day screen counts or lists has to be built from this rather than from
 * the registration rows — otherwise a family of four counts once.
 *
 * A booking with no guest rows (made before parties existed) yields its booker
 * with `guest_id: null`, which tells the client to fall back to the
 * booking-level check-in routes for that person.
 */
function toPeople(regs: any[]) {
    return regs.flatMap((r) => {
        const rows =
            r.guests?.length > 0
                ? r.guests
                : [{ id: null, name: r.user.name, kind: "ADULT", is_booker: true, admitted_at: r.attended_at }];

        return rows.map((g: any) => ({
            guest_id: g.id as string | null,
            registration_id: r.id as string,
            /* Only the booker holds a club account. A guest is a name on a
               booking, so anything keyed on a user id must skip them. */
            user_id: g.is_booker ? (r.user.id as string) : null,
            name: g.name as string,
            kind: g.kind as string,
            is_booker: Boolean(g.is_booker),
            booked_by: r.user.name as string,
            role_at_event: r.role_at_event as string,
            status: r.status as string,
            admitted_at: (g.admitted_at ?? null) as Date | null,
        }));
    });
}

/**
 * One payload for the event-day screen: turnout, check-in progress, shift
 * coverage and checkpoint counts. A single request keeps the big-screen view
 * cheap to poll.
 */
router.get("/events/:id/dashboard", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = req.params.id as string;

        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        const [registrations, shifts, checkpoints] = await Promise.all([
            prisma.eventRegistration.findMany({
                where: { event_id: eventId },
                include: {
                    user: { select: { id: true, name: true } },
                    guests: { orderBy: [{ is_booker: "desc" }, { created_at: "asc" }] },
                },
                orderBy: { user: { name: "asc" } },
            }) as any,
            prisma.eventShift.findMany({
                where: { event_id: eventId },
                orderBy: [{ sort_order: "asc" }, { title: "asc" }],
                include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
            }) as any,
            prisma.checkpoint.findMany({
                where: { event_id: eventId },
                orderBy: [{ sort_order: "asc" }, { name: "asc" }],
                include: { splits: { select: { user_id: true, recorded_at: true } } },
            }) as any,
        ]);

        const attending = (registrations as any[]).filter((r) => !r.blocked_at);
        const attendingPeople = toPeople(attending);
        const expected = attendingPeople.filter((p) => p.status === "PAID" || p.status === "FREE");
        const checkedIn = expected.filter((p) => p.admitted_at);

        res.json({
            event: {
                id: event.id,
                title: event.title,
                date_time: event.date_time,
                location: event.location,
                status: event.status,
            },
            /*
             * Every figure counts people, not bookings.
             *
             * It used to count rows of EventRegistration, so two bookings
             * covering six people read as "2 registered, 2 checked in, 100%" —
             * and checked_in tested `attended_at`, which is set the moment the
             * first of a party arrives, so a family of four counted as fully
             * present when one of them had walked up. `bookings` is kept
             * alongside so the screen can still say how many QRs that is.
             */
            turnout: {
                registered: attendingPeople.length,
                expected: expected.length,
                checked_in: checkedIn.length,
                awaiting_payment: attendingPeople.filter((p) => p.status === "PENDING").length,
                blocked: toPeople((registrations as any[]).filter((r) => r.blocked_at)).length,
                // Everyone ticket-ready who has not scanned in yet.
                no_show: expected.length - checkedIn.length,
                bookings: attending.length,
                parties: attending.filter((r) => (r.guests?.length ?? 1) > 1).length,
            },
            // Most recent admissions first, for the live ticker.
            recent_check_ins: checkedIn
                .slice()
                .sort((a, b) => +new Date(b.admitted_at!) - +new Date(a.admitted_at!))
                .slice(0, 12)
                .map((p) => ({
                    guest_id: p.guest_id,
                    registration_id: p.registration_id,
                    /* Null for a guest. Checkpoint splits key on a user id and
                       a guest has no account, so handing the booker's id over
                       for them would file their split against the booker. */
                    user_id: p.user_id,
                    name: p.name,
                    kind: p.kind,
                    is_booker: p.is_booker,
                    booked_by: p.booked_by,
                    role_at_event: p.role_at_event,
                    attended_at: p.admitted_at,
                })),
            not_yet_in: expected
                .filter((p) => !p.admitted_at)
                .map((p) => ({
                    guest_id: p.guest_id,
                    registration_id: p.registration_id,
                    user_id: p.user_id,
                    name: p.name,
                    kind: p.kind,
                    is_booker: p.is_booker,
                    booked_by: p.booked_by,
                })),
            shifts: (shifts as any[]).map((s) => ({
                id: s.id,
                title: s.title,
                location_note: s.location_note,
                capacity: s.capacity,
                assigned: s.assignments.map((a: any) => ({
                    user_id: a.user.id,
                    name: a.user.name,
                })),
                // Drives the "needs cover" warning on the dashboard.
                open_slots: Math.max(0, s.capacity - s.assignments.length),
            })),
            checkpoints: (checkpoints as any[]).map((c) => ({
                id: c.id,
                name: c.name,
                distance_km: c.distance_km,
                passed: c.splits.length,
                last_at: c.splits.length
                    ? c.splits.map((s: any) => s.recorded_at).sort().slice(-1)[0]
                    : null,
            })),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to build the dashboard" });
    }
});

/* ── Volunteer shifts ─────────────────────────────────────── */

/** Shifts for an event, with who is on them. Crew-visible. */
router.get("/events/:id/shifts", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const shifts = (await prisma.eventShift.findMany({
            where: { event_id: req.params.id as string },
            orderBy: [{ sort_order: "asc" }, { title: "asc" }],
            include: {
                assignments: {
                    include: { user: { select: { id: true, name: true, role: true } } },
                },
            },
        })) as any;

        const me = req.user!.id;
        res.json(
            (shifts as any[]).map((s) => ({
                id: s.id,
                title: s.title,
                location_note: s.location_note,
                capacity: s.capacity,
                sort_order: s.sort_order,
                assigned: s.assignments.map((a: any) => ({
                    user_id: a.user.id,
                    name: a.user.name,
                    role: a.user.role,
                })),
                open_slots: Math.max(0, s.capacity - s.assignments.length),
                /** Lets the UI show "You're on this" without a second lookup. */
                mine: s.assignments.some((a: any) => a.user_id === me),
            }))
        );
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch shifts" });
    }
});

/** Create a marshal post (Admin only). */
router.post("/events/:id/shifts", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, location_note, capacity, sort_order } = req.body ?? {};
        if (!title?.trim()) {
            res.status(400).json({ error: "A shift title is required" });
            return;
        }

        const event = await prisma.event.findUnique({ where: { id: req.params.id as string } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        const shift = await prisma.eventShift.create({
            data: {
                event_id: event.id,
                title: title.trim(),
                location_note: location_note?.trim() || null,
                capacity: Math.max(1, Number.parseInt(capacity, 10) || 1),
                sort_order: Number.parseInt(sort_order, 10) || 0,
            },
        });

        res.status(211).json({ message: `"${shift.title}" added`, shift });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to create the shift" });
    }
});

router.delete("/shifts/:id", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const shift = await prisma.eventShift.findUnique({ where: { id: req.params.id as string } });
        if (!shift) {
            res.status(404).json({ error: "Shift not found" });
            return;
        }
        await prisma.eventShift.delete({ where: { id: shift.id } });
        res.json({ message: `"${shift.title}" removed` });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to remove the shift" });
    }
});

/**
 * Claim or release a shift.
 *
 * A volunteer may only move themselves; an admin may assign anyone, which is how
 * gaps get filled when nobody volunteers.
 */
router.post("/shifts/:id/claim", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const isAdmin = req.user!.role === "ADMIN";
        const targetUserId = isAdmin && req.body?.user_id ? String(req.body.user_id) : req.user!.id;

        const shift = (await prisma.eventShift.findUnique({
            where: { id: req.params.id as string },
            include: { assignments: true, event: true },
        })) as any;

        if (!shift) {
            res.status(404).json({ error: "Shift not found" });
            return;
        }

        if (shift.assignments.some((a: any) => a.user_id === targetUserId)) {
            res.json({ message: "Already on this shift", changed: false });
            return;
        }

        if (shift.assignments.length >= shift.capacity) {
            res.status(400).json({ error: `"${shift.title}" is already fully covered` });
            return;
        }

        await prisma.shiftAssignment.create({
            data: { shift_id: shift.id, user_id: targetUserId },
        });

        // Tell the person if an organiser put them on it.
        if (targetUserId !== req.user!.id) {
            await prisma.notification.create({
                data: {
                    user_id: targetUserId,
                    message: `You've been assigned to "${shift.title}" at ${shift.event.title}.`,
                },
            });
        }

        res.json({ message: `On "${shift.title}"`, changed: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not claim the shift" });
    }
});

router.post("/shifts/:id/release", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const isAdmin = req.user!.role === "ADMIN";
        const targetUserId = isAdmin && req.body?.user_id ? String(req.body.user_id) : req.user!.id;

        const existing = await prisma.shiftAssignment.findFirst({
            where: { shift_id: req.params.id as string, user_id: targetUserId },
        });
        if (!existing) {
            res.json({ message: "Not on this shift", changed: false });
            return;
        }

        await prisma.shiftAssignment.delete({ where: { id: existing.id } });
        res.json({ message: "Stepped off the shift", changed: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not release the shift" });
    }
});

/* ── Checkpoints & live tracking ──────────────────────────── */

router.get("/events/:id/checkpoints", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const checkpoints = (await prisma.checkpoint.findMany({
            where: { event_id: req.params.id as string },
            orderBy: [{ sort_order: "asc" }, { name: "asc" }],
            include: {
                splits: {
                    include: { user: { select: { id: true, name: true } } },
                    orderBy: { recorded_at: "desc" },
                },
            },
        })) as any;

        res.json(
            (checkpoints as any[]).map((c) => ({
                id: c.id,
                name: c.name,
                distance_km: c.distance_km,
                sort_order: c.sort_order,
                passed: c.splits.length,
                splits: c.splits.map((s: any) => ({
                    user_id: s.user.id,
                    name: s.user.name,
                    recorded_at: s.recorded_at,
                })),
            }))
        );
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch checkpoints" });
    }
});

router.post("/events/:id/checkpoints", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, distance_km, sort_order } = req.body ?? {};
        if (!name?.trim()) {
            res.status(400).json({ error: "A checkpoint name is required" });
            return;
        }
        const checkpoint = await prisma.checkpoint.create({
            data: {
                event_id: req.params.id as string,
                name: name.trim(),
                distance_km: distance_km === undefined ? null : Number.parseFloat(distance_km),
                sort_order: Number.parseInt(sort_order, 10) || 0,
            },
        });
        res.status(211).json({ message: `"${checkpoint.name}" added`, checkpoint });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to create the checkpoint" });
    }
});

router.delete("/checkpoints/:id", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await prisma.checkpoint.delete({ where: { id: req.params.id as string } });
        res.json({ message: "Checkpoint removed" });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to remove the checkpoint" });
    }
});

/**
 * Tap a runner through a checkpoint. Idempotent per (checkpoint, runner) — a
 * marshal tapping twice must not create a second split.
 */
router.post("/checkpoints/:id/pass", requireRole(CREW), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { user_id } = req.body ?? {};
        if (!user_id) {
            res.status(400).json({ error: "A user_id is required" });
            return;
        }

        const checkpoint = await prisma.checkpoint.findUnique({
            where: { id: req.params.id as string },
        });
        if (!checkpoint) {
            res.status(404).json({ error: "Checkpoint not found" });
            return;
        }

        try {
            const split = await prisma.checkpointSplit.create({
                data: {
                    checkpoint_id: checkpoint.id,
                    user_id: String(user_id),
                    recorded_by: req.user!.id,
                },
            });
            res.json({ message: "Recorded", split, changed: true });
        } catch {
            // Unique constraint — already tapped through here.
            res.json({ message: "Already recorded at this checkpoint", changed: false });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not record the split" });
    }
});

export default router;
