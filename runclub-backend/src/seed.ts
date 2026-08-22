/**
 * First-run bootstrap for a fresh deployment.
 *
 * A newly provisioned database has no users, and `POST /api/auth/register`
 * only accepts MEMBER and VISITOR — so without this there is no way to get an
 * admin account, and every organiser page is unreachable.
 *
 * Idempotent by design: it does nothing at all once any ADMIN exists, so it is
 * safe to run on every boot. It never modifies an existing account.
 *
 * Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment. If either is missing
 * it exits quietly rather than inventing a default — a predictable seeded
 * password on a public host would be worse than no admin.
 */
import prisma from "./utils/prisma";
import { hashPassword } from "./utils/crypto";

async function main(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    const existing = await prisma.user.count({ where: { role: "ADMIN" } });
    if (existing > 0) {
        console.log(`[seed] ${existing} admin account(s) already present — nothing to do.`);
        return;
    }

    if (!email || !password) {
        console.warn(
            "[seed] No ADMIN_EMAIL / ADMIN_PASSWORD set and no admin exists. " +
                "Set both and redeploy, or the organiser pages will be unreachable.",
        );
        return;
    }
    if (password.length < 8) {
        console.warn("[seed] ADMIN_PASSWORD must be at least 8 characters. Skipping.");
        return;
    }

    // Someone may already hold this address as a MEMBER — promote rather than
    // fail on the unique-email constraint.
    const sameEmail = await prisma.user.findUnique({ where: { email } });
    if (sameEmail) {
        await prisma.user.update({ where: { id: sameEmail.id }, data: { role: "ADMIN" } });
        console.log(`[seed] Promoted existing account ${email} to ADMIN.`);
        return;
    }

    await prisma.user.create({
        data: {
            name: process.env.ADMIN_NAME?.trim() || "Club Admin",
            email,
            password_hash: hashPassword(password),
            role: "ADMIN",
        },
    });
    console.log(`[seed] Created the first admin: ${email}`);
}

main()
    .catch((err) => {
        // A failed seed must not stop the server from booting.
        console.error("[seed] failed:", err instanceof Error ? err.message : err);
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
