"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = __importDefault(require("./server"));
const prisma_1 = __importDefault(require("./utils/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const secrets_1 = require("./utils/secrets");
const PORT = 3333;
const BASE_URL = `http://localhost:${PORT}`;
/**
 * Read through the same validated module the server uses. Signing with a literal
 * fallback would make the webhook test use a different secret than the server
 * verifies with, so it would fail for a reason unrelated to the code under test.
 */
const webhookSecret = secrets_1.RAZORPAY_WEBHOOK_SECRET ?? "";
const webhooksTestable = webhookSecret.length > 0;
async function runTests() {
    console.log("=== STARTING RUN CLUB BACKEND INTEGRATION TESTS ===");
    // Start server
    const server = await new Promise((resolve) => {
        const s = server_1.default.listen(PORT, () => {
            console.log(`[Test Server] Launched on ${BASE_URL}`);
            resolve(s);
        });
    });
    let errorOccurred = false;
    try {
        // 1. Reset database
        console.log("\n[1/10] Resetting and cleaning database...");
        await prisma_1.default.notification.deleteMany();
        await prisma_1.default.comment.deleteMany();
        await prisma_1.default.post.deleteMany();
        await prisma_1.default.pollVote.deleteMany();
        await prisma_1.default.pollOption.deleteMany();
        await prisma_1.default.poll.deleteMany();
        await prisma_1.default.eventRegistration.deleteMany();
        await prisma_1.default.event.deleteMany();
        await prisma_1.default.user.deleteMany();
        console.log("Database cleaned successfully.");
        // 2. Register users
        console.log("\n[2/10] Registering Admin, Member, and Volunteer...");
        const adminReg = await fetch(`${BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "admin@runclub.com",
                password: "adminpassword",
                name: "Admin Alice",
                role: "ADMIN",
            }),
        });
        const adminRegData = (await adminReg.json());
        console.log("Admin Register Status:", adminReg.status, adminRegData.message);
        const memberReg = await fetch(`${BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "member@runclub.com",
                password: "memberpassword",
                name: "Member Bob",
                role: "MEMBER",
                emergency_contact: "+91 99999 88888",
            }),
        });
        const memberRegData = (await memberReg.json());
        console.log("Member Register Status:", memberReg.status, memberRegData.message);
        const volunteerReg = await fetch(`${BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "volunteer@runclub.com",
                password: "volunteerpassword",
                name: "Volunteer Charlie",
                role: "VOLUNTEER",
                emergency_contact: "+91 77777 66666",
            }),
        });
        const volunteerRegData = (await volunteerReg.json());
        console.log("Volunteer Register Status:", volunteerReg.status, volunteerRegData.message);
        // 3. Login Users
        console.log("\n[3/10] Logging in users and capturing tokens...");
        const adminLog = await fetch(`${BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@runclub.com", password: "adminpassword" }),
        });
        const adminToken = (await adminLog.json()).token;
        const memberLog = await fetch(`${BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "member@runclub.com", password: "memberpassword" }),
        });
        const memberToken = (await memberLog.json()).token;
        const volunteerLog = await fetch(`${BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "volunteer@runclub.com", password: "volunteerpassword" }),
        });
        const volunteerToken = (await volunteerLog.json()).token;
        console.log("Tokens fetched successfully. Validating Access Controls...");
        // 4. Create and View Events (RBAC Check)
        console.log("\n[4/10] Testing Event CRUD and Role Permissions...");
        // Member tries to create event (should be blocked)
        const badEventRes = await fetch(`${BASE_URL}/api/events`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberToken}`,
            },
            body: JSON.stringify({
                title: "Forbidden Distance Run",
                type: "Run",
                date_time: new Date(),
                location: "Stadium",
                price: 15.0,
            }),
        });
        console.log("Member trying to create event (RBAC test):", badEventRes.status, "(Expected: 403)");
        if (badEventRes.status !== 403)
            throw new Error("RBAC failed: Member were not forbidden");
        // Admin creates draft event
        const draftEventRes = await fetch(`${BASE_URL}/api/events`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                title: "Saturday Trail Run",
                type: "Run",
                date_time: new Date(Date.now() + 100000000),
                location: "Hillside Trail",
                price: 50.0,
                status: "DRAFT",
            }),
        });
        const draftEvent = (await draftEventRes.json()).event;
        console.log("Admin created draft event:", draftEvent.title, `(ID: ${draftEvent.id})`);
        // Admin creates published event
        const pubEventRes = await fetch(`${BASE_URL}/api/events`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                title: "Spring Marathon 2026",
                type: "Run",
                date_time: new Date(Date.now() + 200000000),
                location: "Central Park",
                price: 250.0,
                status: "PUBLISHED",
            }),
        });
        const pubEvent = (await pubEventRes.json()).event;
        console.log("Admin created published event:", pubEvent.title, `(ID: ${pubEvent.id})`);
        // Public gets events (only published should appear)
        const pubListRes = await fetch(`${BASE_URL}/api/events`);
        const pubList = (await pubListRes.json());
        console.log("Public visible events count:", pubList.length, "(Expected: 1)");
        if (pubList.some((e) => e.status !== "PUBLISHED"))
            throw new Error("Public got unpublished events");
        // 5. Try Event Registration
        console.log("\n[5/10] Registering for Events (Waiver, Payment status)...");
        // Register without signing waiver (fail)
        const badReg = await fetch(`${BASE_URL}/api/events/${pubEvent.id}/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberToken}`,
            },
            body: JSON.stringify({ waiver_signed: false }),
        });
        console.log("Registering without waiver sign status:", badReg.status, "(Expected: 400)");
        if (badReg.status !== 400)
            throw new Error("Allowed registration without signing waiver");
        // Registrations for Member (produces order_id)
        const memberRegRes = await fetch(`${BASE_URL}/api/events/${pubEvent.id}/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberToken}`,
            },
            body: JSON.stringify({ waiver_signed: true, emergency_contact: "+91 99999 88888" }),
        });
        const memberRegDetails = (await memberRegRes.json());
        console.log("Member registration status:", memberRegRes.status, `(Payment status: ${memberRegDetails.registration.status}, Order ID: ${memberRegDetails.registration.razorpay_order_id})`);
        // Volunteer registers (marks FREE)
        const volRegRes = await fetch(`${BASE_URL}/api/events/${pubEvent.id}/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${volunteerToken}`,
            },
            body: JSON.stringify({ waiver_signed: true, emergency_contact: "+91 77777 66666" }),
        });
        const volRegDetails = (await volRegRes.json());
        console.log("Volunteer registration status:", volRegRes.status, `(Payment status: ${volRegDetails.registration.status})`);
        // 6. Payments Callback (Webhook Verification)
        console.log("\n[6/10] Triggering Razorpay webhook payment confirmation...");
        const orderId = memberRegDetails.registration.razorpay_order_id;
        const webhookPayload = JSON.stringify({
            event: "order.paid",
            payload: {
                payment: {
                    entity: {
                        id: "pay_xyz987654321",
                        order_id: orderId,
                        amount: 25000,
                    },
                },
            },
        });
        const signature = crypto_1.default
            .createHmac("sha256", webhookSecret)
            .update(webhookPayload)
            .digest("hex");
        const webhookRes = await fetch(`${BASE_URL}/api/payments/webhook`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-razorpay-signature": signature,
            },
            body: webhookPayload,
        });
        console.log("Webhook confirmation API status:", webhookRes.status, "(Expected: 200)");
        // Check payment updated in database
        const regCheck = await prisma_1.default.eventRegistration.findUnique({
            where: { id: memberRegDetails.registration.id }
        });
        console.log("Post-webhook payment registration status in DB:", regCheck?.status, "(Expected: PAID)");
        if (regCheck?.status !== "PAID")
            throw new Error("Webhook signature execution failed to update status to PAID");
        // 7. Get ticket HTML output
        console.log("\n[7/10] Fetching dynamic QR ticketing page...");
        const ticketRes = await fetch(`${BASE_URL}/api/events/registration/${memberRegDetails.registration.id}/ticket`, {
            headers: { Authorization: `Bearer ${memberToken}` },
        });
        console.log("Ticket view check status:", ticketRes.status, "(Expected: 200)");
        const ticketHtml = await ticketRes.text();
        if (!ticketHtml.includes("TICKET CONFIRMED") || !ticketHtml.includes("data:image/png;base64")) {
            throw new Error("QR Ticket page validation failed");
        }
        console.log("Ticket contains validation stamps and base64 QR code image.");
        // 8. Forum and Community Alerts
        console.log("\n[8/10] Testing Forum & Community (Announcements, comments, notifications)...");
        // Admin creates announcement
        const announceRes = await fetch(`${BASE_URL}/api/forum/posts`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                title: "Emergency Hydration Notice",
                content: "Please carry extra water for tomorrow's run due to heat index.",
                is_announcement: true,
            }),
        });
        const announceData = (await announceRes.json());
        console.log("Admin announcement POST status:", announceRes.status, "(Expected: 211)");
        // Member checks notifications
        const memberNotifyRes = await fetch(`${BASE_URL}/api/forum/notifications`, {
            headers: { Authorization: `Bearer ${memberToken}` },
        });
        const notifications = (await memberNotifyRes.json());
        console.log("Member notifications count received:", notifications.length, "(Expected: 2)");
        const announceNotify = notifications.find((n) => n.message.includes("Hydration"));
        if (!announceNotify)
            throw new Error("Notification broadcast failed to reach member");
        // Mark notification as read
        const markReadRes = await fetch(`${BASE_URL}/api/forum/notifications/${announceNotify.id}/read`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${memberToken}` },
        });
        console.log("Mark notification read status:", markReadRes.status, "(Expected: 200)");
        // Member adds comment to post
        const commentRes = await fetch(`${BASE_URL}/api/forum/posts/${announceData.post.id}/comments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberToken}`,
            },
            body: JSON.stringify({ content: "Thanks for the heads up, will do!" }),
        });
        console.log("Member comment post status:", commentRes.status, "(Expected: 211)");
        // 9. Polling Engine
        console.log("\n[9/10] Evaluating Polling Engine (single vote assertion)...");
        const pollRes = await fetch(`${BASE_URL}/api/polls`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                title: "Preferred Run Time?",
                options: ["6:00 AM", "7:00 AM", "6:00 PM"],
            }),
        });
        const poll = (await pollRes.json()).poll;
        console.log("Admin created poll:", poll.title, `(ID: ${poll.id})`);
        // Member votes
        const optId = poll.options[0].id;
        const vote1 = await fetch(`${BASE_URL}/api/polls/${poll.id}/vote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberToken}`,
            },
            body: JSON.stringify({ option_id: optId }),
        });
        console.log("Member voted status:", vote1.status, "(Expected: 211)");
        // Member votes again (should be blocked)
        const vote2 = await fetch(`${BASE_URL}/api/polls/${poll.id}/vote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberToken}`,
            },
            body: JSON.stringify({ option_id: optId }),
        });
        console.log("Member double-vote status:", vote2.status, "(Expected: 400)");
        const vote2Data = (await vote2.json());
        console.log("Double vote error message:", vote2Data.error);
        if (vote2.status !== 400)
            throw new Error("Unique composite constraint bypassed: voted twice");
        // 10. Admin Dashboard
        console.log("\n[10/10] Fetching Admin Dashboard metrics & CSV Roster Export...");
        const overviewRes = await fetch(`${BASE_URL}/api/admin/financial-overview`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const overview = (await overviewRes.json());
        console.log("Revenue Collected:", overview.total_revenue, "INR. Paid count:", overview.paid_count);
        if (overview.total_revenue !== 250.0)
            throw new Error("Revenue calculations are incorrect");
        const rosterRes = await fetch(`${BASE_URL}/api/admin/events/${pubEvent.id}/roster/export`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        console.log("Roster CSV export response headers Content-Type:", rosterRes.headers.get("content-type"));
        const csvContent = await rosterRes.text();
        console.log("Roster Export Content preview:\n", csvContent.trim());
        if (!csvContent.includes("Registration ID") || !csvContent.includes("member@runclub.com") || !csvContent.includes("volunteer@runclub.com")) {
            throw new Error("Roster CSV generation was invalid");
        }
        // Strava Leaderboard Check
        console.log("\n[Bonus] Verifying Strava integration framework & leaderboard...");
        await fetch(`${BASE_URL}/api/strava/link`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberToken}`,
            },
            body: JSON.stringify({ strava_id: "bob_run123" }),
        });
        const boardRes = await fetch(`${BASE_URL}/api/strava/leaderboard`);
        const boardData = (await boardRes.json());
        console.log("Strava Leaderboard ranking count:", boardData.leaderboard.length);
        console.log("Top Run Club Athlete:", boardData.leaderboard[0].name, `${boardData.leaderboard[0].weekly_distance_km} km`);
        console.log("\n>>> ALL TEST CASES PASSED SUCCESSFULLY CLIENT-SIDE! <<<");
    }
    catch (err) {
        console.error("\nTEST SUITE CRITICAL FAILURE:", err);
        errorOccurred = true;
    }
    finally {
        // Shutdown server
        server.close(() => {
            console.log("\n[Test Server] Terminated.");
            process.exit(errorOccurred ? 1 : 0);
        });
    }
}
runTests();
