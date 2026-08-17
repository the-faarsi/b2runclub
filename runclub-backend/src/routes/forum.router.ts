import { Router, Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

// 1. Create Forum Post (Authenticated members, volunteers, and admins)
router.post("/posts", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, content, is_announcement } = req.body;
        const authorId = req.user!.id;
        const authorRole = req.user!.role;

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
        const post = await prisma.post.create({
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

        // If it's an admin announcement, broadcast notification alerts to all members and volunteers
        if (isAnnouncement) {
            const users = await prisma.user.findMany({
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
                await prisma.notification.createMany({
                    data: notificationData,
                });
            }
        }

        res.status(211).json({ message: "Post created successfully", post });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to create post" });
    }
});

// 2. Fetch Forum Posts (Public - visitors can view)
router.get("/posts", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Fetch all posts. Sort announcements first, then descending by created time
        const posts = await prisma.post.findMany({
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
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch posts" });
    }
});

// 3. Add Comment to Post (Authenticated users)
router.post("/posts/:id/comments", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const postId = req.params.id as string;
        const userId = req.user!.id;
        const { content } = req.body;

        if (!content) {
            res.status(400).json({ error: "Comment content cannot be empty" });
            return;
        }

        // Check if post exists
        const post = await prisma.post.findUnique({ where: { id: postId } });
        if (!post) {
            res.status(404).json({ error: "Post not found" });
            return;
        }

        const comment = await prisma.comment.create({
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
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to add comment" });
    }
});

// 4. Fetch personal notifications (Authenticated users only)
router.get("/notifications", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        const notifications = await prisma.notification.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });

        res.json(notifications);
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch notifications" });
    }
});

// 5. Mark Notification as Read
router.put("/notifications/:id/read", requireRole(["MEMBER", "VOLUNTEER", "ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notificationId = req.params.id as string;
        const userId = req.user!.id;

        const notification = await prisma.notification.findUnique({
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

        const updatedNotification = await prisma.notification.update({
            where: { id: notificationId },
            data: { is_read: true },
        });

        res.json({ message: "Notification marked as read", notification: updatedNotification });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to update notification" });
    }
});

export default router;
