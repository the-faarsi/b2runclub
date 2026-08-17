import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

// 1. Link Strava Account (Authenticated users)
router.post("/link", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { strava_id } = req.body;

        if (!strava_id) {
            res.status(400).json({ error: "Strava ID is required" });
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { strava_id: String(strava_id) },
            select: { id: true, name: true, email: true, strava_id: true },
        });

        res.json({ message: "Strava account linked successfully", user: updatedUser });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to link Strava account" });
    }
});

// 2. Fetch Club Leaderboard
router.get("/leaderboard", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Get all users who have linked Strava accounts
        const athletes = await prisma.user.findMany({
            where: { strava_id: { not: null } },
            select: { id: true, name: true, strava_id: true },
        });

        // Mock Strava stats matching each user to construct leaderboard
        const leaderboard = athletes.map((athlete, index) => {
            // Seed values based on indices to produce deterministic yet diverse statistics
            const baseDistance = 15.5 + index * 12.3; // in km
            const baseRuns = 2 + (index % 3);
            const movingTimeMinutes = Math.round(baseDistance * (5.5 + (index % 2) * 0.5)); // 5.5 to 6 min/km pace

            const paceMinutes = Math.floor(movingTimeMinutes / baseDistance);
            const paceSeconds = Math.round(((movingTimeMinutes / baseDistance) - paceMinutes) * 60);
            const formattedPace = `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")} /km`;

            return {
                rank: 0, // Assigned after sorting
                user_id: athlete.id,
                name: athlete.name,
                strava_id: athlete.strava_id,
                weekly_distance_km: parseFloat(baseDistance.toFixed(2)),
                runs_count: baseRuns,
                moving_time_mins: movingTimeMinutes,
                avg_pace: formattedPace,
            };
        });

        // Sort descending by weekly distance
        leaderboard.sort((a, b) => b.weekly_distance_km - a.weekly_distance_km);

        // Apply ranks
        leaderboard.forEach((item, index) => {
            item.rank = index + 1;
        });

        res.json({
            club_name: "B Squared Run Club",
            leaderboard,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch leaderboard" });
    }
});

export default router;
