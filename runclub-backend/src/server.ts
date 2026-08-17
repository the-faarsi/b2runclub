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
import stravaRouter from "./routes/strava.router";
import contentRouter from "./routes/content.router";

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

// Apply JWT authentication parser globally
app.use(authenticateJWT);

// Register REST endpoints
app.use("/api/auth", authRouter);
app.use("/api/events", eventsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/forum", forumRouter);
app.use("/api/polls", pollsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/strava", stravaRouter);
app.use("/api/content", contentRouter);

// Serve uploaded gallery/logo images. Static and public by design — the files
// are club photos, and the URLs are unguessable (random filenames).
import path from "path";
app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), "uploads"), {
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

// Port listener
if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`[Server] Run Club backend is running on http://localhost:${PORT}`);
    });
}

export default app;
