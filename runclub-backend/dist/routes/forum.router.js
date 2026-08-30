"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 1. Create Forum Post (organisers only)
//
// The forum runs as a broadcast channel: organisers publish, everyone else
// replies. Comments stay open to MEMBER and VOLUNTEER on POST /posts/:id/comments,
// so members still have a voice — they just cannot start a thread.
router.post("/posts", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const { title, content, is_announcement } = req.body ?? {};
        const authorId = req.user.id;
        if (!title || !content) {
            res.status(400).json({ error: "Title and content are required fields" });
            return;
        }
        // Only organisers reach this route, so the flag needs no role check of
        // its own — it now only controls whether the post pins to the top.
        const isAnnouncement = is_announcement === true;
        // Create the post
        const post = await prisma_1.default.post.create({
            data: {
                title,
                content,
                is_announcement: isAnnouncement,
                author_id: authorId,
            },
            include: {
                author: {
                    select: { id: true, name: true, role: true },
                },
                // Included so a created post has the same shape as one from
                // GET /posts. Without it `comments` is undefined and a client
                // rendering the reply count on the new post crashes.
                comments: {
                    orderBy: { created_at: "asc" },
                    include: {
                        user: { select: { id: true, name: true, role: true } },
                    },
                },
            },
        });
        // Every post here is an organiser broadcast, so every post notifies the
        // club — not just the pinned ones. Previously this fired only when
        // `is_announcement` was set, which left ordinary organiser posts silent.
        const users = await prisma_1.default.user.findMany({
            where: {
                role: { in: ["MEMBER", "VOLUNTEER"] },
            },
            select: { id: true },
        });
        const notificationData = users.map((user) => ({
            user_id: user.id,
            message: isAnnouncement
                ? `New announcement: "${title}"`
                : `New post from the organisers: "${title}"`,
            link: `/api/forum/posts/${post.id}`,
        }));
        if (notificationData.length > 0) {
            await prisma_1.default.notification.createMany({
                data: notificationData,
            });
        }
        res.status(211).json({ message: "Post created successfully", post });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to create post" });
    }
});
// 2. Fetch Forum Posts (Public - visitors can view)
router.get("/posts", async (req, res) => {
    try {
        // Fetch all posts. Sort announcements first, then descending by created time
        const posts = await prisma_1.default.post.findMany({
            orderBy: [
                { is_announcement: "desc" },
                { created_at: "desc" },
            ],
            include: {
                author: {
                    select: { id: true, name: true, role: true },
                },
                comments: {
                    orderBy: { created_at: "asc" },
                    include: {
                        user: {
                            select: { id: true, name: true, role: true },
                        },
                    },
                },
            },
        });
        res.json(posts);
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch posts" });
    }
});
// 3. Add Comment to Post (Authenticated users)
router.post("/posts/:id/comments", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        const { content } = req.body;
        if (!content) {
            res.status(400).json({ error: "Comment content cannot be empty" });
            return;
        }
        // Check if post exists
        const post = await prisma_1.default.post.findUnique({ where: { id: postId } });
        if (!post) {
            res.status(404).json({ error: "Post not found" });
            return;
        }
        const comment = await prisma_1.default.comment.create({
            data: {
                post_id: postId,
                user_id: userId,
                content,
            },
            include: {
                user: {
                    select: { id: true, name: true, role: true },
                },
            },
        });
        res.status(211).json({ message: "Comment added successfully", comment });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to add comment" });
    }
});
// 4. Fetch personal notifications (Authenticated users only)
router.get("/notifications", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = await prisma_1.default.notification.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });
        res.json(notifications);
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch notifications" });
    }
});
// 5. Mark Notification as Read
router.put("/notifications/:id/read", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;
        const notification = await prisma_1.default.notification.findUnique({
            where: { id: notificationId },
        });
        if (!notification) {
            res.status(404).json({ error: "Notification not found" });
            return;
        }
        if (notification.user_id !== userId) {
            res.status(403).json({ error: "Access denied to notification" });
            return;
        }
        const updatedNotification = await prisma_1.default.notification.update({
            where: { id: notificationId },
            data: { is_read: true },
        });
        res.json({ message: "Notification marked as read", notification: updatedNotification });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to update notification" });
    }
});
/**
 * 6. Moderation (Admin only).
 *
 * There was previously no way to remove anything from the forum. An author may
 * also delete their own contribution — the usual expectation — but only an admin
 * can remove someone else's.
 */
router.delete("/posts/:id", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req, res) => {
    try {
        const post = await prisma_1.default.post.findUnique({ where: { id: req.params.id } });
        if (!post) {
            res.status(404).json({ error: "Post not found" });
            return;
        }
        const isAdmin = req.user.role === "ADMIN";
        if (post.author_id !== req.user.id && !isAdmin) {
            res.status(403).json({ error: "You can only delete your own posts" });
            return;
        }
        // Comments have no cascade in the schema, so clear them first or the
        // delete fails on the foreign key.
        await prisma_1.default.comment.deleteMany({ where: { post_id: post.id } });
        await prisma_1.default.post.delete({ where: { id: post.id } });
        // Tell the author when a moderator removed their post.
        if (isAdmin && post.author_id !== req.user.id) {
            await prisma_1.default.notification.create({
                data: {
                    user_id: post.author_id,
                    message: `An organiser removed your post "${post.title}".`,
                },
            });
        }
        res.json({ message: "Post removed" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to remove the post" });
    }
});
router.delete("/comments/:id", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req, res) => {
    try {
        const comment = await prisma_1.default.comment.findUnique({ where: { id: req.params.id } });
        if (!comment) {
            res.status(404).json({ error: "Comment not found" });
            return;
        }
        if (comment.user_id !== req.user.id && req.user.role !== "ADMIN") {
            res.status(403).json({ error: "You can only delete your own comments" });
            return;
        }
        await prisma_1.default.comment.delete({ where: { id: comment.id } });
        res.json({ message: "Comment removed" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to remove the comment" });
    }
});
exports.default = router;
