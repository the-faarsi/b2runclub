import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";
import { getAthleteStats } from "../utils/strava";

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
router.get("/leaderboard", async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Shared with the admin member directory so both report the same figures.
        const leaderboard = await getAthleteStats();
        res.json({ club_name: "B Squared Run Club", leaderboard });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch leaderboard" });
    }
});

export default router;
