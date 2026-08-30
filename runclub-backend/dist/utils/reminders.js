"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_OFFSETS = void 0;
exports.sweepReminders = sweepReminders;
exports.startReminderScheduler = startReminderScheduler;
exports.stopReminderScheduler = stopReminderScheduler;
const prisma_1 = __importDefault(require("./prisma"));
const mailer_1 = require("./mailer");
/**
 * Reminder sweeper.
 *
 * Runs on an interval and emails registrants whose reminder window has opened.
 *
 * Rules, chosen so behaviour is predictable rather than clever:
 *  - only PUBLISHED events that have not started yet,
 *  - a reminder is due once `now >= start - hours_before`, and stays due until
 *    the event starts. That means a server that was offline still delivers late
 *    rather than skipping, which is the friendlier failure,
 *  - blocked registrations are excluded — they are not attending,
 *  - FAILED payments are excluded; PENDING are included, since the nudge is
 *    partly the point,
 *  - a unique (reminder_id, user_id) row is written per send, so a restart, an
 *    overlapping sweep or a manual run can never double-send.
 */
const APP_URL = process.env.APP_URL || "http://localhost:5173";
/** Offsets an organiser may choose, in hours. */
exports.ALLOWED_OFFSETS = [168, 72, 48, 24, 12, 4, 2, 1];
function formatWhen(date) {
    return new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}
/**
 * Sends any reminders that are currently due.
 * `eventId` limits the sweep to one event, used by the manual admin trigger.
 */
async function sweepReminders(eventId) {
    const now = new Date();
    const summary = {
        checked: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        simulated: false,
    };
    const reminders = (await prisma_1.default.eventReminder.findMany({
        where: {
            ...(eventId ? { event_id: eventId } : {}),
            event: { status: "PUBLISHED", date_time: { gt: now } },
        },
        include: {
            event: true,
            deliveries: { select: { user_id: true } },
        },
    }));
    for (const reminder of reminders) {
        const start = new Date(reminder.event.date_time);
        const dueAt = new Date(start.getTime() - reminder.hours_before * 3600_000);
        summary.checked++;
        if (now < dueAt) {
            summary.skipped++;
            continue;
        }
        const alreadySent = new Set(reminder.deliveries.map((d) => d.user_id));
        const registrations = (await prisma_1.default.eventRegistration.findMany({
            where: {
                event_id: reminder.event_id,
                blocked_at: null,
                status: { in: ["PAID", "FREE", "PENDING"] },
            },
            include: { user: { select: { id: true, name: true, email: true } } },
        }));
        for (const reg of registrations) {
            if (alreadySent.has(reg.user_id)) {
                summary.skipped++;
                continue;
            }
            const ticketReady = reg.status === "PAID" || reg.status === "FREE";
            const template = (0, mailer_1.reminderEmail)({
                name: reg.user.name.split(" ")[0],
                eventTitle: reminder.event.title,
                when: formatWhen(start),
                location: reminder.event.location,
                hoursBefore: reminder.hours_before,
                ticketReady,
                amountDue: ticketReady ? null : `₹${reminder.event.price}`,
                ticketUrl: `${APP_URL}/tickets`,
            });
            const result = await (0, mailer_1.sendMail)({ ...template, to: reg.user.email });
            if (result.simulated)
                summary.simulated = true;
            try {
                // Written whether or not the send worked, so a permanent failure
                // is not retried forever on every sweep. `status` records which.
                await prisma_1.default.reminderDelivery.create({
                    data: {
                        reminder_id: reminder.id,
                        user_id: reg.user_id,
                        status: result.ok ? "SENT" : "FAILED",
                        error: result.error ?? null,
                    },
                });
            }
            catch {
                // Unique constraint tripped — another sweep got there first.
                summary.skipped++;
                continue;
            }
            if (result.ok) {
                summary.sent++;
                // Mirror it in-app so the bell agrees with the inbox.
                await prisma_1.default.notification.create({
                    data: {
                        user_id: reg.user_id,
                        message: `Reminder: "${reminder.event.title}" starts ${formatWhen(start)}.`,
                        link: `/api/events/registration/${reg.id}/ticket`,
                    },
                });
            }
            else {
                summary.failed++;
            }
        }
    }
    return summary;
}
let timer = null;
/**
 * Starts the interval sweeper. A single in-process timer is the right weight for
 * one server; a multi-instance deployment would need a shared lock or a real job
 * queue so instances do not race (the unique constraint would keep it correct,
 * just noisy).
 */
function startReminderScheduler(intervalMs = 60_000) {
    if (timer)
        return;
    const tick = async () => {
        try {
            const s = await sweepReminders();
            if (s.sent || s.failed) {
                console.log(`[reminders] sent=${s.sent} failed=${s.failed} skipped=${s.skipped}` +
                    (s.simulated ? " (logged only — SMTP not configured)" : ""));
            }
        }
        catch (error) {
            console.error("[reminders] sweep failed:", error?.message || error);
        }
    };
    // A short first run so a freshly added reminder fires promptly.
    setTimeout(tick, 5_000);
    timer = setInterval(tick, intervalMs);
    console.log(`[reminders] scheduler started (every ${Math.round(intervalMs / 1000)}s)`);
}
function stopReminderScheduler() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
