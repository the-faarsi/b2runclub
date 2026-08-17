import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

// 1. Financial Overview (Admin only)
router.get("/financial-overview", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Total revenue from PAID registrations
        const paidRegistrations = await prisma.eventRegistration.findMany({
            where: { status: "PAID" },
            include: { event: true },
        }) as any;

        const totalRevenue = (paidRegistrations as any[]).reduce((sum, reg) => sum + reg.event.price, 0);

        const pendingCounts = await prisma.eventRegistration.count({
            where: { status: "PENDING" },
        });

        const paidCounts = paidRegistrations.length;

        const failedCounts = await prisma.eventRegistration.count({
            where: { status: "FAILED" },
        });

        const freeCounts = await prisma.eventRegistration.count({
            where: { status: "FREE" },
        });

        res.json({
            total_revenue: totalRevenue,
            paid_count: paidCounts,
            pending_count: pendingCounts,
            failed_count: failedCounts,
            volunteer_free_count: freeCounts,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch financial overview" });
    }
});

// 2. Export Roster for an Event as CSV (Admin only)
router.get("/events/:id/roster/export", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = req.params.id as string;

        // Check event exists
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        const registrations = await prisma.eventRegistration.findMany({
            where: { event_id: eventId },
            include: { user: true },
            orderBy: { user: { name: "asc" } },
        }) as any;

        // Generate CSV contents
        const headers =
            "Registration ID,User Name,User Email,Event Role,Waiver Signed,Payment Status,Payment ID,Blocked\n";
        const rows = (registrations as any[])
            .map((reg) => {
                // Escape quotes to prevent CSV injection / parsing bugs
                const escapedName = `"${reg.user.name.replace(/"/g, '""')}"`;
                const escapedEmail = `"${reg.user.email.replace(/"/g, '""')}"`;
                const blocked = reg.blocked_at ? "YES" : "NO";
                return `${reg.id},${escapedName},${escapedEmail},${reg.role_at_event},${reg.waiver_signed},${reg.status},${reg.razorpay_payment_id || "N/A"},${blocked}`;
            })
            .join("\n");

        const csvContent = headers + rows;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=event_roster_${eventId}.csv`);
        res.status(200).send(csvContent);
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to export roster" });
    }
});

/**
 * 2b. Event roster as JSON (Admin only).
 *
 * The CSV export above is for accounting; this is the interactive view the event
 * page uses, so it carries the ids and block state the UI needs to act on.
 */
router.get("/events/:id/registrations", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = req.params.id as string;

        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        const registrations = await prisma.eventRegistration.findMany({
            where: { event_id: eventId },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { user: { name: "asc" } },
        }) as any;

        res.json(
            (registrations as any[]).map((r) => ({
                id: r.id,
                user_id: r.user_id,
                name: r.user.name,
                email: r.user.email,
                club_role: r.user.role,
                role_at_event: r.role_at_event,
                status: r.status,
                waiver_signed: r.waiver_signed,
                payment_id: r.razorpay_payment_id,
                blocked_at: r.blocked_at,
            }))
        );
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch registrations" });
    }
});

/**
 * 2c. Block or unblock a registration (Admin only).
 *
 * Blocking bars the person from the event without touching their payment
 * status: they lose their ticket, cannot re-register (the existing-registration
 * check catches the row), and unblocking restores everything as it was.
 */
router.put("/registrations/:id/block", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const registrationId = req.params.id as string;
        const { blocked } = req.body;

        if (typeof blocked !== "boolean") {
            res.status(400).json({ error: "`blocked` must be true or false" });
            return;
        }

        const registration = await prisma.eventRegistration.findUnique({
            where: { id: registrationId },
            include: { event: true, user: { select: { id: true, name: true } } },
        }) as any;

        if (!registration) {
            res.status(404).json({ error: "Registration not found" });
            return;
        }

        const alreadyBlocked = Boolean(registration.blocked_at);
        if (alreadyBlocked === blocked) {
            res.json({
                message: `${registration.user.name} is already ${blocked ? "blocked" : "allowed"}`,
                changed: false,
            });
            return;
        }

        const updated = await prisma.eventRegistration.update({
            where: { id: registrationId },
            data: { blocked_at: blocked ? new Date() : null },
        }) as any;

        await prisma.notification.create({
            data: {
                user_id: registration.user_id,
                message: blocked
                    ? `An organiser has removed you from "${registration.event.title}". Your ticket is no longer valid — contact them for details.`
                    : `You're back on the list for "${registration.event.title}". Your ticket is valid again.`,
            },
        });

        res.json({
            message: blocked
                ? `${registration.user.name} is blocked from ${registration.event.title}`
                : `${registration.user.name} can attend ${registration.event.title} again`,
            registration: {
                id: updated.id,
                status: updated.status,
                blocked_at: updated.blocked_at,
            },
            changed: true,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to update the block" });
    }
});

// 3. Member directory (Admin only)
// The club roster of people, as opposed to a single event's roster. Needed so an
// organiser can find someone before changing their role.
router.get("/members", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const members = await prisma.user.findMany({
            orderBy: [{ role: "asc" }, { name: "asc" }],
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                created_at: true,
                emergency_contact: true,
                strava_id: true,
                _count: { select: { registrations: true } },
            },
        }) as any;

        // Flatten the Prisma _count shape; never expose password_hash.
        res.json(
            (members as any[]).map((m) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                role: m.role,
                created_at: m.created_at,
                has_emergency_contact: Boolean(m.emergency_contact),
                strava_linked: Boolean(m.strava_id),
                registration_count: m._count.registrations,
            }))
        );
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch members" });
    }
});

/**
 * 4. Change a member's role (Admin only) — e.g. promoting a MEMBER to
 * VOLUNTEER, which comps their entry on future registrations.
 *
 * Deliberately cannot grant ADMIN: this is a member-management screen, and
 * handing out organiser rights from it would make privilege escalation a
 * one-click operation. Promote an organiser directly in the database instead.
 */
const ASSIGNABLE_ROLES = ["MEMBER", "VOLUNTEER", "VISITOR"];

router.put("/members/:id/role", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.params.id as string;
        const { role } = req.body;

        if (!role) {
            res.status(400).json({ error: "A role is required" });
            return;
        }

        if (!ASSIGNABLE_ROLES.includes(role)) {
            res.status(400).json({
                error: `Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}. Organiser rights cannot be granted here.`,
            });
            return;
        }

        // An admin changing their own role could lock the club out of its own
        // admin tools, so it is refused outright.
        if (userId === req.user!.id) {
            res.status(400).json({ error: "You cannot change your own role" });
            return;
        }

        const target = await prisma.user.findUnique({
            where: { id: userId },
            // Explicit select: findUnique would otherwise include password_hash,
            // and this object is echoed back in the response below.
            select: { id: true, name: true, email: true, role: true },
        });
        if (!target) {
            res.status(404).json({ error: "Member not found" });
            return;
        }

        if (target.role === "ADMIN") {
            res.status(403).json({ error: "Another organiser's role cannot be changed here" });
            return;
        }

        if (target.role === role) {
            res.json({
                message: `${target.name} is already a ${role.toLowerCase()}`,
                user: target,
                changed: false,
            });
            return;
        }

        const previousRole = target.role;

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { role },
            select: { id: true, name: true, email: true, role: true },
        });

        // Tell the person what changed, and what it means for them.
        const message =
            role === "VOLUNTEER"
                ? `You're now a club volunteer. Marshal an event and your entry is comped — future registrations are free.`
                : previousRole === "VOLUNTEER"
                  ? `Your club role is now ${role.toLowerCase()}. Volunteer comped entry no longer applies.`
                  : `Your club role is now ${role.toLowerCase()}.`;

        await prisma.notification.create({
            data: { user_id: userId, message },
        });

        res.json({
            message: `${updated.name} is now a ${role.toLowerCase()}`,
            user: updated,
            previous_role: previousRole,
            changed: true,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to change role" });
    }
});

// 5. Poll Analytics (Admin only)
router.get("/polls/:id/analytics", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const pollId = req.params.id as string;

        const poll = await prisma.poll.findUnique({
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
        const totalVotes = (poll as any).options.reduce((sum: number, opt: any) => sum + opt._count.votes, 0);

        const optionsAnalytics = (poll as any).options.map((opt: any) => {
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
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch poll analytics" });
    }
});

export default router;
