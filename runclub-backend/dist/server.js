"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = require("./middleware/auth");
// Load environment variables
dotenv_1.default.config();
// Initialize Express routers
const auth_router_1 = __importDefault(require("./routes/auth.router"));
const verify_router_1 = __importDefault(require("./routes/verify.router"));
const events_router_1 = __importDefault(require("./routes/events.router"));
const payments_router_1 = __importDefault(require("./routes/payments.router"));
const forum_router_1 = __importDefault(require("./routes/forum.router"));
const polls_router_1 = __importDefault(require("./routes/polls.router"));
const admin_router_1 = __importDefault(require("./routes/admin.router"));
const content_router_1 = __importStar(require("./routes/content.router"));
const raceday_router_1 = __importDefault(require("./routes/raceday.router"));
const results_router_1 = __importDefault(require("./routes/results.router"));
const health_router_1 = __importDefault(require("./routes/health.router"));
const db_router_1 = __importDefault(require("./routes/db.router"));
const reminders_1 = require("./utils/reminders");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// CORS configuration
app.use((0, cors_1.default)());
// Custom JSON body parser to capture req.rawBody for signature verification (e.g. Razorpay webhook)
app.use(express_1.default.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    },
}));
/**
 * Reminder sweep as an HTTP endpoint, for schedulers that cannot rely on an
 * in-process timer. On serverless the function is frozen the moment it responds,
 * so `setInterval` never fires again — a platform cron calling this is the only
 * thing that works there.
 *
 * Mounted ABOVE authenticateJWT deliberately. Vercel Cron authenticates with
 * `Authorization: Bearer $CRON_SECRET`, and the JWT parser would reject that as
 * a malformed token before this handler ever ran.
 *
 * Disabled rather than left open when CRON_SECRET is unset, since it sends real
 * email. `?key=` is accepted too, for schedulers that cannot set a header.
 */
app.all("/api/cron/reminders", async (req, res) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
        res.status(503).json({ error: "CRON_SECRET is not configured" });
        return;
    }
    const supplied = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
        (typeof req.query.key === "string" ? req.query.key : "");
    if (supplied !== secret) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const summary = await (0, reminders_1.sweepReminders)();
        res.json({ ok: true, ...summary });
    }
    catch (error) {
        console.error("[cron] sweep failed:", error?.message || error);
        res.status(500).json({ error: error?.message || "Sweep failed" });
    }
});
// Apply JWT authentication parser globally
app.use(auth_1.authenticateJWT);
// Register REST endpoints
app.use("/api/auth/verify", verify_router_1.default);
app.use("/api/auth", auth_router_1.default);
app.use("/api/events", events_router_1.default);
app.use("/api/payments", payments_router_1.default);
app.use("/api/forum", forum_router_1.default);
app.use("/api/polls", polls_router_1.default);
app.use("/api/admin", admin_router_1.default);
app.use("/api/content", content_router_1.default);
app.use("/api/raceday", raceday_router_1.default);
app.use("/api/results", results_router_1.default);
app.use("/api/health", health_router_1.default);
app.use("/api/db", db_router_1.default);
// Serve uploaded gallery/logo images. Static and public by design — the files
// are club photos, and the URLs are unguessable (random filenames).
// UPLOAD_DIR is imported rather than recomputed here: the writer and the reader
// must agree, and this copy used to hard-code process.cwd()/uploads while the
// router honoured the env override.
app.use("/uploads", express_1.default.static(content_router_1.UPLOAD_DIR, {
    maxAge: "7d",
    // Never execute anything out of the upload directory.
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
}));
// Basic health check route
app.get("/health", (req, res) => {
    res.json({ status: "healthy", database: "connected" });
});
// Ticket rendering endpoint (returns the generated base64 QR code ticket)
const prisma_1 = __importDefault(require("./utils/prisma"));
const qr_1 = require("./utils/qr");
/**
 * Escapes text bound for the ticket markup.
 *
 * Guest names are free text the member types when booking, and this route
 * answers with Content-Type: text/html at a URL members are linked to
 * directly, so an unescaped name would run as markup in their own browser.
 * The in-app view renders it in a sandbox="" iframe, which stops scripts
 * there but not here.
 */
const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
app.get("/api/events/registration/:id/ticket", async (req, res) => {
    try {
        const registrationId = req.params.id;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const reg = (await prisma_1.default.eventRegistration.findUnique({
            where: { id: registrationId },
            include: {
                event: true,
                user: true,
                // One QR covers the whole booking, so the ticket has to name
                // everyone it admits — otherwise the member holding it cannot
                // tell what they are presenting at the line.
                guests: { orderBy: [{ is_booker: "desc" }, { created_at: "asc" }] },
            },
        }));
        if (!reg) {
            res.status(404).json({ error: "Ticket not found" });
            return;
        }
        // Security: user can only view their own ticket unless admin
        if (reg.user_id !== userId && req.user.role !== "ADMIN") {
            res.status(403).json({ error: "Access denied to ticket" });
            return;
        }
        // A blocked registration keeps its PAID/FREE status on purpose, so the
        // block has to be checked separately or a barred member would still be
        // handed a scannable ticket.
        if (reg.blocked_at) {
            res.status(403).json({
                error: "An organiser has removed you from this event, so no ticket is available.",
            });
            return;
        }
        // Verify registration is valid
        if (reg.status !== "PAID" && reg.status !== "FREE") {
            res.status(400).json({ error: "Ticket is unavailable. Payment status: " + reg.status });
            return;
        }
        // Create Base64 QR code
        const qrDataUrl = await (0, qr_1.generateQRDataURL)({
            registrationId: reg.id,
            eventId: reg.event_id,
            userId: reg.user_id,
            userName: reg.user.name,
            eventTitle: reg.event.title,
        });
        /*
         * The party this QR admits. A booking made for three people is one
         * scannable code, so the face of the ticket lists all three by name —
         * the member has to be able to see what they are holding, and the
         * marshal reads the same names back off the scan.
         *
         * Falls back to the booker for a booking made before guest rows
         * existed, so an old ticket still renders.
         */
        const party = reg.guests?.length > 0
            ? reg.guests
            : [{ name: reg.user.name, kind: "ADULT", is_booker: true }];
        const partyRows = party
            .map((g) => `
              <li>
                <span>${esc(g.name)}</span>
                <span class="tag">${g.is_booker ? "booked this" : g.kind === "KID" ? "child" : "guest"}</span>
              </li>`)
            .join("");
        // Send visual HTML representation
        res.setHeader("Content-Type", "text/html");
        res.send(`
      <html>
        <head>
          <title>Event Ticket - ${esc(reg.event.title)}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; min-height: 100vh; background-color: #f7fafc; margin: 0; padding: 14px 0; box-sizing: border-box; }
            .card { background: white; padding: 22px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 350px; margin: auto; }
            h2 { color: #2d3748; margin: 0 0 14px; font-size: 21px; }
            .meta { color: #718096; margin: 0 0 12px; font-size: 13px; line-height: 1.5; }
            img { display: block; margin: 0 auto 14px; border: 2px solid #edf2f7; border-radius: 8px; padding: 8px; width: 214px; height: 214px; }
            .badge { background: #48bb78; color: white; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 12px; display: inline-block; }
            .admits { color: #4a5568; font-size: 12px; font-weight: bold; letter-spacing: .06em; text-transform: uppercase; margin: 0 0 7px; }
            ul.party { list-style: none; margin: 0 0 14px; padding: 0; text-align: left; border: 1px solid #edf2f7; border-radius: 8px; }
            ul.party li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 12px; font-size: 14px; color: #2d3748; border-bottom: 1px solid #edf2f7; }
            ul.party li:last-child { border-bottom: 0; }
            .tag { color: #718096; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
          </style>
        </head>
        <body>
          <!--
            The QR comes before the name list on purpose. The list grows with
            the party, and putting it above the code pushed the code off the
            bottom of the ticket — the one thing on here that has to be
            visible. Names below it, where a longer party scrolls instead.
          -->
          <div class="card">
            <h2>${esc(reg.event.title)}</h2>
            <img src="${qrDataUrl}" alt="QR Ticket" />
            <p class="admits">${party.length === 1 ? "Admits one" : `Admits ${party.length}`}</p>
            <ul class="party">${partyRows}</ul>
            <div class="meta">
              ${esc(reg.role_at_event)} · ${reg.event.date_time.toLocaleDateString()}<br/>
              ${esc(reg.event.location)}
            </div>
            <div>
              <span class="badge">TICKET CONFIRMED</span>
            </div>
          </div>
        </body>
      </html>
    `);
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to render ticket" });
    }
});
// Global error handler
app.use((err, req, res, next) => {
    console.error("System error:", err.stack);
    res.status(500).json({ error: "Internal server error" });
});
/**
 * Only a long-lived process listens on a port and runs the timer. Under a
 * serverless runtime the platform imports `app` and invokes it per request, so
 * calling listen() there would bind a port nothing routes to, and the interval
 * would be killed after the first response anyway.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (process.env.NODE_ENV !== "test" && !isServerless) {
    app.listen(PORT, () => {
        console.log(`[Server] Run Club backend is running on http://localhost:${PORT}`);
        // Sweeps for due event reminders. Guarded out of the test env so the
        // integration suite never fires email as a side effect.
        (0, reminders_1.startReminderScheduler)();
    });
}
exports.default = app;
