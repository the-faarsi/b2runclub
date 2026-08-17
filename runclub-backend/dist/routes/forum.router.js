"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 1. Create Forum Post (Authenticated members, volunteers, and admins)
router.post("/posts", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req, res) => {
    try {
        const { title, content, is_announcement } = req.body;
        const authorId = req.user.id;
        const authorRole = req.user.role;
        if (!title || !content) {
            res.status(400).json({ error: "Title and content are required fields" });
            return;
        }
        const isAnnouncement = is_announcement === true;
        // Security check: only admins can post announcements
        if (isAnnouncement && authorRole !== "ADMIN") {
            res.status(403).json({ error: "Only admins can publish announcements" });
            return;
        }
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
            },
        });
        // If it's an admin announcement, broadcast notification alerts to all members and volunteers
        if (isAnnouncement) {
            const users = await prisma_1.default.user.findMany({
                where: {
                    role: { in: ["MEMBER", "VOLUNTEER"] },
                },
                select: { id: true },
            });
            // Create notification for each user
            const notificationData = users.map((user) => ({
                user_id: user.id,
                message: `New Announcement: "${title}" posted by Admin.`,
                link: `/api/forum/posts/${post.id}`,
            }));
            if (notificationData.length > 0) {
                await prisma_1.default.notification.createMany({
                    data: notificationData,
                });
            }
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
exports.default = router;
