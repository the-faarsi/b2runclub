"use strict";
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
const events_router_1 = __importDefault(require("./routes/events.router"));
const payments_router_1 = __importDefault(require("./routes/payments.router"));
const forum_router_1 = __importDefault(require("./routes/forum.router"));
const polls_router_1 = __importDefault(require("./routes/polls.router"));
const admin_router_1 = __importDefault(require("./routes/admin.router"));
const strava_router_1 = __importDefault(require("./routes/strava.router"));
const content_router_1 = __importDefault(require("./routes/content.router"));
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
// Apply JWT authentication parser globally
app.use(auth_1.authenticateJWT);
// Register REST endpoints
app.use("/api/auth", auth_router_1.default);
app.use("/api/events", events_router_1.default);
app.use("/api/payments", payments_router_1.default);
app.use("/api/forum", forum_router_1.default);
app.use("/api/polls", polls_router_1.default);
app.use("/api/admin", admin_router_1.default);
app.use("/api/strava", strava_router_1.default);
app.use("/api/content", content_router_1.default);
app.use("/api/raceday", raceday_router_1.default);
app.use("/api/results", results_router_1.default);
app.use("/api/health", health_router_1.default);
app.use("/api/db", db_router_1.default);
// Serve uploaded gallery/logo images. Static and public by design — the files
// are club photos, and the URLs are unguessable (random filenames).
const path_1 = __importDefault(require("path"));
app.use("/uploads", express_1.default.static(path_1.default.resolve(process.cwd(), "uploads"), {
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
app.get("/api/events/registration/:id/ticket", async (req, res) => {
    try {
        const registrationId = req.params.id;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const reg = await prisma_1.default.eventRegistration.findUnique({
            where: { id: registrationId },
            include: { event: true, user: true },
        });
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
        // Send visual HTML representation
        res.setHeader("Content-Type", "text/html");
        res.send(`
      <html>
        <head>
          <title>Event Ticket - ${reg.event.title}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f7fafc; margin: 0; }
            .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 350px; }
            h2 { color: #2d3748; margin-top: 0; }
            .meta { color: #718096; margin-bottom: 20px; font-size: 14px; }
            img { border: 2px solid #edf2f7; border-radius: 8px; padding: 10px; margin-bottom: 20px; }
            .badge { background: #48bb78; color: white; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 12px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>${reg.event.title}</h2>
            <div class="meta">
              Admit One: <strong>${reg.user.name}</strong><br/>
              Role: ${reg.role_at_event}<br/>
              Date: ${reg.event.date_time.toLocaleDateString()}<br/>
              Location: ${reg.event.location}
            </div>
            <img src="${qrDataUrl}" alt="QR Ticket" />
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
// Port listener
if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`[Server] Run Club backend is running on http://localhost:${PORT}`);
        // Sweeps for due event reminders. Guarded out of the test env so the
        // integration suite never fires email as a side effect.
        (0, reminders_1.startReminderScheduler)();
    });
}
exports.default = app;
