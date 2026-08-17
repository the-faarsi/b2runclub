import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

// 1. Create Poll (Admin only)
router.post("/", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, options } = req.body;

        if (!title || !options || !Array.isArray(options) || options.length < 2) {
            res.status(400).json({ error: "Poll title and at least two options are required" });
            return;
        }

        // Create poll and options in a transactional flow
        const poll = await prisma.poll.create({
            data: {
                title,
                options: {
                    create: options.map((opt: string) => ({ option_text: opt })),
                },
            },
            include: {
                options: true,
            },
        });

        res.status(211).json({ message: "Poll created successfully", poll });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to create poll" });
    }
});

// 2. Fetch Polls (Open to all, returns options and optionally if they already voted)
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;

        // Fetch active polls with options and total vote counts
        const polls = await prisma.poll.findMany({
            where: { active: true },
            include: {
                options: {
                    include: {
                        _count: { select: { votes: true } },
                    },
                },
                votes: userId ? { where: { user_id: userId } } : false,
            },
        });

        // Format output mapping counts cleanly and flag user's choice
        const formattedPolls = polls.map((poll) => {
            const hasVoted = userId ? poll.votes.length > 0 : false;
            const userVoteOptionId = hasVoted ? poll.votes[0].option_id : null;

            return {
                id: poll.id,
                title: poll.title,
                active: poll.active,
                has_voted: hasVoted,
                user_voted_option_id: userVoteOptionId,
                options: poll.options.map((opt) => ({
                    id: opt.id,
                    option_text: opt.option_text,
                    vote_count: opt._count.votes,
                })),
            };
        });

        res.json(formattedPolls);
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch polls" });
    }
});

// 3. Vote on Poll (Authenticated users, single-vote protection)
router.post("/:id/vote", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const pollId = req.params.id as string;
        const userId = req.user!.id;
        const { option_id } = req.body;

        if (!option_id) {
            res.status(400).json({ error: "Option ID is required to cast a vote" });
            return;
        }

        // Check if the poll exists and is active
        const poll = await prisma.poll.findUnique({
            where: { id: pollId as string },
            include: { options: true },
        }) as any;

        if (!poll) {
            res.status(404).json({ error: "Poll not found" });
            return;
        }

        if (!poll.active) {
            res.status(400).json({ error: "This poll is no longer active" });
            return;
        }

        // Verify option belongs to this poll
        const optionExists = (poll as any).options.some((opt: any) => opt.id === option_id);
        if (!optionExists) {
            res.status(400).json({ error: "Invalid option selected for this poll" });
            return;
        }

        try {
            // Create vote record. SQLite constraint key: @@unique([user_id, poll_id])
            const vote = await prisma.pollVote.create({
                data: {
                    poll_id: pollId as string,
                    option_id,
                    user_id: userId,
                },
            });

            res.status(211).json({ message: "Vote cast successfully", vote });
        } catch (dbError: any) {
            // Prisma error code for unique constraint violation: P2002
            if (dbError.code === "P2002") {
                res.status(400).json({ error: "You have already voted in this poll" });
                return;
            }
            throw dbError;
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to submit vote" });
    }
});

export default router;
