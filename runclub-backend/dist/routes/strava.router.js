"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const strava_1 = require("../utils/strava");
const stravaOauth_1 = require("../utils/stravaOauth");
const router = (0, express_1.Router)();
/**
 * Strava linking, via OAuth.
 *
 * This used to be `POST /link` taking a `strava_id` string, which accepted any
 * text at all — "not an id at all" was a valid input — wrote it to the user and
 * reported "linked successfully". Nothing was ever connected. The athlete id is
 * now established by Strava itself during the token exchange, so it cannot be
 * wrong or invented.
 */
/** 1. Whether the flow is available, so the UI can explain itself. */
router.get("/config", async (_req, res) => {
    res.json({
        configured: stravaOauth_1.stravaConfigured,
        redirect_uri: stravaOauth_1.REDIRECT_URI,
        /** Named so an organiser knows exactly what to set. */
        missing: stravaOauth_1.stravaConfigured ? [] : ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"],
    });
});
/**
 * 2. Begin linking. Returns the URL rather than redirecting, because the caller
 * is a fetch from the SPA — a 302 here would be followed by fetch and the
 * browser would never navigate.
 */
router.get("/authorize", auth_1.requireAccount, async (req, res) => {
    try {
        if (!stravaOauth_1.stravaConfigured) {
            res.status(503).json({
                error: "Strava isn't configured on this server yet. An organiser needs to add the API credentials.",
                configured: false,
            });
            return;
        }
        res.json({ url: (0, stravaOauth_1.authorizeUrl)(req.user.id) });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not start Strava linking" });
    }
});
/**
 * 3. Strava sends the browser here.
 *
 * Deliberately unauthenticated: this is a top-level navigation from strava.com and
 * carries no Authorization header. The signed `state` establishes who is linking.
 * Every exit path redirects back into the app rather than rendering JSON, because
 * a person is looking at this, not a script.
 */
router.get("/callback", async (req, res) => {
    const { code, state, error: denied } = req.query;
    // The athlete pressed "Cancel" on Strava's consent screen.
    if (denied) {
        res.redirect((0, stravaOauth_1.finishUrl)("denied"));
        return;
    }
    if (!code || !state) {
        res.redirect((0, stravaOauth_1.finishUrl)("error", "Strava's response was missing the code"));
        return;
    }
    const userId = (0, stravaOauth_1.userIdFromState)(state);
    if (!userId) {
        res.redirect((0, stravaOauth_1.finishUrl)("error", "That linking request expired — try again"));
        return;
    }
    try {
        const tokens = await (0, stravaOauth_1.exchangeCode)(code);
        const athlete = tokens.athlete;
        if (!athlete?.id) {
            res.redirect((0, stravaOauth_1.finishUrl)("error", "Strava didn't return an athlete"));
            return;
        }
        const athleteId = String(athlete.id);
        /**
         * One Strava account per club member. Without this check two members could
         * link the same athlete and both appear on the leaderboard with identical
         * figures.
         */
        const clash = await prisma_1.default.stravaAccount.findUnique({ where: { athlete_id: athleteId } });
        if (clash && clash.user_id !== userId) {
            res.redirect((0, stravaOauth_1.finishUrl)("error", "That Strava account is already linked to another member"));
            return;
        }
        const data = {
            athlete_id: athleteId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: new Date(tokens.expires_at * 1000),
            scope: tokens.scope ?? null,
            firstname: athlete.firstname ?? null,
            lastname: athlete.lastname ?? null,
            username: athlete.username ?? null,
            avatar_url: athlete.profile ?? null,
            city: athlete.city ?? null,
            country: athlete.country ?? null,
        };
        await prisma_1.default.stravaAccount.upsert({
            where: { user_id: userId },
            update: data,
            create: { user_id: userId, ...data },
        });
        // Kept in step so existing reads of User.strava_id stay correct.
        await prisma_1.default.user.update({ where: { id: userId }, data: { strava_id: athleteId } });
        await prisma_1.default.notification.create({
            data: {
                user_id: userId,
                message: `Strava connected as ${[athlete.firstname, athlete.lastname]
                    .filter(Boolean)
                    .join(" ") || athleteId}. Your runs will show on the club board.`,
            },
        });
        res.redirect((0, stravaOauth_1.finishUrl)("connected"));
    }
    catch (error) {
        console.error("[strava] callback failed:", error?.message || error);
        res.redirect((0, stravaOauth_1.finishUrl)("error", error?.message || "Token exchange failed"));
    }
});
/** 4. The signed-in member's connection state. */
router.get("/me", auth_1.requireAccount, async (req, res) => {
    try {
        const account = await prisma_1.default.stravaAccount.findUnique({
            where: { user_id: req.user.id },
        });
        if (!account) {
            res.json({ connected: false, configured: stravaOauth_1.stravaConfigured });
            return;
        }
        res.json({
            connected: true,
            configured: stravaOauth_1.stravaConfigured,
            athlete: {
                athlete_id: account.athlete_id,
                name: [account.firstname, account.lastname].filter(Boolean).join(" ") || null,
                username: account.username,
                avatar_url: account.avatar_url,
                city: account.city,
                country: account.country,
                profile_url: `https://www.strava.com/athletes/${account.athlete_id}`,
            },
            scope: account.scope,
            connected_at: account.connected_at,
            last_synced_at: account.last_synced_at,
            // Tokens themselves are never returned.
            token_expires_at: account.expires_at,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not read your Strava link" });
    }
});
/**
 * 5. Recent activities, straight from Strava.
 *
 * Not cached yet: Strava allows 100 requests per 15 minutes across the whole app,
 * so a club-wide dashboard polling this would exhaust the budget. It is fine for a
 * single member viewing their own profile, and the leaderboard should move to a
 * background sync before it reads live.
 */
router.get("/activities", auth_1.requireAccount, async (req, res) => {
    try {
        const token = await (0, stravaOauth_1.accessTokenFor)(req.user.id);
        if (!token) {
            res.status(400).json({ error: "Connect Strava first", connected: false });
            return;
        }
        const perPage = Math.min(50, Math.max(1, Number.parseInt(String(req.query.per_page ?? "15"), 10) || 15));
        const upstream = await fetch(`${stravaOauth_1.STRAVA_API}/athlete/activities?per_page=${perPage}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (upstream.status === 429) {
            res.status(429).json({
                error: "Strava's rate limit is reached (100 requests / 15 min). Try again shortly.",
            });
            return;
        }
        if (!upstream.ok) {
            res.status(502).json({
                error: `Strava returned ${upstream.status}. The connection may need re-authorising.`,
            });
            return;
        }
        const raw = (await upstream.json());
        await prisma_1.default.stravaAccount.update({
            where: { user_id: req.user.id },
            data: { last_synced_at: new Date() },
        });
        res.json({
            count: raw.length,
            activities: raw.map((a) => ({
                id: String(a.id),
                name: a.name,
                type: a.sport_type ?? a.type,
                started_at: a.start_date,
                distance_km: a.distance ? Number((a.distance / 1000).toFixed(2)) : null,
                moving_secs: a.moving_time ?? null,
                elapsed_secs: a.elapsed_time ?? null,
                elevation_m: a.total_elevation_gain ?? null,
                average_speed_kmh: a.average_speed
                    ? Number((a.average_speed * 3.6).toFixed(2))
                    : null,
                url: `https://www.strava.com/activities/${a.id}`,
            })),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not fetch activities" });
    }
});
/** 6. Disconnect — revoked at Strava as well as locally. */
router.delete("/me", auth_1.requireAccount, async (req, res) => {
    try {
        const account = await prisma_1.default.stravaAccount.findUnique({ where: { user_id: req.user.id } });
        if (!account) {
            res.json({ message: "Strava wasn't connected", changed: false });
            return;
        }
        // Best-effort revoke first; a failure there must not strand the local row.
        const token = await (0, stravaOauth_1.accessTokenFor)(req.user.id);
        if (token)
            await (0, stravaOauth_1.deauthorize)(token);
        await prisma_1.default.stravaAccount.delete({ where: { user_id: req.user.id } });
        await prisma_1.default.user.update({ where: { id: req.user.id }, data: { strava_id: null } });
        res.json({ message: "Strava disconnected", changed: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not disconnect Strava" });
    }
});
/** 7. Club leaderboard. Still the shared source used by the member directory. */
router.get("/leaderboard", async (_req, res) => {
    try {
        const leaderboard = await (0, strava_1.getAthleteStats)();
        res.json({
            club_name: "B Squared Run Club",
            leaderboard,
            /**
             * Told plainly so the client never presents generated numbers as real
             * training data. Flips once a background sync feeds this from Strava.
             */
            live: false,
            source: stravaOauth_1.stravaConfigured ? "sample" : "sample",
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch leaderboard" });
    }
});
/**
 * 8. Retired: the old free-text link. Kept as an explicit refusal rather than
 * deleted, so any client still calling it gets told why instead of a 404.
 */
router.post("/link", (0, auth_1.requireRole)(["MEMBER", "VOLUNTEER", "ADMIN"]), async (_req, res) => {
    res.status(410).json({
        error: "Pasting an athlete id no longer links Strava — use Connect Strava, which asks Strava for permission.",
    });
});
exports.default = router;
