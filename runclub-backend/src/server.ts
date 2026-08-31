import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authenticateJWT } from "./middleware/auth";

// Load environment variables
dotenv.config();

// Initialize Express routers
import authRouter from "./routes/auth.router";
import eventsRouter from "./routes/events.router";
import paymentsRouter from "./routes/payments.router";
import forumRouter from "./routes/forum.router";
import pollsRouter from "./routes/polls.router";
import adminRouter from "./routes/admin.router";
import contentRouter, { UPLOAD_DIR } from "./routes/content.router";
import racedayRouter from "./routes/raceday.router";
import resultsRouter from "./routes/results.router";
import healthRouter from "./routes/health.router";
import dbRouter from "./routes/db.router";
import { startReminderScheduler, sweepReminders } from "./utils/reminders";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors());

// Custom JSON body parser to capture req.rawBody for signature verification (e.g. Razorpay webhook)
app.use(
    express.json({
        verify: (req: any, res, buf) => {
            req.rawBody = buf.toString();
        },
    })
);

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
    const supplied =
        req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
        (typeof req.query.key === "string" ? req.query.key : "");
    if (supplied !== secret) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const summary = await sweepReminders();
        res.json({ ok: true, ...summary });
    } catch (error: any) {
        console.error("[cron] sweep failed:", error?.message || error);
        res.status(500).json({ error: error?.message || "Sweep failed" });
    }
});

// Apply JWT authentication parser globally
app.use(authenticateJWT);

// Register REST endpoints
app.use("/api/auth", authRouter);
app.use("/api/events", eventsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/forum", forumRouter);
app.use("/api/polls", pollsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/content", contentRouter);
app.use("/api/raceday", racedayRouter);
app.use("/api/results", resultsRouter);
app.use("/api/health", healthRouter);
app.use("/api/db", dbRouter);

// Serve uploaded gallery/logo images. Static and public by design — the files
// are club photos, and the URLs are unguessable (random filenames).
// UPLOAD_DIR is imported rather than recomputed here: the writer and the reader
// must agree, and this copy used to hard-code process.cwd()/uploads while the
// router honoured the env override.
app.use(
    "/uploads",
    express.static(UPLOAD_DIR, {
        maxAge: "7d",
        // Never execute anything out of the upload directory.
        setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    })
);

// Basic health check route
app.get("/health", (req, res) => {
    res.json({ status: "healthy", database: "connected" });
});

// Ticket rendering endpoint (returns the generated base64 QR code ticket)
import prisma from "./utils/prisma";
import { generateQRDataURL } from "./utils/qr";

app.get("/api/events/registration/:id/ticket", async (req: any, res: any): Promise<void> => {
    try {
        const registrationId = req.params.id;
        const userId = req.user?.id;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const reg = await prisma.eventRegistration.findUnique({
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
        if ((reg as any).blocked_at) {
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
        const qrDataUrl = await generateQRDataURL({
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
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to render ticket" });
    }
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
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
        startReminderScheduler();
    });
}

export default app;
