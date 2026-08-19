import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";
import Razorpay from "razorpay";
import { ALLOWED_OFFSETS } from "../utils/reminders";
import {
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_MOCK_MODE,
} from "../utils/secrets";

const router = Router();

// Razorpay SDK setup. Both values are validated at startup; the placeholders are
// only here to satisfy the constructor when Razorpay is deliberately unconfigured,
// in which case isRazorpayMock short-circuits every call.
const razorpayKeyId = RAZORPAY_KEY_ID ?? "unconfigured";
const razorpay = new Razorpay({
    key_id: razorpayKeyId,
    key_secret: RAZORPAY_KEY_SECRET ?? "unconfigured",
});

const isRazorpayMock = RAZORPAY_MOCK_MODE;

/** Sentinel distinguishing "the caller sent something invalid" from "unlimited". */
export const INVALID = Symbol("invalid-capacity");

/**
 * Normalises a capacity value from a request body.
 *
 * Returns `undefined` when the field was omitted (leave it alone), `null` for an
 * explicit blank meaning unlimited, a positive integer, or INVALID.
 */
export function parseCapacity(raw: unknown): number | null | undefined | typeof INVALID {
    if (raw === undefined) return undefined;
    if (raw === null || raw === "") return null;

    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return INVALID;
    return n;
}

/**
 * Filter defining which registrations consume a place. Shared by the single-event
 * count and the grouped count used for lists, so the two can never disagree.
 *
 *  - A blocked entry frees its place: an organiser barring someone should open the
 *    spot back up.
 *  - FAILED covers failed and refunded payments, which likewise release it.
 *  - PENDING *does* hold a place, so a rush of half-finished checkouts cannot
 *    oversell the event.
 *  - Volunteers are excluded entirely. They are crew rather than participants and
 *    are exempt from the cap on registration, so counting them would let a marshal
 *    consume a runner's place — inconsistent with letting them past the check.
 */
// Not `as const`: Prisma's generated filter types take a mutable string[], so a
// readonly tuple is rejected.
export const SEAT_FILTER = {
    blocked_at: null,
    status: { in: ["PAID", "FREE", "PENDING"] },
    role_at_event: { not: "VOLUNTEER" },
};

/** How many participant places an event has given away. */
export async function seatsTaken(eventId: string): Promise<number> {
    return prisma.eventRegistration.count({
        where: { event_id: eventId, ...SEAT_FILTER },
    });
}

/** Capacity view for an event, safe to expose publicly. */
export async function capacityOf(event: { id: string; capacity: number | null }) {
    if (event.capacity === null) {
        return { capacity: null, taken: await seatsTaken(event.id), spots_left: null, full: false };
    }
    const taken = await seatsTaken(event.id);
    return {
        capacity: event.capacity,
        taken,
        spots_left: Math.max(0, event.capacity - taken),
        full: taken >= event.capacity,
    };
}

/**
 * Normalises a `reminder_offsets` payload into a validated, de-duplicated,
 * descending list of hours. Returns null when the caller omitted the field, so
 * an update can distinguish "leave alone" from "set to none".
 */
function parseOffsets(raw: any): number[] | null {
    if (raw === undefined) return null;
    if (!Array.isArray(raw)) return [];
    const cleaned = raw
        .map((v: any) => Number.parseInt(String(v), 10))
        .filter((n: number) => Number.isFinite(n) && ALLOWED_OFFSETS.includes(n));
    return [...new Set(cleaned)].sort((a, b) => b - a);
}

/** Replaces an event's reminders with exactly `offsets`. */
async function syncReminders(eventId: string, offsets: number[]) {
    const existing = await prisma.eventReminder.findMany({ where: { event_id: eventId } });
    const keep = new Set(offsets);

    // Removing a reminder drops its delivery log too (cascade), which is fine:
    // the reminder no longer exists, so there is nothing to be idempotent about.
    const toDelete = existing.filter((r: any) => !keep.has(r.hours_before));
    if (toDelete.length) {
        await prisma.eventReminder.deleteMany({
            where: { id: { in: toDelete.map((r: any) => r.id) } },
        });
    }

    const have = new Set(existing.map((r: any) => r.hours_before));
    const toCreate = offsets.filter((h) => !have.has(h));
    for (const hours_before of toCreate) {
        await prisma.eventReminder.create({ data: { event_id: eventId, hours_before } });
    }
}

// 1. Create Event (Admin only)
router.post("/", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, type, date_time, location, price, status, description, capacity } = req.body;
        const adminId = req.user!.id;

        if (!title || !type || !date_time || !location || price === undefined) {
            res.status(400).json({ error: "Missing required fields for event creation" });
            return;
        }

        const eventPrice = parseFloat(price);
        if (isNaN(eventPrice) || eventPrice < 0) {
            res.status(400).json({ error: "Invalid price value" });
            return;
        }

        const eventCapacity = parseCapacity(capacity);
        if (eventCapacity === INVALID) {
            res.status(400).json({ error: "Capacity must be a whole number of 1 or more, or blank for unlimited" });
            return;
        }

        const eventStatus = status || "DRAFT";
        if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(eventStatus)) {
            res.status(400).json({ error: "Invalid status value" });
            return;
        }

        const event = await prisma.event.create({
            data: {
                title,
                type,
                date_time: new Date(date_time),
                location,
                price: eventPrice,
                status: eventStatus,
                admin_id: adminId,
                description: description?.trim() || null,
                capacity: eventCapacity,
            },
        });

        const offsets = parseOffsets(req.body.reminder_offsets);
        if (offsets?.length) await syncReminders(event.id, offsets);

        res.status(211).json({
            message: "Event created successfully",
            event,
            reminder_offsets: offsets ?? [],
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to create event" });
    }
});

// 2. Get Events (Public & Auth role-restricted)
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userRole = req.user ? req.user.role : "VISITOR";

        let events;
        if (userRole === "ADMIN") {
            // Admins see all events (DRAFT, PUBLISHED, ARCHIVED)
            events = await prisma.event.findMany({
                orderBy: { date_time: "asc" },
            });
        } else {
            // Members, Volunteers, Visitors see only PUBLISHED (or ARCHIVED past events, but let's filters PUBLISHED for active)
            events = await prisma.event.findMany({
                where: { status: "PUBLISHED" },
                orderBy: { date_time: "asc" },
            });
        }

        /**
         * Attach capacity to every row so a list can show "3 spots left" or grey
         * out a full event without a request per card. One grouped count covers the
         * whole page rather than N queries.
         */
        const capped = events.filter((e) => e.capacity !== null);
        const counts = new Map<string, number>();

        if (capped.length > 0) {
            const grouped = await prisma.eventRegistration.groupBy({
                by: ["event_id"],
                where: { event_id: { in: capped.map((e) => e.id) }, ...SEAT_FILTER },
                _count: { _all: true },
            });
            for (const row of grouped) counts.set(row.event_id, row._count._all);
        }

        res.json(
            events.map((e) => {
                if (e.capacity === null) {
                    return { ...e, taken: null, spots_left: null, full: false };
                }
                const taken = counts.get(e.id) ?? 0;
                return {
                    ...e,
                    taken,
                    spots_left: Math.max(0, e.capacity - taken),
                    full: taken >= e.capacity,
                };
            }),
        );
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch events" });
    }
});

// 3. Get the signed-in user's own registrations (with event details).
// Registered before "/:id" for clarity; the ticket and roster routes only ever
// expose a single registration or an admin CSV, so this is the read the member
// UI needs to list its own tickets.
router.get(
    "/me/registrations",
    requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user!.id;

            const registrations = await prisma.eventRegistration.findMany({
                where: { user_id: userId },
                include: { event: true },
                orderBy: { event: { date_time: "desc" } },
            });

            res.json(registrations);
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to fetch registrations" });
        }
    }
);

/**
 * 3b. Cancel a registration — give up a spot on an event.
 *
 * A member may cancel their own registration while nothing has been captured
 * (PENDING or FREE). A PAID entry needs a refund, so only an admin can remove
 * it; admins may cancel on anyone's behalf. Blocked registrations are the
 * admin's to manage via the block endpoint.
 */
router.delete(
    "/registration/:id",
    requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const registrationId = req.params.id as string;
            const isAdmin = req.user!.role === "ADMIN";

            const registration = await prisma.eventRegistration.findUnique({
                where: { id: registrationId },
                include: { event: true },
            });

            if (!registration) {
                res.status(404).json({ error: "Registration not found" });
                return;
            }

            if (registration.user_id !== req.user!.id && !isAdmin) {
                res.status(403).json({ error: "You can only cancel your own registration" });
                return;
            }

            // Once the event has started there is nothing left to cancel, and
            // removing the row would rewrite attendance history.
            if (registration.event.date_time.getTime() <= Date.now()) {
                res.status(400).json({
                    error: "This event has already started — cancellation is no longer possible",
                });
                return;
            }

            if ((registration as any).blocked_at && !isAdmin) {
                res.status(403).json({
                    error: "An organiser has removed you from this event. Contact them for details.",
                });
                return;
            }

            if (registration.status === "PAID" && !isAdmin) {
                res.status(400).json({
                    error: "Paid entries need a refund — ask an organiser to cancel this for you.",
                });
                return;
            }

            await prisma.eventRegistration.delete({ where: { id: registrationId } });

            // An admin cancelling someone else's spot should tell them.
            if (isAdmin && registration.user_id !== req.user!.id) {
                await prisma.notification.create({
                    data: {
                        user_id: registration.user_id,
                        message: `An organiser cancelled your registration for "${registration.event.title}".`,
                    },
                });
            }

            res.json({
                message: `Registration for "${registration.event.title}" cancelled`,
                event_id: registration.event_id,
                refund_due: registration.status === "PAID",
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to cancel registration" });
        }
    }
);

// 4. Get Single Event
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const userRole = req.user ? req.user.role : "VISITOR";

        const event = await prisma.event.findUnique({
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

        res.json({ ...event, ...(await capacityOf(event)) });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch event" });
    }
});

// 4. Update Event (Admin only)
router.put("/:id", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { title, type, date_time, location, price, status, description, capacity } = req.body;

        const event = await prisma.event.findUnique({ where: { id } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        const dataToUpdate: any = {};
        if (title !== undefined) dataToUpdate.title = title;
        if (type !== undefined) dataToUpdate.type = type;
        if (date_time !== undefined) dataToUpdate.date_time = new Date(date_time);
        if (location !== undefined) dataToUpdate.location = location;
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
        if (description !== undefined) {
            dataToUpdate.description = description?.trim() || null;
        }
        if (capacity !== undefined) {
            const parsed = parseCapacity(capacity);
            if (parsed === INVALID) {
                res.status(400).json({
                    error: "Capacity must be a whole number of 1 or more, or blank for unlimited",
                });
                return;
            }

            /**
             * Refuse to set a cap below the number of places already given away.
             * Silently accepting it would leave the event over its own limit with
             * no way to reconcile — the organiser has to cancel entries first.
             */
            if (typeof parsed === "number") {
                const taken = await seatsTaken(id);
                if (parsed < taken) {
                    res.status(400).json({
                        error: `${taken} people already hold a place, so the cap can't be set to ${parsed}. Cancel some registrations first.`,
                        taken,
                    });
                    return;
                }
            }

            dataToUpdate.capacity = parsed;
        }

        const updatedEvent = await prisma.event.update({
            where: { id },
            data: dataToUpdate,
        });

        const offsets = parseOffsets(req.body.reminder_offsets);
        if (offsets !== null) await syncReminders(id, offsets);

        const reminders = await prisma.eventReminder.findMany({
            where: { event_id: id },
            orderBy: { hours_before: "desc" },
        });

        res.json({
            message: "Event updated successfully",
            event: updatedEvent,
            reminder_offsets: reminders.map((r: any) => r.hours_before),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to update event" });
    }
});

// 5. Delete Event (Admin only)
router.delete("/:id", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const event = await prisma.event.findUnique({ where: { id } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        // Cascade delete registrations first to maintain relational integrity
        await prisma.eventRegistration.deleteMany({ where: { event_id: id } });

        await prisma.event.delete({ where: { id } });

        res.json({ message: "Event deleted successfully" });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to delete event" });
    }
});

// 6. Register / Checkout Flow
router.post("/:id/register", requireRole(["MEMBER", "VOLUNTEER"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = req.params.id as string;
        const userId = req.user!.id;
        const userRole = req.user!.role;
        // `req.body` is undefined when a client posts with no JSON body at all;
        // destructuring it directly turned that into a 500 instead of the 400 the
        // waiver check below is meant to give.
        const { waiver_signed, emergency_contact } = req.body ?? {};

        // Check emergency contact is provided (from request or check database)
        const user = await prisma.user.findUnique({ where: { id: userId } });
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
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        if (event.status !== "PUBLISHED") {
            res.status(400).json({ error: "Registration is not open for this event" });
            return;
        }

        // Check if user is already registered for this event
        const existingRegistration = await prisma.eventRegistration.findFirst({
            where: { event_id: eventId, user_id: userId },
        });

        if (existingRegistration) {
            // A blocked row also lands here, which stops a barred member from
            // simply registering again — but it needs its own explanation.
            if ((existingRegistration as any).blocked_at) {
                res.status(403).json({
                    error: "An organiser has removed you from this event. Contact them for details.",
                });
                return;
            }

            res.status(400).json({
                error: "You are already registered for this event",
                registration: existingRegistration,
            });
            return;
        }

        /**
         * Capacity check, after the already-registered check so somebody who is
         * already on the list is never told the event is full.
         *
         * Volunteers are exempt: they are crew rather than participants, and a
         * full event still needs marshals. Blocking a marshal because the runner
         * places sold out would be the wrong outcome.
         */
        if (event.capacity !== null && userRole !== "VOLUNTEER") {
            const taken = await seatsTaken(eventId);
            if (taken >= event.capacity) {
                res.status(409).json({
                    error: "This event is full.",
                    full: true,
                    capacity: event.capacity,
                    taken,
                });
                return;
            }
        }

        // Update emergency contact on User model if provided in this request
        if (emergency_contact && emergency_contact !== user?.emergency_contact) {
            await prisma.user.update({
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
        } else if (event.price === 0) {
            paymentStatus = "FREE";
        }

        let razorpayOrderId: string | null = null;

        if (paymentStatus === "PENDING") {
            // Create Razorpay Order
            if (isRazorpayMock) {
                razorpayOrderId = `order_mock_${Math.random().toString(36).substring(2, 11)}`;
            } else {
                const orderOptions = {
                    amount: Math.round(event.price * 100), // In Indian Paisa
                    currency: "INR",
                    receipt: `event_registration_${Date.now()}`,
                    notes: {
                        eventId,
                        userId,
                    },
                };
                const order = await (razorpay.orders as any).create(orderOptions);
                razorpayOrderId = (order as any).id;
            }
        }

        // Create the registration record
        const registration = await prisma.eventRegistration.create({
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
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Registration failed" });
    }
});

export default router;
