import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

/* ── Results ──────────────────────────────────────────────── */

/** Formats seconds as h:mm:ss / m:ss, the way a results sheet reads. */
function formatTime(secs: number | null) {
    if (secs === null) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
}

function pacePerKm(secs: number | null, km: number | null) {
    if (!secs || !km || km <= 0) return null;
    const per = Math.round(secs / km);
    return `${Math.floor(per / 60)}:${String(per % 60).padStart(2, "0")} /km`;
}

/**
 * Results for an event — public, because a results sheet is the point.
 * Positions are computed from finish time rather than stored, so they stay
 * correct when a time is corrected after the fact.
 */
router.get("/events/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = req.params.id as string;

        const [event, rows] = await Promise.all([
            prisma.event.findUnique({ where: { id: eventId } }),
            prisma.eventResult.findMany({
                where: { event_id: eventId },
                include: { user: { select: { id: true, name: true } } },
            }) as any,
        ]);

        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        const finishers = (rows as any[])
            .filter((r) => r.status === "FINISHED" && r.finish_secs)
            .sort((a, b) => a.finish_secs - b.finish_secs);

        const others = (rows as any[]).filter(
            (r) => r.status !== "FINISHED" || !r.finish_secs
        );

        const winner = finishers[0]?.finish_secs ?? null;

        res.json({
            event: { id: event.id, title: event.title, date_time: event.date_time },
            finisher_count: finishers.length,
            results: [
                ...finishers.map((r, i) => ({
                    id: r.id,
                    position: i + 1,
                    user_id: r.user.id,
                    name: r.user.name,
                    finish_secs: r.finish_secs,
                    finish_time: formatTime(r.finish_secs),
                    distance_km: r.distance_km ?? event.route_distance_km ?? null,
                    pace: pacePerKm(r.finish_secs, r.distance_km ?? event.route_distance_km ?? null),
                    // Gap to the winner, the number people actually look for.
                    behind_secs: winner ? r.finish_secs - winner : 0,
                    status: r.status,
                    notes: r.notes,
                })),
                ...others.map((r) => ({
                    id: r.id,
                    position: null,
                    user_id: r.user.id,
                    name: r.user.name,
                    finish_secs: null,
                    finish_time: null,
                    distance_km: r.distance_km,
                    pace: null,
                    behind_secs: null,
                    status: r.status,
                    notes: r.notes,
                })),
            ],
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch results" });
    }
});

/**
 * Record or amend a result (Admin only). Upsert keyed on (event, user), so
 * re-submitting a corrected time updates rather than duplicating.
 */
router.put("/events/:id", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = req.params.id as string;
        const { user_id, finish_secs, distance_km, status, notes } = req.body ?? {};

        if (!user_id) {
            res.status(400).json({ error: "A user_id is required" });
            return;
        }

        const finalStatus = status || "FINISHED";
        if (!["FINISHED", "DNF", "DNS"].includes(finalStatus)) {
            res.status(400).json({ error: "Status must be FINISHED, DNF or DNS" });
            return;
        }

        const secs =
            finish_secs === undefined || finish_secs === null || finish_secs === ""
                ? null
                : Number.parseInt(String(finish_secs), 10);

        if (finalStatus === "FINISHED" && (!secs || secs <= 0)) {
            res.status(400).json({ error: "A finisher needs a positive finish time" });
            return;
        }

        const result = await prisma.eventResult.upsert({
            where: { event_id_user_id: { event_id: eventId, user_id: String(user_id) } },
            update: {
                finish_secs: secs,
                distance_km: distance_km === undefined ? undefined : Number.parseFloat(distance_km),
                status: finalStatus,
                notes: notes?.trim() || null,
            },
            create: {
                event_id: eventId,
                user_id: String(user_id),
                finish_secs: secs,
                distance_km:
                    distance_km === undefined || distance_km === ""
                        ? null
                        : Number.parseFloat(distance_km),
                status: finalStatus,
                notes: notes?.trim() || null,
            },
        });

        res.json({ message: "Result saved", result });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to save the result" });
    }
});

router.delete("/:resultId", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await prisma.eventResult.delete({ where: { id: req.params.resultId as string } });
        res.json({ message: "Result removed" });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to remove the result" });
    }
});

/** A member's own results across every event, newest first. */
router.get("/me", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rows = (await prisma.eventResult.findMany({
            where: { user_id: req.user!.id },
            include: { event: true },
            orderBy: { event: { date_time: "desc" } },
        })) as any;

        const finished = (rows as any[]).filter((r) => r.status === "FINISHED" && r.finish_secs);

        res.json({
            results: (rows as any[]).map((r) => ({
                id: r.id,
                event_id: r.event_id,
                event_title: r.event.title,
                event_date: r.event.date_time,
                finish_secs: r.finish_secs,
                finish_time: formatTime(r.finish_secs),
                distance_km: r.distance_km ?? r.event.route_distance_km ?? null,
                pace: pacePerKm(r.finish_secs, r.distance_km ?? r.event.route_distance_km ?? null),
                status: r.status,
            })),
            totals: {
                events_finished: finished.length,
                total_distance_km: Number(
                    finished
                        .reduce((sum, r) => sum + (r.distance_km ?? r.event.route_distance_km ?? 0), 0)
                        .toFixed(1)
                ),
                total_secs: finished.reduce((sum, r) => sum + r.finish_secs, 0),
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch your results" });
    }
});

/* ── Feedback survey ──────────────────────────────────────── */

/** Submit or update feedback. One response per person per event. */
router.post("/feedback/:eventId", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = req.params.eventId as string;
        const rating = Number.parseInt(String(req.body?.rating), 10);

        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            res.status(400).json({ error: "Give a rating between 1 and 5" });
            return;
        }

        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }

        // Feedback is about a session that happened.
        if (event.date_time.getTime() > Date.now()) {
            res.status(400).json({ error: "This event hasn't happened yet" });
            return;
        }

        // Only people who were actually registered may rate it.
        const reg = await prisma.eventRegistration.findFirst({
            where: { event_id: eventId, user_id: req.user!.id },
        });
        if (!reg && req.user!.role !== "ADMIN") {
            res.status(403).json({ error: "You weren't registered for this event" });
            return;
        }

        const feedback = await prisma.eventFeedback.upsert({
            where: { event_id_user_id: { event_id: eventId, user_id: req.user!.id } },
            update: { rating, comment: req.body?.comment?.trim() || null },
            create: {
                event_id: eventId,
                user_id: req.user!.id,
                rating,
                comment: req.body?.comment?.trim() || null,
            },
        });

        res.json({ message: "Thanks — that helps.", feedback });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not save your feedback" });
    }
});

/** Whether the current user still owes feedback, for prompting them. */
router.get("/feedback/me/:eventId", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const mine = await prisma.eventFeedback.findFirst({
            where: { event_id: req.params.eventId as string, user_id: req.user!.id },
        });
        res.json({ submitted: Boolean(mine), rating: mine?.rating ?? null, comment: mine?.comment ?? null });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to check your feedback" });
    }
});

/** Aggregated feedback for an event (Admin only) — ratings plus comments. */
router.get("/feedback/:eventId", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rows = (await prisma.eventFeedback.findMany({
            where: { event_id: req.params.eventId as string },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { created_at: "desc" },
        })) as any;

        const ratings = (rows as any[]).map((r) => r.rating);
        const average =
            ratings.length > 0
                ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
                : null;

        res.json({
            count: rows.length,
            average,
            // Bar chart data: how many gave each score.
            distribution: [1, 2, 3, 4, 5].map((score) => ({
                score,
                count: ratings.filter((r) => r === score).length,
            })),
            responses: (rows as any[]).map((r) => ({
                id: r.id,
                name: r.user.name,
                rating: r.rating,
                comment: r.comment,
                created_at: r.created_at,
            })),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch feedback" });
    }
});

/* ── Streaks & badges ─────────────────────────────────────── */

interface Badge {
    key: string;
    label: string;
    detail: string;
    earned: boolean;
}

/**
 * Attendance streaks and badges, computed from check-ins rather than stored.
 *
 * Derived on read so a corrected check-in immediately fixes the badge — a cached
 * award table would drift the moment an organiser undid a scan.
 */
router.get("/streaks/me", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const regs = (await prisma.eventRegistration.findMany({
            where: { user_id: req.user!.id, attended_at: { not: null } },
            include: { event: true },
        })) as any;

        const attended = (regs as any[])
            .map((r) => ({ at: new Date(r.event.date_time), title: r.event.title }))
            .sort((a, b) => +a.at - +b.at);

        // A "week" is an ISO-ish bucket: consecutive attended weeks make a streak.
        const weekKey = (d: Date) => {
            const t = new Date(d);
            t.setHours(0, 0, 0, 0);
            // Shift to Monday of that week.
            t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
            return t.getTime();
        };
        const WEEK = 7 * 86400_000;

        const weeks = [...new Set(attended.map((a) => weekKey(a.at)))].sort((a, b) => a - b);

        let best = 0;
        let run = 0;
        let current = 0;
        for (let i = 0; i < weeks.length; i++) {
            run = i > 0 && weeks[i] - weeks[i - 1] === WEEK ? run + 1 : 1;
            best = Math.max(best, run);
        }
        // The streak is only "current" if it includes this week or last week —
        // otherwise it has lapsed.
        if (weeks.length) {
            const thisWeek = weekKey(new Date());
            const last = weeks[weeks.length - 1];
            if (last === thisWeek || last === thisWeek - WEEK) current = run;
        }

        const total = attended.length;
        const volunteered = (regs as any[]).filter((r) => r.role_at_event === "VOLUNTEER").length;

        const badges: Badge[] = [
            { key: "first-run", label: "First run", detail: "Turned up once", earned: total >= 1 },
            { key: "regular", label: "Regular", detail: "5 sessions attended", earned: total >= 5 },
            { key: "committed", label: "Committed", detail: "15 sessions attended", earned: total >= 15 },
            { key: "century", label: "Half century", detail: "50 sessions attended", earned: total >= 50 },
            { key: "streak-3", label: "Three in a row", detail: "3 consecutive weeks", earned: best >= 3 },
            { key: "streak-8", label: "Two months solid", detail: "8 consecutive weeks", earned: best >= 8 },
            { key: "marshal", label: "Marshal", detail: "Volunteered at a session", earned: volunteered >= 1 },
            { key: "marshal-5", label: "Backbone", detail: "Marshalled 5 sessions", earned: volunteered >= 5 },
        ];

        res.json({
            attended_count: total,
            volunteered_count: volunteered,
            current_streak_weeks: current,
            best_streak_weeks: best,
            last_attended: attended.length ? attended[attended.length - 1] : null,
            badges,
            earned_count: badges.filter((b) => b.earned).length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to work out your streak" });
    }
});

export default router;
