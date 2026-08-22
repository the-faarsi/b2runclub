"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 1. Create Poll (Admin only)
router.post("/", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const { title, options } = req.body;
        if (!title || !options || !Array.isArray(options) || options.length < 2) {
            res.status(400).json({ error: "Poll title and at least two options are required" });
            return;
        }
        // Create poll and options in a transactional flow
        const poll = await prisma_1.default.poll.create({
            data: {
                title,
                options: {
                    create: options.map((opt) => ({ option_text: opt })),
                },
            },
            include: {
                options: true,
            },
        });
        res.status(211).json({ message: "Poll created successfully", poll });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to create poll" });
    }
});
// 2. Fetch Polls (Open to all, returns options and optionally if they already voted)
router.get("/", async (req, res) => {
    try {
        const userId = req.user?.id;
        // Fetch active polls with options and total vote counts
        const polls = await prisma_1.default.poll.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch polls" });
    }
});
// 3. Vote on Poll (Authenticated users, single-vote protection)
router.post("/:id/vote", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req, res) => {
    try {
        const pollId = req.params.id;
        const userId = req.user.id;
        const { option_id } = req.body;
        if (!option_id) {
            res.status(400).json({ error: "Option ID is required to cast a vote" });
            return;
        }
        // Check if the poll exists and is active
        const poll = await prisma_1.default.poll.findUnique({
            where: { id: pollId },
            include: { options: true },
        });
        if (!poll) {
            res.status(404).json({ error: "Poll not found" });
            return;
        }
        if (!poll.active) {
            res.status(400).json({ error: "This poll is no longer active" });
            return;
        }
        // Verify option belongs to this poll
        const optionExists = poll.options.some((opt) => opt.id === option_id);
        if (!optionExists) {
            res.status(400).json({ error: "Invalid option selected for this poll" });
            return;
        }
        try {
            // Create vote record. SQLite constraint key: @@unique([user_id, poll_id])
            const vote = await prisma_1.default.pollVote.create({
                data: {
                    poll_id: pollId,
                    option_id,
                    user_id: userId,
                },
            });
            res.status(211).json({ message: "Vote cast successfully", vote });
        }
        catch (dbError) {
            // Prisma error code for unique constraint violation: P2002
            if (dbError.code === "P2002") {
                res.status(400).json({ error: "You have already voted in this poll" });
                return;
            }
            throw dbError;
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to submit vote" });
    }
});
/**
 * 4. Close or reopen a poll (Admin only).
 *
 * `Poll.active` existed in the schema from the start but nothing could change it,
 * so a poll could never be closed. Voting checks `active`, so flipping this is
 * all that is needed to stop new votes while keeping results readable.
 */
router.put("/:id/active", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const { active } = req.body ?? {};
        if (typeof active !== "boolean") {
            res.status(400).json({ error: "`active` must be true or false" });
            return;
        }
        const poll = await prisma_1.default.poll.findUnique({ where: { id: req.params.id } });
        if (!poll) {
            res.status(404).json({ error: "Poll not found" });
            return;
        }
        if (poll.active === active) {
            res.json({ message: `Poll is already ${active ? "open" : "closed"}`, changed: false });
            return;
        }
        const updated = await prisma_1.default.poll.update({
            where: { id: poll.id },
            data: { active },
        });
        res.json({
            message: active ? "Poll reopened" : "Poll closed — no further votes",
            poll: updated,
            changed: true,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to update the poll" });
    }
});
exports.default = router;
