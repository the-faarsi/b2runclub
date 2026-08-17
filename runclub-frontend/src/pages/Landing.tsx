import { motion } from "framer-motion";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import { EventCard } from "../components/events";
import { CollaboratorScroller } from "../components/collaborators";
import { Hero3D } from "../components/scene3d";
import {
  CalendarIcon,
  ClockIcon,
  DisciplineIcon,
  PinIcon,
  SparkIcon,
  TicketIcon,
} from "../components/icons";
import { AnimatedNumber, Reveal, Spotlight } from "../components/motion";
import { Tilt, TiltLayer } from "../components/tilt";
import { Avatar, buttonClass, Card, Skeleton } from "../components/ui";
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

  // Extra reads for the long-form sections. All public endpoints, so these work
  // for signed-out visitors too; each degrades to an omitted section if empty.
  const loadGallery = useCallback(() => api.gallery(), []);
  const { data: gallery } = useFetch(loadGallery);
  const loadBoard = useCallback(() => api.leaderboard(), []);
  const { data: leaderboard } = useFetch(loadBoard);

  const upcoming = (events ?? [])
    .filter((e) => e.status === "PUBLISHED" && !isPast(e.date_time))
    .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));

  const next = upcoming[0];
  const rest = upcoming.slice(1, 4);

  const allEvents = events ?? [];
  const disciplines = new Set(allEvents.map((e) => e.type)).size;
  const photos = gallery ?? [];
  const board = leaderboard?.leaderboard ?? [];
  const clubKm = board.reduce((sum, r) => sum + r.weekly_distance_km, 0);

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

      {/* ── By the numbers ───────────────────────────────── */}
      <Reveal>
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="datastrip mb-10" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Sessions on the board", value: allEvents.length, suffix: "" },
              { label: "Published & open", value: upcoming.length, suffix: "" },
              { label: "Disciplines", value: disciplines, suffix: "" },
              { label: "Club distance", value: Math.round(clubKm), suffix: " km" },
            ].map((s) => (
              <Tilt key={s.label} max={8} lift={9}>
                <Card hover className="hud edge-gold h-full p-6">
                  <TiltLayer depth={26}>
                    <p className="display foil text-[40px] leading-none">
                      <AnimatedNumber value={s.value} format={(v) => `${Math.round(v)}${s.suffix}`} />
                    </p>
                  </TiltLayer>
                  <p className="eyebrow mt-3">{s.label}</p>
                </Card>
              </Tilt>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Reveal>
          <p className="eyebrow mb-2 text-gold">How it works</p>
          <h2 className="display text-[clamp(26px,3.6vw,38px)]">
            Four steps from curious to running.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {[
            { n: "01", t: "Pick a session", b: "Browse the calendar or the list. Every session shows route, start time and entry." },
            { n: "02", t: "Sign the waiver", b: "Once, with your emergency contact. We keep it for the organisers on the day." },
            { n: "03", t: "Pay in-app", b: "Card payment through Razorpay. Volunteers marshal and pay nothing." },
            { n: "04", t: "Show your ticket", b: "A QR code we scan at the start line. Screenshots are fine." },
          ].map((step, i) => (
            <Reveal key={step.n} delay={i * 0.07}>
              <Tilt max={7} lift={9}>
                <Card hover className="hud edge-gold group h-full p-6">
                  <TiltLayer depth={30}>
                    <span className="display text-[34px] leading-none text-gold/35 transition-colors duration-300 group-hover:text-gold/70">
                      {step.n}
                    </span>
                  </TiltLayer>
                  <TiltLayer depth={14}>
                    <h3 className="mt-3 text-[15px] font-semibold text-ink">{step.t}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{step.b}</p>
                  </TiltLayer>
                </Card>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Who it's for ─────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Reveal>
          <div className="datastrip mb-10" />
          <p className="eyebrow mb-2 text-gold">Where you fit</p>
          <h2 className="display text-[clamp(26px,3.6vw,38px)]">Three ways to be here.</h2>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {[
            {
              role: "Member",
              tint: "var(--color-paid)",
              line: "You want to run.",
              perks: ["Register for any published session", "Pay once, carry a QR ticket", "Post, comment and vote on routes"],
            },
            {
              role: "Volunteer",
              tint: "var(--color-free)",
              line: "You want to marshal.",
              perks: ["Entry comped on every event", "Gold bib and the junction calls", "Post photos to the club gallery"],
            },
            {
              role: "Visitor",
              tint: "var(--color-ink-3)",
              line: "You're just looking.",
              perks: ["Browse the calendar and gallery", "See polls and the leaderboard", "No account needed to look around"],
            },
          ].map((r, i) => (
            <Reveal key={r.role} delay={i * 0.07}>
              <Tilt max={7} lift={9}>
                <Card hover className="hud edge-gold h-full p-6">
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
                    style={{ background: `${r.tint}1f`, color: r.tint }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: r.tint }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                      {r.role}
                    </span>
                  </span>
                  <p className="display mt-4 text-[20px]">{r.line}</p>
                  <ul className="mt-4 space-y-2.5">
                    {r.perks.map((perk) => (
                      <li key={perk} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-2">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gold" aria-hidden />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Gallery preview ──────────────────────────────── */}
      {photos.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <Reveal>
            <div className="datastrip mb-10" />
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow mb-2 text-gold">From the club</p>
                <h2 className="display text-[clamp(26px,3.6vw,38px)]">Lately, in pictures</h2>
              </div>
              <Link to="/gallery" className="text-[13px] font-medium text-ink-3 hover:text-gold">
                Full gallery →
              </Link>
            </div>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {photos.slice(0, 4).map((ph, i) => (
              <Reveal key={ph.id} delay={i * 0.06}>
                <Tilt max={9} lift={10}>
                  <Link
                    to="/gallery"
                    className="group block overflow-hidden rounded-[var(--radius-card)] border border-white/8"
                  >
                    <img
                      src={ph.url}
                      alt={ph.caption ?? "Club photo"}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </Link>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── This week's board ────────────────────────────── */}
      {board.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <Reveal>
            <div className="datastrip mb-10" />
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow mb-2 text-gold">This week</p>
                <h2 className="display text-[clamp(26px,3.6vw,38px)]">Who's putting the miles in</h2>
              </div>
              <Link to="/leaderboard" className="text-[13px] font-medium text-ink-3 hover:text-gold">
                Full board →
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <Card className="hud mt-8 overflow-hidden p-0">
              <ol>
                {board.slice(0, 5).map((r, i) => (
                  <li
                    key={r.user_id}
                    className="flex items-center gap-4 border-b border-white/5 px-5 py-3.5 last:border-0"
                  >
                    <span className="display tnum w-7 text-center text-[15px] text-gold">
                      {i + 1}
                    </span>
                    <Avatar name={r.name} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                      {r.name}
                    </span>
                    <span className="tnum text-[13px] font-semibold text-ink">
                      {r.weekly_distance_km.toFixed(1)}
                      <span className="ml-0.5 text-[11px] font-normal text-ink-3">km</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </Reveal>
        </section>
      )}

      {/* ── On the day ───────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Reveal>
          <div className="datastrip mb-10" />
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="eyebrow mb-2 text-gold">On the day</p>
              <h2 className="display text-[clamp(26px,3.6vw,38px)]">
                Turn up fifteen minutes early.
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
                There's a briefing before every session — the route, the junctions, where the
                marshals will be. Bring water and your own nutrition for anything over 10&nbsp;km.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/calendar" className={buttonClass("gold", "md")}>
                  Pick a session
                </Link>
                <Link to="/about" className={buttonClass("outline", "md")}>
                  About the club
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { Icon: ClockIcon, t: "Briefing at −15", b: "Route, junctions, bag drop." },
                { Icon: PinIcon, t: "Marshalled corners", b: "Gold bibs. Follow their calls." },
                { Icon: TicketIcon, t: "Scan and go", b: "QR at the start line." },
                { Icon: SparkIcon, t: "Coffee after", b: "Always. Non-negotiable." },
              ].map((x, i) => (
                <Reveal key={x.t} delay={i * 0.05}>
                  <Tilt max={7} lift={8}>
                    <Card hover className="hud edge-gold h-full p-5">
                      <span className="grid size-9 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold">
                        <x.Icon className="size-4" />
                      </span>
                      <p className="mt-3 text-[14px] font-semibold text-ink">{x.t}</p>
                      <p className="mt-1 text-[12.5px] text-ink-3">{x.b}</p>
                    </Card>
                  </Tilt>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

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
