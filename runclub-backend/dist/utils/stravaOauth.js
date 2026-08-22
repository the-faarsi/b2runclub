"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.finishUrl = exports.stravaConfigured = exports.REDIRECT_URI = exports.STRAVA_API = void 0;
exports.authorizeUrl = authorizeUrl;
exports.userIdFromState = userIdFromState;
exports.exchangeCode = exchangeCode;
exports.accessTokenFor = accessTokenFor;
exports.deauthorize = deauthorize;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("./prisma"));
const secrets_1 = require("./secrets");
/**
 * Strava OAuth: authorisation, token exchange and refresh.
 *
 * Each member authorises individually. There is no club-level API token — a club
 * invite link grants nothing programmatic — so the only lawful way to read
 * someone's activities is for them to consent, which is what this implements.
 */
const STRAVA_AUTHORIZE = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_DEAUTHORIZE = "https://www.strava.com/oauth/deauthorize";
exports.STRAVA_API = "https://www.strava.com/api/v3";
const CLIENT_ID = process.env.STRAVA_CLIENT_ID?.trim() || null;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET?.trim() || null;
/** Where Strava sends the browser back. Must sit under the callback domain
 *  registered on the Strava API settings page. */
exports.REDIRECT_URI = process.env.STRAVA_REDIRECT_URI?.trim() ||
    `${process.env.API_URL?.trim() || "http://localhost:3000"}/api/strava/callback`;
/** Where the member ends up afterwards. */
const APP_URL = process.env.APP_URL?.trim() || "http://localhost:5173";
/** True when both credentials are present, so the flow can actually run. */
exports.stravaConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);
/**
 * `activity:read_all` also covers activities the athlete marked private. Only
 * `activity:read` is requested so the club sees what the athlete makes visible —
 * asking for more than the feature needs is the wrong default.
 */
const SCOPE = "read,activity:read";
/**
 * Builds the URL the browser is sent to.
 *
 * `state` is a short-lived signed token rather than a random nonce in a session:
 * Strava redirects the *browser* back to the callback, which arrives with no
 * Authorization header, so the user's identity has to travel inside state. Signing
 * it means a third party cannot forge a callback that attaches their Strava
 * account to someone else's club profile.
 */
function authorizeUrl(userId) {
    if (!exports.stravaConfigured)
        throw new Error("Strava is not configured on this server");
    const state = jsonwebtoken_1.default.sign({ uid: userId, purpose: "strava-oauth" }, secrets_1.JWT_SECRET, {
        expiresIn: "15m",
    });
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: exports.REDIRECT_URI,
        response_type: "code",
        approval_prompt: "auto",
        scope: SCOPE,
        state,
    });
    return `${STRAVA_AUTHORIZE}?${params.toString()}`;
}
/** Verifies the state token and returns the user id it was issued for. */
function userIdFromState(state) {
    try {
        const payload = jsonwebtoken_1.default.verify(state, secrets_1.JWT_SECRET);
        if (payload.purpose !== "strava-oauth" || !payload.uid)
            return null;
        return payload.uid;
    }
    catch {
        return null;
    }
}
async function tokenRequest(body) {
    const res = await fetch(STRAVA_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            ...body,
        }),
    });
    const text = await res.text();
    if (!res.ok) {
        // Strava's errors are informative; surface them rather than a generic failure.
        let detail = text.slice(0, 300);
        try {
            const parsed = JSON.parse(text);
            detail = parsed.message || JSON.stringify(parsed.errors ?? parsed).slice(0, 300);
        }
        catch {
            /* keep the raw body */
        }
        throw new Error(`Strava token request failed (${res.status}): ${detail}`);
    }
    return JSON.parse(text);
}
/** Swaps the one-time code from the callback for a token pair. */
function exchangeCode(code) {
    return tokenRequest({ code, grant_type: "authorization_code" });
}
/**
 * Returns a valid access token for a member, refreshing when it is close to
 * expiry.
 *
 * Refreshed 60 seconds early: a token that expires mid-request would otherwise
 * fail the call it was fetched for. Strava also rotates the refresh token on some
 * responses, so whatever comes back is persisted.
 */
async function accessTokenFor(userId) {
    const account = await prisma_1.default.stravaAccount.findUnique({ where: { user_id: userId } });
    if (!account)
        return null;
    const stillValid = account.expires_at.getTime() - 60_000 > Date.now();
    if (stillValid)
        return account.access_token;
    if (!exports.stravaConfigured)
        return null;
    const refreshed = await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
    });
    await prisma_1.default.stravaAccount.update({
        where: { user_id: userId },
        data: {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? account.refresh_token,
            expires_at: new Date(refreshed.expires_at * 1000),
        },
    });
    return refreshed.access_token;
}
/** Tells Strava to drop our access, so disconnecting is honoured on their side too. */
async function deauthorize(accessToken) {
    try {
        await fetch(STRAVA_DEAUTHORIZE, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }
    catch {
        // A failure here must not block local disconnection — the member asked to
        // be disconnected, and the local tokens are what this app acts on.
    }
}
/** Where to send the browser once the callback has been handled. */
const finishUrl = (outcome, detail) => {
    const params = new URLSearchParams({ strava: outcome });
    if (detail)
        params.set("reason", detail.slice(0, 140));
    return `${APP_URL}/profile?${params.toString()}`;
};
exports.finishUrl = finishUrl;
