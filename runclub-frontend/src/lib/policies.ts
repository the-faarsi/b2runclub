import { CLUB_NAME, CLUB_SHORT } from "./brand";

/**
 * Policy text in one place.
 *
 * The refund rules appear in four spots — the policy page, the club terms on the
 * home page, a reminder on the event registration sheet, and the ticket view.
 * Written out separately they would drift, and a refund window that says 48
 * hours in one place and 24 in another is the kind of discrepancy a member is
 * entitled to hold the club to.
 *
 * REFUND_WINDOW_HOURS is the single number everything else is derived from, so
 * changing the policy is a one-line edit.
 *
 * These are plain-language summaries written for a running club, not legal
 * advice. Have someone qualified review them before you rely on them.
 */

/**
 * Sessions a member must have attended before they are considered to marshal.
 *
 * A guideline for organisers rather than a hard gate — promotion is still a
 * judgement call — but it is the number quoted to members, so it lives in one
 * place and is read by the volunteer terms and the admin directory.
 */
export const MARSHAL_MIN_SESSIONS = 12;

export const REFUND_WINDOW_HOURS = 48;

export const POLICY_UPDATED = "22 August 2026";

/** One line, for buttons and inline hints. */
export const REFUND_ONE_LINER = `Cancel more than ${REFUND_WINDOW_HOURS} hours before the start for a full refund.`;

/** Two or three lines, for the registration and ticket panels. */
export const REFUND_SUMMARY = [
    `Cancel more than ${REFUND_WINDOW_HOURS} hours before the start time and you get the full entry fee back.`,
    `Inside ${REFUND_WINDOW_HOURS} hours the place is held for you and the fee is not refundable, because the club has already paid for permits, marshals and supplies.`,
    "If the club cancels a session for any reason — weather, permits, safety — everyone is refunded in full, automatically.",
];

export interface PolicySection {
    heading: string;
    body: string[];
}

export const REFUND_POLICY: PolicySection[] = [
    {
        heading: "Cancelling your own place",
        body: [
            `More than ${REFUND_WINDOW_HOURS} hours before the start time: full refund of the entry fee, no questions asked.`,
            `Within ${REFUND_WINDOW_HOURS} hours of the start: no refund. By that point the club has committed to permits, marshal cover and supplies based on the number registered.`,
        ],
    },
    {
        heading: "If the club cancels",
        body: [
            "Every registered runner is refunded in full, automatically, without needing to ask.",
            "Sessions are called off for weather, permit withdrawal or a safety concern on the route. Where possible the club offers a rescheduled date as well as the refund.",
        ],
    },
    {
        heading: "Volunteers",
        body: [
            "Volunteer entry is comped, so there is nothing to refund. Withdrawing from a shift costs you nothing.",
            "Tell an organiser as early as you can — a missing marshal at a junction is a safety problem, not an admin one.",
        ],
    },
    {
        heading: "How refunds are paid",
        body: [
            "Refunds go back to the card or account used to pay, through Razorpay. The club never handles your card details.",
            "Razorpay typically settles a refund in five to seven working days. The club cannot speed that up.",
        ],
    },
    {
        heading: "Something gone wrong?",
        body: [
            "If you were charged twice, charged for a session you did not register for, or a refund has not arrived after seven working days, contact the club and it will be sorted.",
        ],
    },
];

export const PRIVACY_POLICY: PolicySection[] = [
    {
        heading: "What is collected",
        body: [
            "Your name and email address, so you can sign in and be contacted about a session.",
            "An emergency contact, if you provide one. It is required before you can register for a run, and exists for one purpose: so an organiser can reach someone if you are hurt.",
            "Your registrations, attendance and any results recorded on the day.",
        ],
    },
    {
        heading: "What it is used for",
        body: [
            "Running the club: taking registrations, issuing tickets, and sending reminders about sessions you signed up for.",
            "Safety on the day: an organiser can see your emergency contact so they can act quickly if something happens.",
            `${CLUB_SHORT} does not sell your data, and does not send marketing.`,
        ],
    },
    {
        heading: "Who can see it",
        body: [
            "Other members see your name. Nothing else.",
            "Organisers additionally see your email, your emergency contact and your registration history — the minimum needed to run a session safely.",
            "Payments go through Razorpay. The club never sees or stores your card details.",
        ],
    },
    {
        heading: "How long it is kept",
        body: [
            "Your account and its history are kept while you are a member.",
            "Ask an organiser to delete your account and it is removed, along with your emergency contact. Records the club must keep for accounting — that a payment happened, and its amount — are retained.",
        ],
    },
    {
        heading: "Your choices",
        body: [
            "Edit your name, email and emergency contact yourself from your profile at any time.",
            "Ask for a copy of what the club holds about you, or ask for it to be deleted, by contacting an organiser.",
        ],
    },
];

export const CLUB_TERMS: PolicySection[] = [
    {
        heading: "Taking part",
        body: [
            "Sessions are open to members. You take part at your own risk, and you confirm you are medically fit to do so when you register.",
            `${CLUB_NAME} is not liable for injury, illness or loss during a session. Bring what you need.`,
        ],
    },
    {
        heading: "On the day",
        body: [
            "There is a briefing fifteen minutes before every session covering the route, the junctions and where the marshals will be. Please be there for it.",
            "Marshals carry a club ID card. Follow their calls at junctions — they are there because that corner needs one.",
            "Your QR ticket is scanned at the start line. A screenshot is fine.",
        ],
    },
    {
        heading: "Places and payment",
        body: [
            "A place is confirmed once payment clears. Sessions with a capacity are first come, first served.",
            REFUND_ONE_LINER,
        ],
    },
    {
        heading: "Conduct",
        body: [
            "Run on the correct side, respect other road and trail users, and take your litter home.",
            "The forum and polls are for the club. Organisers can remove anything abusive and, if it comes to it, restrict an account.",
        ],
    },
];

export const VOLUNTEER_TERMS: PolicySection[] = [
    {
        heading: "Who can marshal",
        body: [
            `Marshalling is open to members who have attended at least ${MARSHAL_MIN_SESSIONS} sessions. You need to know how a session runs before you can keep one safe.`,
            "Past that, it is an organiser's call — ask any of them and they will tell you where the club is short.",
        ],
    },
    {
        heading: "What you are agreeing to",
        body: [
            "Marshalling a session means being at your assigned point for the whole session, from the briefing until the last runner is through.",
            "If you cannot make a shift you have accepted, tell an organiser as early as you can. An unstaffed junction is a safety problem — it is the one thing that genuinely cannot be absorbed on the day.",
        ],
    },
    {
        heading: "On the day",
        body: [
            "Arrive thirty minutes before the start — fifteen minutes before the runners' briefing — for the marshal briefing.",
            "Carry your club ID card. It identifies you to runners, to the public and to traffic, and it is not optional.",
            "You direct runners and warn of hazards. You do not direct traffic, and you do not stop vehicles.",
        ],
    },
    {
        heading: "If something happens",
        body: [
            "Your job is to keep runners safe and get help, not to treat anyone. Call the emergency services first, then the organiser on the number given at the briefing.",
            "Do not move an injured runner unless leaving them is more dangerous than moving them.",
            "Report every incident to the organiser before you leave, however minor it seemed.",
        ],
    },
    {
        heading: "What you get",
        body: [
            "Entry is comped on every event while you hold volunteer status — registrations are free and your ticket is issued immediately, with no payment step.",
            "Volunteering is unpaid and voluntary. You can step back at any time by asking an organiser.",
        ],
    },
    {
        heading: "Photographs and members' details",
        body: [
            "Anything you learn while marshalling — an emergency contact, a medical detail, someone's pace — stays between you and the organisers.",
            "Photos you post to the club gallery should be of people happy to be photographed. Take anything down on request, without argument.",
        ],
    },
];
