"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVerified = requireVerified;
const prisma_1 = __importDefault(require("../utils/prisma"));
const verification_1 = require("../utils/verification");
/**
 * Blocks an action until the member's email address is confirmed.
 *
 * Applied narrowly — to taking a spot in a session, and nothing else. The club
 * decided that an existing member should be prompted rather than shut out, so
 * browsing, the forum, polls and the gallery stay open; what is withheld is the
 * one thing where an unreachable member is a real problem, since the ticket
 * goes to their inbox.
 *
 * Gating registration alone is also what keeps money out of it: a payment can
 * only exist against a registration, so there is no way to reach checkout
 * unverified and no risk of a paid-but-blocked member stranded mid-flow.
 *
 * The role check stays where it is. This runs after it, and answers a different
 * question: not "may you do this" but "have you finished signing up".
 */
async function requireVerified(req, res, next) {
    const id = req.user?.id;
    if (!id) {
        // requireRole/requireAccount runs first and would already have rejected
        // this; belt and braces, since a mis-ordered route must not open a hole.
        res.status(401).json({ error: "Sign in to continue" });
        return;
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id },
        select: { email_verified_at: true },
    });
    if (!user) {
        res.status(401).json({ error: "Account not found" });
        return;
    }
    if (!(0, verification_1.verificationRequired)(user)) {
        next();
        return;
    }
    res.status(403).json({
        error: "Confirm your email address before taking a spot. It takes a minute.",
        // Machine-readable so the client can route to the verify screen instead
        // of parsing the sentence above.
        code: "VERIFICATION_REQUIRED",
    });
}
