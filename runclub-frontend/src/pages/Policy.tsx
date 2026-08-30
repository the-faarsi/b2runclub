import { Link } from "react-router-dom";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import { Card, buttonClass } from "../components/ui";
import { CLUB_NAME } from "../lib/brand";
import {
    CLUB_TERMS,
    POLICY_UPDATED,
    PRIVACY_POLICY,
    REFUND_POLICY,
    REFUND_SUMMARY,
    VOLUNTEER_TERMS,
    type PolicySection,
} from "../lib/policies";

/**
 * One renderer for every policy document, so the four read as one set rather
 * than four pages that happen to be near each other.
 */
function PolicyBody({ sections }: { sections: PolicySection[] }) {
    return (
        <div className="space-y-4">
            {sections.map((s, i) => (
                <Card key={s.heading} className="p-6">
                    <div className="flex items-baseline gap-3">
                        <span className="tnum text-[12px] font-semibold text-gold">
                            {String(i + 1).padStart(2, "0")}
                        </span>
                        <h2 className="text-[16px] font-semibold text-ink">{s.heading}</h2>
                    </div>
                    <ul className="mt-3 space-y-2.5 pl-[30px]">
                        {s.body.map((line) => (
                            <li
                                key={line}
                                className="relative text-[14px] leading-relaxed text-ink-2 before:absolute before:-left-[14px] before:top-[9px] before:size-1 before:rounded-full before:bg-gold/70"
                            >
                                {line}
                            </li>
                        ))}
                    </ul>
                </Card>
            ))}
        </div>
    );
}

function Updated() {
    return (
        <p className="mt-6 text-[12px] text-ink-3">
            Last updated {POLICY_UPDATED} · {CLUB_NAME}
        </p>
    );
}

/** Cross-links, so a member reading one policy can find the others. */
function OtherPolicies({ current }: { current: "terms" | "privacy" | "refunds" }) {
    const all = [
        { key: "terms", to: "/terms", label: "Club terms" },
        { key: "privacy", to: "/privacy", label: "Privacy policy" },
        { key: "refunds", to: "/refunds", label: "Refund policy" },
    ] as const;
    return (
        <div className="mt-8 flex flex-wrap gap-2">
            {all
                .filter((x) => x.key !== current)
                .map((x) => (
                    <Link key={x.key} to={x.to} className={buttonClass("outline", "sm")}>
                        {x.label}
                    </Link>
                ))}
        </div>
    );
}

export function TermsPage() {
    return (
        <Page className="max-w-3xl">
            <PageScene variant="shards" opacity={0.18} />
            <PageHeader
                eyebrow="The agreement"
                title="Club terms"
                description="What you are agreeing to when you register for a session. Plain language, no small print."
            />
            <PolicyBody sections={CLUB_TERMS} />
            <OtherPolicies current="terms" />
            <Updated />
        </Page>
    );
}

export function PrivacyPage() {
    return (
        <Page className="max-w-3xl">
            <PageScene variant="constellation" opacity={0.18} />
            <PageHeader
                eyebrow="Your data"
                title="Privacy policy"
                description="What the club collects, why it needs it, and how to get rid of it."
            />
            <PolicyBody sections={PRIVACY_POLICY} />
            <OtherPolicies current="privacy" />
            <Updated />
        </Page>
    );
}

export function RefundPage() {
    return (
        <Page className="max-w-3xl">
            <PageScene variant="pulse" opacity={0.18} />
            <PageHeader
                eyebrow="Money back"
                title="Refund policy"
                description="When you get your entry fee back, and when you do not."
            />

            {/* The short version first — most people came for exactly this. */}
            <Card className="mb-4 border-gold/25 p-6">
                <p className="eyebrow mb-3 text-gold">In short</p>
                <ul className="space-y-2.5">
                    {REFUND_SUMMARY.map((line) => (
                        <li
                            key={line}
                            className="relative pl-4 text-[14px] leading-relaxed text-ink-2 before:absolute before:left-0 before:top-[9px] before:size-1 before:rounded-full before:bg-gold"
                        >
                            {line}
                        </li>
                    ))}
                </ul>
            </Card>

            <PolicyBody sections={REFUND_POLICY} />
            <OtherPolicies current="refunds" />
            <Updated />
        </Page>
    );
}

/** Volunteer-only. Route is gated in App.tsx; this page assumes that. */
export function VolunteerTermsPage() {
    return (
        <Page className="max-w-3xl">
            <PageScene variant="helix" opacity={0.18} />
            <PageHeader
                eyebrow="Marshals"
                title="Volunteer terms"
                description="What marshalling a session commits you to, and what the club owes you in return."
            />
            <Card className="mb-4 border-[color:var(--color-free)]/25 p-5">
                <p className="text-[13.5px] leading-relaxed text-ink-2">
                    <span className="font-semibold text-ink">This page is for volunteers.</span>{" "}
                    It sits alongside the club terms, which still apply to you as a member — these
                    add the parts specific to marshalling.
                </p>
            </Card>
            <PolicyBody sections={VOLUNTEER_TERMS} />
            <div className="mt-8 flex flex-wrap gap-2">
                <Link to="/terms" className={buttonClass("outline", "sm")}>
                    Club terms
                </Link>
                <Link to="/calendar" className={buttonClass("ghost", "sm")}>
                    Pick a session
                </Link>
            </div>
            <Updated />
        </Page>
    );
}
