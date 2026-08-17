import { motion } from "framer-motion";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import { EventCard } from "../components/events";
import { CollaboratorScroller } from "../components/collaborators";
import { Hero3D } from "../components/scene3d";
import { CalendarIcon, DisciplineIcon, SparkIcon, TicketIcon } from "../components/icons";
import { Spotlight } from "../components/motion";
import { Tilt, TiltLayer } from "../components/tilt";
import { buttonClass, Card, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { countdown, eventTime, fullDate, inr, isPast } from "../lib/format";
import { useFetch } from "../lib/useFetch";

const PILLARS = [
  {
    Icon: CalendarIcon,
    title: "Run the calendar",
    body: "Weekly road runs, trail sessions, rides and the odd party. Register in two taps.",
  },
  {
    Icon: TicketIcon,
    title: "Carry a QR ticket",
    body: "Every confirmed spot gets a scannable ticket. Volunteers marshal for free.",
  },
  {
    Icon: SparkIcon,
    title: "Decide together",
    body: "Polls pick the routes. The forum carries the announcements and the banter.",
  },
];

export function Landing() {
  const { user } = useAuth();

  const load = useCallback(() => api.events(), []);
  const { data: events, loading } = useFetch(load);

  const upcoming = (events ?? [])
    .filter((e) => e.status === "PUBLISHED" && !isPast(e.date_time))
    .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));

  const next = upcoming[0];
  const rest = upcoming.slice(1, 4);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        {/* Route trace, drawn in on load. Sits behind the copy on small screens. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute -top-10 right-[-6%] hidden h-[620px] w-[60%] lg:block"
          aria-hidden
        >
          <Hero3D className="h-full w-full" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-3xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/8 px-3 py-1.5">
            <span className="size-1.5 rounded-full bg-gold pulse-ring" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
              {upcoming.length > 0
                ? `${upcoming.length} event${upcoming.length === 1 ? "" : "s"} open`
                : "Season in planning"}
            </span>
          </span>

          <h1 className="display mt-6 text-[clamp(44px,9vw,86px)]">
            Find your
            <br />
            <span className="text-gold">stride.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
            A running club that actually runs on time. Pick a session, sign the waiver, pay once,
            and turn up with a ticket in your pocket.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/calendar" className={buttonClass("gold", "lg", "sweep")}>
              See the calendar
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
                <path
                  d="M5 12h14m-6-6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            {!user && (
              <Link to="/signup" className={buttonClass("outline", "lg")}>
                Join the club
              </Link>
            )}
            <Link to="/leaderboard" className={buttonClass("ghost", "lg")}>
              This week's board
            </Link>
          </div>
        </motion.div>

        {/* Next event spotlight */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="mt-14"
        >
          {loading ? (
            <Card className="p-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-10 w-2/3" />
              <Skeleton className="mt-3 h-4 w-1/3" />
            </Card>
          ) : next ? (
            <Tilt max={4} lift={5} glare={false}>
            <Card className="speedlines relative overflow-hidden">
              <div
                className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full opacity-[0.15] blur-3xl"
                style={{ background: "var(--color-gold)" }}
                aria-hidden
              />
              <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="eyebrow text-gold">Next up</p>
                  <h2 className="display mt-3 text-[clamp(26px,3.6vw,40px)]">{next.title}</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-ink-2">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gold" aria-hidden>
                        <DisciplineIcon type={next.type} className="size-4" />
                      </span>
                      {next.type}
                    </span>
                    <span>{fullDate(next.date_time)}</span>
                    <span>{eventTime(next.date_time)}</span>
                    <span className="text-ink-3">{next.location}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-x-6 gap-y-4 lg:shrink-0">
                  <div>
                    <p className="eyebrow whitespace-nowrap">Starts in</p>
                    <p className="display tnum mt-1.5 whitespace-nowrap text-[32px] text-gold">
                      {countdown(next.date_time) ?? "now"}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow">Entry</p>
                    <p className="display mt-1.5 whitespace-nowrap text-[32px]">
                      {next.price === 0 ? "Free" : inr(next.price)}
                    </p>
                  </div>
                  <Link
                    to={`/events/${next.id}`}
                    className={buttonClass("gold", "md", "mb-1 w-full sm:w-auto")}
                  >
                    Take a spot
                  </Link>
                </div>
              </div>
            </Card>
            </Tilt>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-sm text-ink-2">
                No published events right now — the organisers are drafting the next block.
              </p>
            </Card>
          )}
        </motion.div>
      </section>

      {/* ── Pillars ──────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <Tilt className="h-full" max={9} lift={10}>
                <Spotlight className="h-full rounded-[var(--radius-card)]">
                  <Card hover className="group h-full p-6 edge-gold">
                    <TiltLayer depth={34}>
                      <span
                        className="grid size-10 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold transition-all duration-300 group-hover:scale-110 group-hover:border-gold/50"
                        aria-hidden
                      >
                        <p.Icon className="size-[18px]" />
                      </span>
                    </TiltLayer>
                    <TiltLayer depth={18}>
                      <h3 className="mt-4 text-[15px] font-semibold text-ink">{p.title}</h3>
                      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{p.body}</p>
                    </TiltLayer>
                  </Card>
                </Spotlight>
              </Tilt>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── More events ──────────────────────────────────── */}
      {rest.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-2 text-gold">Also on the board</p>
              <h2 className="display text-[clamp(24px,3vw,32px)]">Coming up</h2>
            </div>
            <Link
              to="/events"
              className="text-[13px] font-medium text-ink-3 transition-colors hover:text-gold"
            >
              All events →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((e, i) => (
              <EventCard key={e.id} event={e} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ── Collaborators ────────────────────────────────── */}
      <CollaboratorScroller />

      {/* ── Closing CTA ──────────────────────────────────── */}
      {!user && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <Card className="relative overflow-hidden p-8 text-center sm:p-12">
            <div
              className="pointer-events-none absolute inset-x-0 -bottom-32 h-64 opacity-[0.16] blur-3xl"
              style={{ background: "var(--color-gold)" }}
              aria-hidden
            />
            <div className="relative">
              <h2 className="display text-[clamp(28px,4vw,44px)]">
                Next run leaves without you.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] text-ink-2">
                Join as a member to register and pay, or as a volunteer to marshal for free.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/signup" className={buttonClass("gold", "lg")}>
                  Create your account
                </Link>
                <Link to="/login" className={buttonClass("outline", "lg")}>
                  I have one
                </Link>
              </div>
            </div>
          </Card>
        </section>
      )}
    </>
  );
}
