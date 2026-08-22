"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../middleware/auth");
const crypto_2 = require("../utils/crypto");
const mailer_1 = require("../utils/mailer");
const secrets_1 = require("../utils/secrets");
const router = (0, express_1.Router)();
// Registration Endpoint
router.post("/register", async (req, res) => {
    try {
        const { email, password, name, role, emergency_contact } = req.body;
        if (!email || !password || !name) {
            res.status(400).json({ error: "Missing required fields: email, password, name" });
            return;
        }
        // Check if user already exists
        const existingUser = await prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ error: "A user with this email already exists" });
            return;
        }
        /**
         * Roles a stranger may choose for themselves.
         *
         * This list used to include ADMIN and VOLUNTEER, which meant anyone who
         * could reach the endpoint could POST {"role":"ADMIN"} and immediately read
         * every member's emergency contact and the club's finances — no invitation,
         * no approval. VOLUNTEER was nearly as bad: it grants free entry to every
         * event, so it was a self-service discount.
         *
         * Both are now assigned only by an organiser, via
         * PUT /api/admin/members/:id/role.
         */
        const SELF_ASSIGNABLE = ["MEMBER", "VISITOR"];
        const userRole = role || "MEMBER";
        if (!SELF_ASSIGNABLE.includes(userRole)) {
            // Named explicitly rather than a generic "invalid": a legitimate client
            // sending VOLUNTEER deserves to know why, and naming it leaks nothing an
            // attacker couldn't infer from the signup form.
            const privileged = ["ADMIN", "VOLUNTEER"].includes(userRole);
            if (privileged) {
                console.warn(`[register] refused self-assignment of ${userRole} for ${String(email).slice(0, 60)}`);
            }
            res.status(400).json({
                error: privileged
                    ? `You can't sign up as ${userRole.toLowerCase()} — an organiser assigns that role.`
                    : "Invalid role specified",
            });
            return;
        }
        const password_hash = (0, crypto_2.hashPassword)(password);
        const newUser = await prisma_1.default.user.create({
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
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Registration failed" });
    }
});
// Login Endpoint
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Missing email or password" });
            return;
        }
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user || !(0, crypto_2.verifyPassword)(password, user.password_hash)) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        // Generate JWT Token containing id, email, role
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, secrets_1.JWT_SECRET, { expiresIn: "24h" });
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
    }
    catch (error) {
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
const hashToken = (raw) => crypto_1.default.createHash("sha256").update(raw).digest("hex");
// 1. Request a reset link.
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ error: "An email address is required" });
            return;
        }
        const user = await prisma_1.default.user.findUnique({ where: { email: String(email).trim() } });
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
        await prisma_1.default.passwordResetToken.updateMany({
            where: { user_id: user.id, used_at: null },
            data: { used_at: new Date() },
        });
        const raw = crypto_1.default.randomBytes(32).toString("hex");
        await prisma_1.default.passwordResetToken.create({
            data: {
                user_id: user.id,
                token_hash: hashToken(raw),
                expires_at: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
            },
        });
        const link = `${APP_URL}/reset-password?token=${raw}`;
        const mail = (0, mailer_1.passwordResetEmail)({
            name: user.name.split(" ")[0],
            link,
            minutes: RESET_TTL_MINUTES,
        });
        const sent = await (0, mailer_1.sendMail)({ ...mail, to: user.email });
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
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not start the reset" });
    }
});
// 2. Check a token before showing the form, so a dead link fails early.
router.get("/reset-password/:token", async (req, res) => {
    try {
        const record = await prisma_1.default.passwordResetToken.findUnique({
            where: { token_hash: hashToken(req.params.token) },
            include: { user: { select: { email: true, name: true } } },
        });
        const valid = Boolean(record && !record.used_at && record.expires_at > new Date());
        res.json({
            valid,
            // Safe to echo: the caller already holds the secret token.
            email: valid ? record.user.email : null,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not check the link" });
    }
});
// 3. Redeem the token and set the new password.
router.post("/reset-password", async (req, res) => {
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
        const record = await prisma_1.default.passwordResetToken.findUnique({
            where: { token_hash: hashToken(String(token)) },
        });
        if (!record || record.used_at || record.expires_at <= new Date()) {
            res.status(400).json({ error: "That reset link is invalid or has expired" });
            return;
        }
        // Mark used before changing the password, so a double-submit cannot
        // redeem the same token twice.
        await prisma_1.default.passwordResetToken.update({
            where: { id: record.id },
            data: { used_at: new Date() },
        });
        await prisma_1.default.user.update({
            where: { id: record.user_id },
            data: { password_hash: (0, crypto_2.hashPassword)(String(password)) },
        });
        await prisma_1.default.notification.create({
            data: {
                user_id: record.user_id,
                message: "Your password was changed. If that wasn't you, contact an organiser.",
            },
        });
        res.json({ message: "Password updated — you can sign in now." });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not reset the password" });
    }
});
/* ── The signed-in user's own account ─────────────────────────
 *
 * Before this existed there was no way to change your own name or email at all,
 * and an emergency contact could only be updated as a side effect of registering
 * for an event. Everything here is scoped to `req.user.id` — the id comes from the
 * verified token, never from the request body, so one member can never edit
 * another's account by passing an id.
 *
 * `role` is deliberately not editable here. Promotion stays an organiser action
 * on /api/admin/members/:id/role; accepting it from this body would let anyone
 * make themselves an admin.
 */
/** Shape used by login, so a client can swap one for the other. */
const publicUser = (u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    emergency_contact: u.emergency_contact,
    strava_id: u.strava_id,
    created_at: u.created_at,
});
/**
 * 1. Read your own account.
 *
 * The JWT carries a snapshot from sign-in time, so it goes stale the moment a
 * detail changes — or when an organiser changes your role. This is the
 * authoritative read.
 */
router.get("/me", auth_1.requireAccount, async (req, res) => {
    try {
        const user = await prisma_1.default.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            // The account was deleted while a valid token was still in hand.
            res.status(404).json({ error: "Account not found" });
            return;
        }
        res.json({ user: publicUser(user) });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not load your account" });
    }
});
/** 2. Edit the details that carry no security weight. */
router.patch("/me", auth_1.requireAccount, async (req, res) => {
    try {
        const { name, emergency_contact } = req.body ?? {};
        const data = {};
        if (name !== undefined) {
            const trimmed = String(name).trim();
            if (trimmed.length < 2) {
                res.status(400).json({ error: "Your name needs at least 2 characters" });
                return;
            }
            if (trimmed.length > 80) {
                res.status(400).json({ error: "That name is too long (80 characters max)" });
                return;
            }
            data.name = trimmed;
        }
        if (emergency_contact !== undefined) {
            const trimmed = String(emergency_contact).trim();
            // Explicitly clearable — someone may want it removed.
            if (trimmed === "") {
                data.emergency_contact = null;
            }
            else if (trimmed.length < 6) {
                res.status(400).json({ error: "That doesn't look like a contact number" });
                return;
            }
            else {
                data.emergency_contact = trimmed;
            }
        }
        if (Object.keys(data).length === 0) {
            res.status(400).json({ error: "Nothing to update" });
            return;
        }
        const updated = await prisma_1.default.user.update({ where: { id: req.user.id }, data });
        res.json({ message: "Profile updated", user: publicUser(updated) });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not save your profile" });
    }
});
/**
 * 3. Change your email.
 *
 * Separate from PATCH /me and gated on the current password: the email *is* the
 * login identity, so letting it change on a merely-valid token would turn a
 * borrowed session into a full account takeover.
 */
router.patch("/me/email", auth_1.requireAccount, async (req, res) => {
    try {
        const { email, current_password } = req.body ?? {};
        if (!email || !current_password) {
            res.status(400).json({ error: "Both the new email and your current password are required" });
            return;
        }
        const next = String(email).trim().toLowerCase();
        // Deliberately loose: a stricter pattern rejects valid addresses, and the
        // real proof of ownership would be a confirmation email.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
            res.status(400).json({ error: "That doesn't look like a valid email address" });
            return;
        }
        const user = await prisma_1.default.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            res.status(404).json({ error: "Account not found" });
            return;
        }
        if (!(0, crypto_2.verifyPassword)(String(current_password), user.password_hash)) {
            res.status(403).json({ error: "That password isn't right" });
            return;
        }
        if (next === user.email.toLowerCase()) {
            res.json({ message: "That's already your email", user: publicUser(user), changed: false });
            return;
        }
        const taken = await prisma_1.default.user.findUnique({ where: { email: next } });
        if (taken) {
            res.status(409).json({ error: "Another account already uses that email" });
            return;
        }
        const updated = await prisma_1.default.user.update({
            where: { id: user.id },
            data: { email: next },
        });
        await prisma_1.default.notification.create({
            data: {
                user_id: user.id,
                message: `Your sign-in email was changed to ${next}. If that wasn't you, contact an organiser.`,
            },
        });
        /**
         * The old token still carries the previous email in its payload. Nothing
         * authorises off that field — `requireRole` reads the role and every query
         * keys on the id — but the client should replace its cached user, and the
         * member must use the new address next time they sign in.
         */
        res.json({
            message: "Email updated — use it next time you sign in",
            user: publicUser(updated),
            changed: true,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not change your email" });
    }
});
/** 4. Change your password while signed in, without the email round-trip. */
router.post("/me/password", auth_1.requireAccount, async (req, res) => {
    try {
        const { current_password, password } = req.body ?? {};
        if (!current_password || !password) {
            res.status(400).json({ error: "Both your current and new password are required" });
            return;
        }
        if (String(password).length < 8) {
            res.status(400).json({ error: "Use at least 8 characters for the new password" });
            return;
        }
        const user = await prisma_1.default.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            res.status(404).json({ error: "Account not found" });
            return;
        }
        if (!(0, crypto_2.verifyPassword)(String(current_password), user.password_hash)) {
            res.status(403).json({ error: "Your current password isn't right" });
            return;
        }
        if ((0, crypto_2.verifyPassword)(String(password), user.password_hash)) {
            res.status(400).json({ error: "That's already your password — pick a different one" });
            return;
        }
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: { password_hash: (0, crypto_2.hashPassword)(String(password)) },
        });
        // Retire any outstanding reset links: a password change should make an
        // email someone requested earlier useless.
        await prisma_1.default.passwordResetToken.updateMany({
            where: { user_id: user.id, used_at: null },
            data: { used_at: new Date() },
        });
        await prisma_1.default.notification.create({
            data: {
                user_id: user.id,
                message: "Your password was changed. If that wasn't you, contact an organiser.",
            },
        });
        /**
         * Tokens are stateless, so sessions on other devices stay valid until they
         * expire (24h). Revoking them would need a token version on the user or a
         * server-side session store.
         */
        res.json({ message: "Password changed" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not change your password" });
    }
});
exports.default = router;
