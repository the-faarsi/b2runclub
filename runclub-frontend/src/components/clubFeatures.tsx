import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { CalendarIcon, RouteGraphic, TicketIcon, UsersIcon } from "./icons";
import { PageScene } from "./scene3d";
import { Tilt, TiltLayer } from "./tilt";
import { buttonClass, Card } from "./ui";

/**
 * What membership actually gets you.
 *
 * The home page used to explain the club in paragraphs while saying nothing
 * about what the app does — the tickets, the polls, the board, the gallery, the
 * comped volunteer entry. A visitor decided whether to join on prose alone.
 *
 * Every tile is a real route, so this doubles as the fastest way into the club
 * for someone who already has an account. Copy is deliberately short: a label
 * and one line, because the point is the breadth, not the reading.
 */
interface Feature {
  label: string;
  line: string;
  to: string;
  tint: string;
  Icon: (p: { className?: string }) => JSX.Element;
  /** Signed-out visitors can't open these, so they point at signup instead. */
  members?: boolean;
}

/** Local mark, kept out of the shared icon set since only this file uses it. */




function VoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-4"} fill="none" aria-hidden>
      <path
        d="M5 20h14M6.5 16V9m5.5 7V5m5.5 11v-4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/*
 * Four, not eight.
 *
 * Eight tiles was a catalogue, and the page's job is to get somebody to join,
 * not to inventory the app. These four are the ones that answer "what do I
 * actually get" — the sessions, the ticket, a say in the routes, and the way to
 * come for free. The rest are one tap away in the nav once you are in.
 */
const FEATURES: Feature[] = [
  {
    label: "Weekly sessions",
    line: "Road, trail, rides and socials.",
    to: "/calendar",
    tint: "var(--color-gold)",
    Icon: CalendarIcon,
  },
  {
    label: "QR tickets",
    line: "Scanned at the start line.",
    to: "/tickets",
    tint: "#c084fc",
    Icon: TicketIcon,
    members: true,
  },
  {
    label: "Route polls",
    line: "The club picks where it runs.",
    to: "/polls",
    tint: "var(--color-paid)",
    Icon: VoteIcon,
  },
  {
    label: "Volunteer free",
    line: "Marshal a corner, pay nothing.",
    to: "/signup",
    tint: "var(--color-free)",
    Icon: UsersIcon,
  },
];

export function ClubFeatures() {
  const { user } = useAuth();
  const reduced = useReducedMotion();

  return (
    <section className="relative mx-auto max-w-7xl overflow-hidden px-4 py-14 sm:px-6 lg:px-8">
      {/* Ambient depth behind the grid, matching the rest of the page's 3D. */}
      <PageScene variant="lattice" opacity={0.18} />

      <div className="datastrip mb-10" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 text-gold">Inside the club</p>
          <h2 className="display text-[clamp(26px,3.6vw,38px)]">
            Everything runs through here.
          </h2>
        </div>
        {!user && (
          <Link
            to="/signup"
            className="text-[13px] font-semibold text-gold transition-opacity hover:opacity-75"
          >
            Join to unlock →
          </Link>
        )}
      </div>

      <div className="mt-9 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {FEATURES.map((f, i) => {
          // A locked tile still gets a destination — signup, not a dead end.
          const to = f.members && !user ? "/signup" : f.to;
          return (
            <motion.div
              key={f.label}
              initial={reduced ? undefined : { opacity: 0, y: 16 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                duration: 0.42,
                delay: Math.min(i * 0.05, 0.3),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link to={to} className="group block h-full focus-visible:outline-none">
                <Tilt max={9} lift={10} className="h-full">
                  <Card
                    hover
                    className="hud edge-gold relative h-full min-h-[150px] overflow-hidden p-4 sm:p-5"
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-[0.14] blur-2xl transition-opacity duration-500 group-hover:opacity-30"
                      style={{ background: f.tint }}
                    />

                    <TiltLayer depth={30}>
                      <span
                        className="relative grid size-10 place-items-center rounded-xl border transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105"
                        style={{
                          borderColor: `color-mix(in oklab, ${f.tint} 35%, transparent)`,
                          background: `color-mix(in oklab, ${f.tint} 12%, transparent)`,
                          color: f.tint,
                        }}
                      >
                        <f.Icon className="size-4" />
                      </span>
                    </TiltLayer>

                    <TiltLayer depth={16}>
                      <p className="relative mt-3.5 text-[14px] font-semibold leading-snug text-ink">
                        {f.label}
                      </p>
                      <p className="relative mt-1 text-[12px] leading-relaxed text-ink-3">
                        {f.line}
                      </p>
                    </TiltLayer>

                    {f.members && !user && (
                      <p className="relative mt-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-gold/80">
                        Members
                      </p>
                    )}
                  </Card>
                </Tilt>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Wide join panel, sat directly under the feature grid.
 *
 * The old closing call to action was the only place the page asked anyone to
 * sign up, and it was the very last thing on a very long page. This puts the
 * ask right where someone has just seen what they would be getting.
 */
export function JoinBanner() {
  const { user } = useAuth();
  if (user) return null;

  return (
    <section className="mx-auto max-w-7xl overflow-hidden px-4 pb-6 sm:px-6 lg:px-8">
      <Card className="relative overflow-hidden p-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-[0.22]"
        >
          <RouteGraphic className="h-full w-full text-gold" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-1/2 opacity-[0.14] blur-3xl"
          style={{ background: "var(--color-gold)" }}
        />

        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow mb-2 text-gold">Two taps to a spot</p>
            <h2 className="display text-[clamp(24px,3.2vw,34px)]">Run with us this week.</h2>
          </div>

          <div className="flex flex-wrap gap-3 lg:shrink-0">
            <Link to="/signup" className={buttonClass("gold", "lg", "sweep")}>
              Join the club
            </Link>
            <Link to="/calendar" className={buttonClass("outline", "lg")}>
              See the calendar
            </Link>
          </div>
        </div>
      </Card>
    </section>
  );
}
