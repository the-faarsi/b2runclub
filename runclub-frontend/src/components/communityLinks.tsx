import { motion, useReducedMotion } from "framer-motion";
import { useCallback } from "react";
import { api } from "../lib/api";
import { cn } from "../lib/format";
import { useFetch } from "../lib/useFetch";
import { InstagramIcon, MailIcon, StravaIcon, WhatsAppIcon } from "./icons";
import { Card, Skeleton } from "./ui";

interface Channel {
  key: string;
  label: string;
  handle: string;
  blurb: string;
  href: string;
  cta: string;
  /** Each platform's own colour, used for the glow and glyph only. */
  tint: string;
  Icon: (p: { className?: string }) => JSX.Element;
}

/**
 * Where the club actually talks to itself: WhatsApp, Instagram, Strava.
 *
 * Previously these sat as small text links in the footer, which is where links go
 * to be ignored — a visitor deciding whether to join never scrolls that far. Given
 * pride of place on the home page instead.
 *
 * Everything is driven by the editable club record, so a channel simply doesn't
 * render until an organiser adds it, and the section disappears entirely if none
 * are set.
 */
export function CommunityLinks() {
  const reduced = useReducedMotion();
  const load = useCallback(() => api.clubInfo(), []);
  const { data: club, loading } = useFetch(load);

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-9 w-80" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const channels: Channel[] = [];

  if (club?.whatsapp) {
    channels.push({
      key: "whatsapp",
      label: "WhatsApp",
      handle: "Community group",
      blurb:
        "Where the week gets sorted — route changes, lift shares, who's running Sunday. Join and say hello.",
      href: club.whatsapp,
      cta: "Join the group",
      tint: "#25d366",
      Icon: WhatsAppIcon,
    });
  }

  if (club?.instagram) {
    channels.push({
      key: "instagram",
      label: "Instagram",
      handle: `@${club.instagram}`,
      blurb:
        "Photos from the road and the trail, session announcements, and the odd finish-line face.",
      href: `https://instagram.com/${club.instagram}`,
      cta: "Follow the page",
      tint: "#e1306c",
      Icon: InstagramIcon,
    });
  }

  if (club?.strava_club) {
    channels.push({
      key: "strava",
      label: "Strava",
      handle: "Club B2club",
      blurb:
        "Log your runs with the club, see everyone's week, and keep yourself honest between sessions.",
      // A bare id becomes a club URL; a full URL is used as given.
      href: /^https?:\/\//i.test(club.strava_club)
        ? club.strava_club
        : `https://www.strava.com/clubs/${club.strava_club}`,
      cta: "Join the club",
      tint: "#fc4c02",
      Icon: StravaIcon,
    });
  }

  /* Email last: it is the formal route, and the three above are where the club
     actually talks. Previously the address only appeared as small footer text,
     so anyone with an actual question had nowhere obvious to look. */
  if (club?.contact_email) {
    channels.push({
      key: "email",
      label: "Email",
      handle: club.contact_email,
      blurb:
        "Questions about a session, a refund, or bringing a group along? Write to the organisers.",
      href: `mailto:${club.contact_email}`,
      cta: "Send an email",
      tint: "var(--color-gold)",
      Icon: MailIcon,
    });
  }

  // Nothing configured — say nothing rather than show an empty shelf.
  if (channels.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="datastrip mb-10" />

      <div className="max-w-2xl">
        <p className="eyebrow mb-2 text-gold">Contact us</p>
        <h2 className="display text-[clamp(26px,3.6vw,38px)]">Get in touch.</h2>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
          Where to find us between sessions, and how to reach the organisers. All open — you don't
          need an account here to use any of them.
        </p>
      </div>

      <div
        className={cn(
          "mt-9 grid gap-4",
          channels.length >= 4
            ? "sm:grid-cols-2 lg:grid-cols-4"
            : channels.length === 3
              ? "sm:grid-cols-3"
              : channels.length === 2
                ? "sm:grid-cols-2"
                : "",
        )}
      >
        {channels.map((c, i) => (
          <motion.a
            key={c.key}
            href={c.href}
            target="_blank"
            rel="noreferrer"
            initial={reduced ? undefined : { opacity: 0, y: 18 }}
            whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.08, 0.24), ease: [0.16, 1, 0.3, 1] }}
            className="group block h-full focus-visible:outline-none"
            aria-label={`${c.label} — ${c.cta}`}
          >
            <Card
              hover
              className="relative h-full overflow-hidden p-6 transition-colors duration-300 group-hover:border-white/16 group-focus-visible:border-gold"
            >
              {/* Platform-coloured bloom, kept faint so the page stays gold-led */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-[0.16] blur-3xl transition-opacity duration-500 group-hover:opacity-30"
                style={{ background: c.tint }}
              />

              <span
                className="relative grid size-12 place-items-center rounded-2xl border transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105"
                style={{ borderColor: `${c.tint}59`, background: `${c.tint}1f`, color: c.tint }}
                aria-hidden
              >
                <c.Icon className="size-6" />
              </span>

              <p className="relative mt-5 text-[17px] font-semibold text-ink">{c.label}</p>
              <p className="relative mt-0.5 text-[12.5px] font-medium" style={{ color: c.tint }}>
                {c.handle}
              </p>

              <p className="relative mt-3 text-[13.5px] leading-relaxed text-ink-2">{c.blurb}</p>

              <span className="relative mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink transition-colors duration-300 group-hover:text-gold">
                {c.cta}
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
                  <path
                    d="M5 12h14m-6-6 6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </svg>
              </span>
            </Card>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
