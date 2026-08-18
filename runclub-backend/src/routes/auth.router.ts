import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma";
import crypto from "crypto";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { passwordResetEmail, sendMail } from "../utils/mailer";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "YourSuperSecretJWTString";

// Registration Endpoint
router.post("/register", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, name, role, emergency_contact } = req.body;

        if (!email || !password || !name) {
            res.status(400).json({ error: "Missing required fields: email, password, name" });
            return;
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ error: "A user with this email already exists" });
            return;
        }

        // Set role (default: MEMBER)
        const userRole = role || "MEMBER";
        if (!["ADMIN", "MEMBER", "VOLUNTEER", "VISITOR"].includes(userRole)) {
            res.status(400).json({ error: "Invalid role specified" });
            return;
        }

        const password_hash = hashPassword(password);

        const newUser = await prisma.user.create({
            data: {
                email,
                password_hash,
                name,
                role: userRole,
                emergency_contact: emergency_contact || null,
            },
        });

        res.status(211).json({
            message: "Registration successful",
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role,
                emergency_contact: newUser.emergency_contact,
                created_at: newUser.created_at,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Registration failed" });
    }
});

// Login Endpoint
router.post("/login", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: "Missing email or password" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !verifyPassword(password, user.password_hash)) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        // Generate JWT Token containing id, email, role
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                // Returned so a client can render profile state (Strava link,
                // emergency contact) without a separate lookup.
                emergency_contact: user.emergency_contact,
                strava_id: user.strava_id,
                created_at: user.created_at,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Login failed" });
    }
});

/* ── Password reset ───────────────────────────────────────────
 * Two steps: request a link, then redeem it.
 *
 * Only a SHA-256 hash of the token is stored, so a database leak cannot be used
 * to reset anyone's password — the raw token exists only in the emailed link.
 */

const RESET_TTL_MINUTES = 45;
const APP_URL = process.env.APP_URL || "http://localhost:5173";

const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

// 1. Request a reset link.
router.post("/forgot-password", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ error: "An email address is required" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { email: String(email).trim() } });

        // Always answer the same way. Diverging here would turn this into an
        // account-enumeration oracle: "no such user" tells an attacker which
        // addresses are registered.
        const genericResponse = {
            message: "If that address has an account, a reset link is on its way.",
        };

        if (!user) {
            res.json(genericResponse);
            return;
        }

        // Retire any outstanding tokens so only the newest link works.
        await prisma.passwordResetToken.updateMany({
            where: { user_id: user.id, used_at: null },
            data: { used_at: new Date() },
        });

        const raw = crypto.randomBytes(32).toString("hex");
        await prisma.passwordResetToken.create({
            data: {
                user_id: user.id,
                token_hash: hashToken(raw),
                expires_at: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
            },
        });

        const link = `${APP_URL}/reset-password?token=${raw}`;
        const mail = passwordResetEmail({
            name: user.name.split(" ")[0],
            link,
            minutes: RESET_TTL_MINUTES,
        });
        const sent = await sendMail({ ...mail, to: user.email });

        /**
         * Development affordance, mirroring /api/payments/simulate.
         *
         * With no SMTP configured the email is only written to the server log, so
         * the link is unreachable from the browser and the whole flow is
         * untestable. Returning it directly makes it usable locally.
         *
         * This deliberately breaks the identical-response property above, so it is
         * double-gated: the mailer must be unconfigured AND we must not be in
         * production. Configure SMTP (or set NODE_ENV=production) and the link
         * stops being returned, restoring the anti-enumeration behaviour.
         */
        if (sent.simulated && process.env.NODE_ENV !== "production") {
            res.json({ ...genericResponse, reset_link: link, simulated: true });
            return;
        }

        res.json(genericResponse);
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not start the reset" });
    }
});

// 2. Check a token before showing the form, so a dead link fails early.
router.get("/reset-password/:token", async (req: Request, res: Response): Promise<void> => {
    try {
        const record = await prisma.passwordResetToken.findUnique({
            where: { token_hash: hashToken(req.params.token as string) },
            include: { user: { select: { email: true, name: true } } },
        });

        const valid = Boolean(record && !record.used_at && record.expires_at > new Date());
        res.json({
            valid,
            // Safe to echo: the caller already holds the secret token.
            email: valid ? record!.user.email : null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not check the link" });
    }
});

// 3. Redeem the token and set the new password.
router.post("/reset-password", async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            res.status(400).json({ error: "A token and a new password are required" });
            return;
        }
        if (String(password).length < 8) {
            res.status(400).json({ error: "Use at least 8 characters for your password" });
            return;
        }

        const record = await prisma.passwordResetToken.findUnique({
            where: { token_hash: hashToken(String(token)) },
        });

        if (!record || record.used_at || record.expires_at <= new Date()) {
            res.status(400).json({ error: "That reset link is invalid or has expired" });
            return;
        }

        // Mark used before changing the password, so a double-submit cannot
        // redeem the same token twice.
        await prisma.passwordResetToken.update({
            where: { id: record.id },
            data: { used_at: new Date() },
        });

        await prisma.user.update({
            where: { id: record.user_id },
            data: { password_hash: hashPassword(String(password)) },
        });

        await prisma.notification.create({
            data: {
                user_id: record.user_id,
                message: "Your password was changed. If that wasn't you, contact an organiser.",
            },
        });

        res.json({ message: "Password updated — you can sign in now." });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Could not reset the password" });
    }
});

export default router;
