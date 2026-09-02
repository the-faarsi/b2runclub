import { Response, NextFunction } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "./auth";
import { enforcedVerification, pendingVerification } from "../utils/verification";


/**
 * Blocks an action until the member's email and phone are both confirmed.
 *
 * Applied narrowly — to taking a spot in a session, and nothing else. The club
 * decided that an existing member should be prompted rather than shut out, so
 * browsing, the forum, polls and the gallery stay open; what is withheld is the
 * one thing where an unreachable member is a real problem. If somebody does not
 * turn up, or turns up hurt, the organisers need a working address and a number
 * that rings.
 *
 * Gating registration alone is also what keeps money out of it: a payment can
 * only exist against a registration, so there is no way to reach checkout
 * unverified and no risk of a paid-but-blocked member stranded mid-flow.
 *
 * The role check stays where it is. This runs after it, and answers a different
 * question: not "may you do this" but "have you finished signing up".
 */
export async function requireVerified(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const id = req.user?.id;
    if (!id) {
        // requireRole/requireAccount runs first and would already have rejected
        // this; belt and braces, since a mis-ordered route must not open a hole.
        res.status(401).json({ error: "Sign in to continue" });
        return;
    }

    const user = await prisma.user.findUnique({
        where: { id },
        select: { email_verified_at: true, phone_verified_at: true, phone: true },
    });

    if (!user) {
        res.status(401).json({ error: "Account not found" });
        return;
    }

    const pending = pendingVerification(user);

    // What this gate will actually act on, as opposed to what is outstanding.
    const enforced = enforcedVerification(pending);

    if (!enforced.email && !enforced.phone) {
        next();
        return;
    }

    const what =
        enforced.email && enforced.phone
            ? "Confirm your email address and phone number"
            : enforced.email
              ? "Confirm your email address"
              : "Add and confirm your phone number";

    res.status(403).json({
        error: `${what} before taking a spot. It takes a minute.`,
        // Machine-readable so the client can route to the right step instead of
        // parsing the sentence above.
        code: "VERIFICATION_REQUIRED",
        /* The enforced set, not the outstanding one: the client uses this to
           name what it is asking for, and naming a channel it is not actually
           blocking on would be a lie the member cannot resolve. */
        needs: enforced,
    });
}
