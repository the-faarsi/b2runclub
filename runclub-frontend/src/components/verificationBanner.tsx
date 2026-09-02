import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * The standing prompt for a member who has not confirmed their email address.
 *
 * The club chose to nag rather than lock out: existing members keep browsing,
 * the forum, polls and the gallery, and what is withheld is taking a spot. That
 * decision only works if the prompt is impossible to miss, so this sits under
 * the navbar on every page rather than being tucked into the profile.
 *
 * Not dismissible, and deliberately so. A dismissed banner is a member who
 * never finds out why registration refuses them later, which is a worse
 * experience than a strip of text they can act on in a minute. It disappears
 * the moment the address is confirmed.
 */
export function VerificationBanner() {
    const { user, ready, needsVerification } = useAuth();
    const { pathname } = useLocation();

    // Nothing to say on the page that does the job — it would sit directly
    // above a heading making the same request.
    if (!ready || !user || !needsVerification || pathname === "/verify") return null;

    return (
        <div
            role="status"
            className="border-b border-gold/25 bg-gold/8 px-4 py-2.5 sm:px-6 lg:px-8"
        >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="size-2 shrink-0 rounded-full bg-gold" aria-hidden />
                <p className="text-[13px] text-ink-2">
                    Confirm <strong className="text-ink">your email address</strong> to finish
                    setting up your account. You'll need it to take a spot in a session.
                </p>
                <Link
                    to="/verify"
                    className="ml-auto shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:decoration-gold"
                >
                    Confirm now
                </Link>
            </div>
        </div>
    );
}
