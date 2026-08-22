import dotenv from "dotenv";

/**
 * Load .env here, before anything below reads process.env.
 *
 * This module must not depend on import order. `server.ts` calls dotenv.config()
 * in its own body, but ES imports are hoisted and evaluated first, so any module
 * reading process.env at load time ran before the env existed. That is exactly
 * what happened to JWT verification: middleware/auth.ts imported no module that
 * loaded dotenv, so it read `undefined` and silently used its hardcoded fallback —
 * meaning a strong JWT_SECRET in .env was ignored for verifying tokens.
 *
 * dotenv does not overwrite variables already present in the environment, so
 * calling it here as well as elsewhere is safe and real env vars still win.
 */
dotenv.config();

/**
 * Startup validation for the secrets that gate authentication and payments.
 *
 * These used to be read as `process.env.X || "SomeDefaultString"`. That default
 * is published in the source, so a deployment with a missing or unchanged .env
 * silently ran on a secret any reader of the repo already knew — which means
 * anyone could mint a token claiming `role: "ADMIN"`, or forge a payment webhook
 * marking a registration paid.
 *
 * Failing at startup is the correct trade here: a server that refuses to boot is
 * an obvious, immediate problem, whereas one running on a known secret looks
 * perfectly healthy while being wide open.
 */

/** Values that must never be accepted — the old hardcoded fallbacks. */
const KNOWN_WEAK = new Set([
    "YourSuperSecretJWTString",
    "CreateAStrongSecret",
    "YourTestKeySecret",
    "rzp_test_YourTestKeyId",
    "changeme",
    "secret",
]);

const MIN_LENGTH = 24;

function require_(name: string, hint: string): string {
    const value = process.env[name];

    const fail = (why: string) => {
        throw new Error(
            [
                "",
                `  ✗ ${name} ${why}.`,
                "",
                `    ${hint}`,
                "",
                "    Generate one with:",
                `      node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
                "",
                `    Then set it in runclub-backend/.env as ${name}="<value>".`,
                "",
            ].join("\n"),
        );
    };

    if (!value || !value.trim()) fail("is not set");
    const v = value!.trim();

    if (KNOWN_WEAK.has(v)) {
        fail("is still one of the example values committed to the source, so it is public");
    }
    if (v.length < MIN_LENGTH) {
        fail(`is only ${v.length} characters — use at least ${MIN_LENGTH}`);
    }

    return v;
}

/** Signs and verifies session tokens. Rotating it invalidates every session. */
export const JWT_SECRET: string = require_(
    "JWT_SECRET",
    "This signs every session token. If it leaks, anyone can forge an admin session.",
);

/**
 * Razorpay values are optional: with none set the app runs in mock mode, which is
 * a legitimate local state. But a *present* secret still has to be a real one —
 * leaving it as the example string is worse than leaving it unset, because the
 * webhook then verifies against a public value and appears to be working.
 */
function optional(name: string): string | undefined {
    const value = process.env[name]?.trim();
    if (!value) return undefined;
    if (KNOWN_WEAK.has(value)) {
        throw new Error(
            [
                "",
                `  ✗ ${name} is still the example value from the source, so it is public.`,
                "",
                "    Either remove it entirely (the app then runs in Razorpay mock mode),",
                "    or set the real value from your Razorpay dashboard.",
                "",
            ].join("\n"),
        );
    }
    return value;
}

export const RAZORPAY_KEY_ID = optional("RAZORPAY_KEY_ID");
export const RAZORPAY_KEY_SECRET = optional("RAZORPAY_KEY_SECRET");
export const RAZORPAY_WEBHOOK_SECRET = optional("RAZORPAY_WEBHOOK_SECRET");

/** True when Razorpay is unconfigured and the app should mint mock orders. */
export const RAZORPAY_MOCK_MODE = !RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET;

/**
 * Webhook verification is only possible with a secret. Without one the endpoint
 * must reject everything rather than fall back to a guessable value.
 */
export const WEBHOOKS_VERIFIABLE = Boolean(RAZORPAY_WEBHOOK_SECRET);
