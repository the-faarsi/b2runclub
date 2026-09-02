/**
 * WhatsApp delivery, via Meta's Cloud API.
 *
 * Deliberately shaped like ../utils/mailer: a `configured` flag, a console
 * fallback that returns ok/simulated rather than throwing, and a config reporter
 * that never returns the values. With no credentials the whole verification flow
 * is still exercisable end to end — the code is printed to the server log
 * instead of sent — which is the same trade the mailer and the Razorpay mock
 * mode already make.
 *
 * Why templates and not a plain text message: Meta only permits business-
 * initiated messages from a pre-approved template, and an OTP is by definition
 * business-initiated. The template must be created in the WhatsApp Manager under
 * the *Authentication* category, which is the only category allowed to carry a
 * one-time code. A free-form message would be rejected unless the member had
 * messaged the club in the last 24 hours, which for a signup is never.
 */

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const OTP_TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE?.trim() || "b2club_verification";
const OTP_TEMPLATE_LANG = process.env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() || "en";

/**
 * Meta's authentication templates carry a "Copy code" button by default, and
 * the button needs the code passed a second time as its own parameter. Sending
 * that component to a template without a button is an error, and omitting it
 * from a template that has one is also an error — so it has to be a switch.
 */
const TEMPLATE_HAS_COPY_BUTTON =
    (process.env.WHATSAPP_OTP_COPY_BUTTON?.trim() || "true").toLowerCase() !== "false";

/** True when real Cloud API credentials are present. */
export const whatsappConfigured = Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);

export interface WhatsAppResult {
    ok: boolean;
    /** True when it was logged rather than actually transmitted. */
    simulated: boolean;
    error?: string;
}

/**
 * Sends a one-time code to `e164`.
 *
 * Never throws: a delivery failure must not take down the request that asked
 * for the code, because the row recording it has already been written and the
 * member can ask again.
 */
export async function sendWhatsAppCode(e164: string, code: string): Promise<WhatsAppResult> {
    if (!whatsappConfigured) {
        console.log(
            [
                "",
                "──────── WHATSAPP (not sent — Cloud API not configured) ────────",
                `To:   ${e164}`,
                `Code: ${code}`,
                `      (template "${OTP_TEMPLATE}", ${OTP_TEMPLATE_LANG})`,
                "────────────────────────────────────────────────────────────────",
            ].join("\n"),
        );
        return { ok: true, simulated: true };
    }

    // The API wants the number without the leading +.
    const to = e164.replace(/^\+/, "");

    const components: unknown[] = [
        { type: "body", parameters: [{ type: "text", text: code }] },
    ];
    if (TEMPLATE_HAS_COPY_BUTTON) {
        components.push({
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: code }],
        });
    }

    try {
        const response = await fetch(
            `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to,
                    type: "template",
                    template: {
                        name: OTP_TEMPLATE,
                        language: { code: OTP_TEMPLATE_LANG },
                        components,
                    },
                }),
            },
        );

        if (!response.ok) {
            const body = (await response.text().catch(() => "")).slice(0, 400);
            // The code itself is never logged on this path — only the failure.
            console.error(
                `[whatsapp] send to ${to.slice(0, 4)}… failed: ${response.status} ${body}`,
            );
            return {
                ok: false,
                simulated: false,
                error: describeFailure(response.status, body),
            };
        }

        return { ok: true, simulated: false };
    } catch (error: any) {
        console.error("[whatsapp] send failed:", error?.message || error);
        return { ok: false, simulated: false, error: "Could not reach WhatsApp" };
    }
}

/**
 * Turns Meta's error into something an organiser can act on.
 *
 * The raw body is a numeric code and a sentence written for developers; these
 * are the three failures that actually happen in practice during setup.
 */
function describeFailure(status: number, body: string): string {
    if (status === 401 || /expired|invalid.*token/i.test(body)) {
        return "The club's WhatsApp access token was rejected — it may have expired.";
    }
    if (/template/i.test(body)) {
        return `WhatsApp rejected the template "${OTP_TEMPLATE}". Check it exists and is approved.`;
    }
    if (status === 429) {
        return "WhatsApp is rate-limiting the club's number. Try again in a few minutes.";
    }
    return "WhatsApp could not deliver the code.";
}

/**
 * Which WhatsApp settings are present, for the admin diagnostics panel.
 *
 * Values are never returned — only whether each is set — so the panel is safe
 * to look at over a screen share. Same contract as mailerConfig().
 */
export function whatsappConfig() {
    return {
        configured: whatsappConfigured,
        api_version: API_VERSION,
        phone_number_id_set: Boolean(PHONE_NUMBER_ID),
        access_token_set: Boolean(ACCESS_TOKEN),
        template: OTP_TEMPLATE,
        template_language: OTP_TEMPLATE_LANG,
        template_has_copy_button: TEMPLATE_HAS_COPY_BUTTON,
        missing: (
            [
                ["WHATSAPP_PHONE_NUMBER_ID", PHONE_NUMBER_ID],
                ["WHATSAPP_ACCESS_TOKEN", ACCESS_TOKEN],
            ] as const
        )
            .filter(([, v]) => !v)
            .map(([k]) => k),
    };
}
