import { motion, useScroll, useTransform, useSpring, type MotionValue } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { Link } from "react-router-dom";
import { EventCard } from "../components/events";
import { CollaboratorScroller } from "../components/collaborators";
import { CommunityLinks } from "../components/communityLinks";
import { Hero3D, RunnerScene } from "../components/scene3d";
import {
  CalendarIcon,
  ClockIcon,
  DisciplineIcon,
  PinIcon,
  SparkIcon,
  TicketIcon,
} from "../components/icons";
import { AnimatedNumber, Reveal } from "../components/motion";
import { PillarCard } from "../components/PillarCard";
import { Tilt, TiltLayer } from "../components/tilt";
import { Avatar, buttonClass, Card, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, countdown, eventTime, fullDate, inr, isPast } from "../lib/format";
import { REFUND_ONE_LINER, REFUND_WINDOW_HOURS } from "../lib/policies";
import { useFetch } from "../lib/useFetch";

gsap.registerPlugin(SplitText);

/**
 * Magnetic hover: the element nudges toward the cursor as it moves within
 * its bounds, and eases back to rest on pointer leave. Uses `quickTo` so
 * repeated pointermove events reuse one tween per axis instead of spawning
 * a new one every frame. Not a hook — plain setup/cleanup, safe to call
 * from inside a useGSAP() callback for each button that wants the effect.
 */
function attachMagneticHover(el: HTMLElement | null, strength = 0.3) {
  if (!el) return () => {};

  const xTo = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3.out" });
  const yTo = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3.out" });

  const handlePointerMove = (event: PointerEvent) => {
    const bounds = el.getBoundingClientRect();
    const relativeX = event.clientX - (bounds.left + bounds.width / 2);
    const relativeY = event.clientY - (bounds.top + bounds.height / 2);
    xTo(relativeX * strength);
    yTo(relativeY * strength);
  };
  const handlePointerLeave = () => {
    xTo(0);
    yTo(0);
  };

  el.addEventListener("pointermove", handlePointerMove);
  el.addEventListener("pointerleave", handlePointerLeave);

  return () => {
    el.removeEventListener("pointermove", handlePointerMove);
    el.removeEventListener("pointerleave", handlePointerLeave);
  };
}

const PILLARS = [
  {
    Icon: CalendarIcon,
    title: "Run the calendar",
    body: "Weekly road runs, trail sessions, rides and the odd party. Register in two taps.",
    // Drop your image at public/pillars/calendar.jpg — omit this key entirely
    // if you don't have one yet; the card works without it.
    image: "/pillars/calendar.jpg",
  },
  {
    Icon: TicketIcon,
    title: "Carry a QR ticket",
    body: "Every confirmed spot gets a scannable ticket. Volunteers marshal for free.",
    image: "/pillars/ticket.jpg",
  },
  {
    Icon: SparkIcon,
    title: "Decide together",
    body: "Polls pick the routes. The forum carries the announcements and the banter.",
    image: "/pillars/decide.jpg",
  },
];

const HOW_STEPS = [
  {
    n: "01",
    t: "Pick a session",
    b: "Browse the calendar or the list. Every session shows route, start time and entry.",
    badge: { label: "Calendar", color: "var(--color-gold)", bg: "rgba(233,185,73,0.13)", icon: "📅" },
  },
  {
    n: "02",
    t: "Sign the waiver",
    b: "Once, with your emergency contact. We keep it for the organisers on the day.",
    badge: { label: "One time", color: "var(--color-free)", bg: "rgba(100,200,120,0.13)", icon: "✍️" },
  },
  {
    n: "03",
    t: "Pay in-app",
    b: "Card payment through Razorpay. Volunteers marshal and pay nothing.",
    badge: { label: "Secure pay", color: "var(--color-paid)", bg: "rgba(100,160,255,0.13)", icon: "💳" },
  },
  {
    n: "04",
    t: "Show your ticket",
    b: "A QR code we scan at the start line. Screenshots are fine.",
    badge: { label: "QR ticket", color: "#c084fc", bg: "rgba(192,132,252,0.13)", icon: "🎟️" },
  },
];

/**
 * Scroll-driven reveal for a single "How it works" card.
 */
function useCardReveal(
  progress: MotionValue<number>,
  range: [number, number],
  yFrom: number,
  /** Left-column cards tilt negative (-3→0), right-column tilt positive (3→0). */
  rotateZFrom: number = -3,
) {
  const y = useTransform(progress, range, [yFrom, 0]);
  const opacity = useTransform(progress, range, [0, 1]);
  const rotateX = useTransform(progress, range, [25, 0]);
  const rotateZ = useTransform(progress, range, [rotateZFrom, 0]);
  const scale = useTransform(progress, range, [0.85, 1]);
  return { y, opacity, rotateX, rotateZ, scale };
}

/**
 * Applies a card's scroll-driven motion values, or renders the card as-is when
 * the section is not in its pinned mode. Without the opt-out the motion values
 * would sit at their initial `opacity: 0` on phones — where the scroll progress
 * that drives them never advances — leaving the cards permanently invisible.
 */
function StepReveal({
  motion: mv,
  animate,
  children,
}: {
  motion: ReturnType<typeof useCardReveal>;
  animate: boolean;
  children: ReactNode;
}) {
  if (!animate) return <div>{children}</div>;
  return (
    <motion.div
      style={{ y: mv.y, opacity: mv.opacity, rotateX: mv.rotateX, rotateZ: mv.rotateZ, scale: mv.scale }}
    >
      {children}
    </motion.div>
  );
}

/**
 * True at the `lg` breakpoint and up — the width at which the pinned, two-column
 * "How it works" section has room to work. Below it the section falls back to a
 * plain stacked list: a 180vh pinned runway and a side-by-side masonry are both
 * wrong on a 375px phone, where the two columns overflowed the viewport by up to
 * 96px and forced the whole page to scroll sideways.
 */
function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export function Landing() {
  const { user } = useAuth();

  const load = useCallback(() => api.events(), []);
  const { data: events, loading } = useFetch(load);

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

  // ── Scroll refs for the "How it works" sticky section ──
  const stickyRef = useRef<HTMLDivElement>(null);
  /* Below lg the section is a plain stacked list — no pin, no scroll-driven
     reveal. See useIsWide(). */
  const isWide = useIsWide();

  /*
   * "start end" (section top reaching the viewport *bottom*) rather than
   * "start start" (section top reaching the viewport top). With the old offset
   * progress was still 0 at the instant the section pinned, so it locked to an
   * empty screen and only then began revealing. Starting a viewport earlier
   * means the heading and the first card are already coming in as the section
   * rises, and by the time it pins there is something on screen.
   * Progress 0.56 ≈ the moment it pins; the card ranges below are set in this
   * space, so keep the two in step if this offset changes.
   */
  const { scrollYProgress } = useScroll({
    target: stickyRef,
    offset: ["start end", "end end"],
  });

  // Stiffer and lighter than before (was 60 / 20 / 0.4). The old spring lagged
  // far enough behind the wheel that the cards felt disconnected from the
  // scroll — part of why the section read as "blank while I'm scrolling".
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 130,
    damping: 26,
    mass: 0.25,
  });

  // Each card has its own independent scroll-driven motion — staggered start
  // points so they rise with continuous momentum rather than moving as a
  // block. Cards further right and lower start from deeper below.
  //
  // Every card animates four properties together over the same [start, end]
  // window:
  //   y        — rises from its offset down to 0
  //   opacity  — fully invisible (0) to fully visible (1)
  //   rotateX / rotateZ / scale — a 3D "diagonal drop" (tilted, shrunk,
  //   angled) that straightens into a flat, full-size resting position
  //
  // Card 0 starts at progress 0 so the first card is already rising the moment
  // the section pins — previously nothing moved until 5–20% in, which read as a
  // blank screen. The last card finishes at 0.9 rather than 0.75, so there is
  // almost no dead scroll left at the end. The `yFrom` offsets are also much
  // smaller than the original 460–640px: a card that starts 640px low is far
  // below the fold, so most of its travel happened out of sight.
  /*
   * Ranges live in the "start end" progress space above, where ~0.556 is the pin
   * point. Each start is set to roughly the progress at which that card's top
   * crosses the viewport bottom, so every card begins fading in as it rises into
   * view — all four are already moving before the section pins, rather than the
   * section locking to a still screen and starting from there.
   *
   * Measured entry points at a 1465x800 viewport (card top → fully in view):
   *   01  0.217 → 0.379      02  0.276 → 0.438
   *   03  0.433 → 0.594      04  0.491 → 0.653
   *
   * `yFrom` stays small — a card starting 600px low (the original 460-640) does
   * most of its travel below the fold where none of it is visible.
   */
  const card0 = useCardReveal(smoothProgress, [0.2, 0.52], 150);
  const card1 = useCardReveal(smoothProgress, [0.27, 0.62], 190);
  const card2 = useCardReveal(smoothProgress, [0.4, 0.74], 170);
  const card3 = useCardReveal(smoothProgress, [0.48, 0.9], 210);
  const cardMotionValues = [card0, card1, card2, card3];

  // ── Hero entrance choreography (GSAP) ──
  const heroRef = useRef<HTMLElement>(null);
  const heroPillRef = useRef<HTMLSpanElement>(null);
  const heroHeadlineRef = useRef<HTMLHeadingElement>(null);
  const heroParagraphRef = useRef<HTMLParagraphElement>(null);
  const heroButtonsRef = useRef<HTMLDivElement>(null);
  const heroBtnPrimaryRef = useRef<HTMLAnchorElement>(null);
  const heroBtnSecondaryRef = useRef<HTMLAnchorElement>(null);
  const heroBtnGhostRef = useRef<HTMLAnchorElement>(null);
  const heroGraphicRef = useRef<HTMLDivElement>(null);
  const heroGraphicFloatRef = useRef<HTMLDivElement>(null);
  const heroGraphicParallaxRef = useRef<HTMLDivElement>(null);
  const heroSpotlightRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const headlineSplit = heroHeadlineRef.current
        ? new SplitText(heroHeadlineRef.current, { type: "words", wordsClass: "hero-word" })
        : null;
      if (headlineSplit) {
        gsap.set(headlineSplit.words, { display: "inline-block" });
      }

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        heroPillRef.current,
        { opacity: 0, y: -10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.7)" },
      )
        .fromTo(
          headlineSplit ? headlineSplit.words : heroHeadlineRef.current,
          { opacity: 0, y: 40, rotateX: -40, transformOrigin: "50% 100%" },
          { opacity: 1, y: 0, rotateX: 0, duration: 0.8, stagger: 0.08, ease: "power4.out" },
          "-=0.25",
        )
        .fromTo(
          heroParagraphRef.current,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.5 },
          "-=0.4",
        )
        .fromTo(
          // Collect only the refs that are actually mounted (secondary button
          // is absent when the user is already signed in).
          [heroBtnPrimaryRef.current, heroBtnSecondaryRef.current, heroBtnGhostRef.current].filter(Boolean),
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.08 },
          "-=0.3",
        )
        .fromTo(
          heroGraphicRef.current,
          { opacity: 0, scale: 0.96 },
          { opacity: 1, scale: 1, duration: 1.1, ease: "power2.out" },
          "-=1.0",
        )
        .fromTo(
          heroSpotlightRef.current,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.55 },
          "-=0.55",
        );

      if (heroGraphicFloatRef.current) {
        gsap
          .timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } })
          .to(heroGraphicFloatRef.current, { y: -16, rotation: 1.4, duration: 3.6 })
          .to(heroGraphicFloatRef.current, { y: 8, rotation: -1.1, duration: 4.2 });
      }

      let handlePointerMove: ((event: PointerEvent) => void) | null = null;
      let handlePointerLeave: (() => void) | null = null;
      const sectionEl = heroRef.current;

      if (sectionEl && heroGraphicParallaxRef.current) {
        const parallaxX = gsap.quickTo(heroGraphicParallaxRef.current, "x", {
          duration: 0.9,
          ease: "power3.out",
        });
        const parallaxY = gsap.quickTo(heroGraphicParallaxRef.current, "y", {
          duration: 0.9,
          ease: "power3.out",
        });

        handlePointerMove = (event: PointerEvent) => {
          const bounds = sectionEl.getBoundingClientRect();
          const relativeX = (event.clientX - bounds.left) / bounds.width - 0.5;
          const relativeY = (event.clientY - bounds.top) / bounds.height - 0.5;
          parallaxX(relativeX * 32);
          parallaxY(relativeY * 24);
        };
        handlePointerLeave = () => {
          parallaxX(0);
          parallaxY(0);
        };

        sectionEl.addEventListener("pointermove", handlePointerMove);
        sectionEl.addEventListener("pointerleave", handlePointerLeave);
      }

      const magneticCleanups: Array<() => void> = [];
      if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
        magneticCleanups.push(attachMagneticHover(heroBtnPrimaryRef.current, 0.3));
        magneticCleanups.push(attachMagneticHover(heroBtnSecondaryRef.current, 0.3));
        magneticCleanups.push(attachMagneticHover(heroBtnGhostRef.current, 0.3));
      }

      return () => {
        headlineSplit?.revert();
        if (sectionEl && handlePointerMove && handlePointerLeave) {
          sectionEl.removeEventListener("pointermove", handlePointerMove);
          sectionEl.removeEventListener("pointerleave", handlePointerLeave);
        }
        magneticCleanups.forEach((cleanup) => cleanup());
      };
    },
    { scope: heroRef },
  );

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8"
      >
        <div
          ref={heroGraphicRef}
          className="pointer-events-none absolute -top-10 right-[-6%] hidden h-[620px] w-[60%] lg:block"
          style={{ opacity: 0 }}
          aria-hidden
        >
          <div ref={heroGraphicFloatRef} className="h-full w-full">
            <div ref={heroGraphicParallaxRef} className="h-full w-full">
              <Hero3D className="h-full w-full" />
            </div>
          </div>
        </div>

        <div className="relative max-w-3xl">
          <span
            ref={heroPillRef}
            className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/8 px-3 py-1.5"
          >
            <span className="size-1.5 rounded-full bg-gold pulse-ring" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
              {upcoming.length > 0
                ? `${upcoming.length} event${upcoming.length === 1 ? "" : "s"} open`
                : "Season in planning"}
            </span>
          </span>

          <h1
            ref={heroHeadlineRef}
            className="display mt-6 text-[clamp(44px,9vw,86px)]"
            style={{ perspective: "600px" }}
          >
            Find your
            <br />
            <span className="text-gold">stride.</span>
          </h1>

          <p ref={heroParagraphRef} className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
            A running club that actually runs on time. Pick a session, sign the waiver, pay once,
            and turn up with a ticket in your pocket.
          </p>

          <div ref={heroButtonsRef} className="mt-9 flex flex-wrap items-center gap-3">
            <Link ref={heroBtnPrimaryRef} to="/calendar" className={buttonClass("gold", "lg", "sweep")}>
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
              <Link ref={heroBtnSecondaryRef} to="/signup" className={buttonClass("outline", "lg")}>
                Join the club
              </Link>
            )}
            <Link ref={heroBtnGhostRef} to="/leaderboard" className={buttonClass("ghost", "lg")}>
              This week's board
            </Link>
          </div>
        </div>

        {/* Next event spotlight */}
        <div ref={heroSpotlightRef} className="mt-14">
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
        </div>
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
              className="h-full"
            >
              <PillarCard pillar={p} />
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

      {/* ── By the numbers ─────────── */}
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

      {/* ── How it works — scroll-driven sticky section ───── */}
      {/*
        Runway is 180vh, so the inner sticky div pins for 80vh of scrolling.
        It was 300vh (2 full screens pinned), which read as an endless scroll
        with a blank screen at the start — and because the padding and the
        masonry push-down made the content 569px TALLER than the viewport, the
        lower cards were animating below the fold where nobody could see them.
        The spacing below is tuned to keep all four cards on screen at once;
        if a card grows, shorten these rather than lengthening the runway.
      */}
      <div
        ref={stickyRef}
        /* Only reserve a scroll runway on wide screens. On a phone the section
           is a normal-height block and the cards simply stack. */
        style={isWide ? { height: "180vh" } : undefined}
        className="relative"
      >
        {/* top-16, not top-0: the navbar is a 64px sticky band, so pinning flush
            to the viewport top put the "How it works" eyebrow underneath it.
            min-h is the viewport *minus* that bar — min-h-screen guaranteed a
            64px overflow at every window size. Neither applies below lg, where
            nothing is pinned. */}
        <div className={isWide ? "sticky top-16 min-h-[calc(100vh-4rem)] overflow-visible" : ""}>
          <div
            className={cn(
              "flex flex-col justify-start px-4 pb-[clamp(12px,1.5vw,20px)] pt-8 sm:px-6 lg:px-8",
              isWide ? "min-h-[calc(100vh-4rem)]" : "pb-14",
            )}
          >
            <div className="mx-auto w-full max-w-7xl">

              <p className="eyebrow mb-4 text-gold">How it works</p>
              <ScrollRevealText
                text="Four steps from curious to running."
                scrollProgress={smoothProgress}
                animate={isWide}
              />

              {/*
                Two layouts rather than one that reflows, because the desktop
                masonry puts 01/03 in the left column and 02/04 in the right —
                collapsing that to one column reads 01, 03, 02, 04. On a phone
                the steps have to run in order, so the narrow layout is a plain
                sequential list.
              */}
              {isWide ? (
                <div className="mt-5 flex gap-5" style={{ perspective: "1000px" }}>
                  {/* Left column — cards 01 and 03 */}
                  <div className="flex flex-1 flex-col gap-5">
                    <StepReveal motion={cardMotionValues[0]} animate>
                      <HowStepCard step={HOW_STEPS[0]} />
                    </StepReveal>
                    <StepReveal motion={cardMotionValues[2]} animate>
                      <HowStepCard step={HOW_STEPS[2]} />
                    </StepReveal>
                  </div>

                  {/* Right column — pushed down for masonry overlap. That offset
                      is added to the section height twice over (here and as
                      matching bottom padding), and at 240px it was what pushed
                      the lower cards off screen. */}
                  <div
                    className="flex flex-1 flex-col gap-5"
                    style={{ marginTop: "clamp(24px, 3vw, 44px)" }}
                  >
                    <StepReveal motion={cardMotionValues[1]} animate>
                      <HowStepCard step={HOW_STEPS[1]} />
                    </StepReveal>
                    <StepReveal motion={cardMotionValues[3]} animate>
                      <HowStepCard step={HOW_STEPS[3]} />
                    </StepReveal>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-4">
                  {HOW_STEPS.map((step) => (
                    <HowStepCard key={step.n} step={step} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Who it's for ─────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Reveal>
          <div className="datastrip mb-10" />
          <p className="eyebrow mb-2 text-gold">Where you fit</p>
          <h2 className="display text-[clamp(26px,3.6vw,38px)]">Three ways to be here.</h2>
        </Reveal>

        {/* 2-Column viewport split: left side reserved for future content, cards on the right */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center">

          {/* Left Column — the running figure */}
          <div className="hidden h-full min-h-[400px] w-full items-center justify-center lg:flex">
            <RunnerScene className="h-full w-full" />
          </div>

          {/* Right Column — Cards Grid Alignment (2 square cards on top, 1 full-width card underneath) */}
          <div className="grid gap-4">
            
            {/* Top row: Member and Volunteer side by side. Visitor is the
                full-width card below — it used to appear in this array too, so
                it rendered twice on the page.
                No `aspect-square`: forcing a square on a ~570px column left a
                large dead gap between the heading and the bullets, and made
                these two cards look unrelated to the wider one underneath. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              ].map((r, i) => (
                <Reveal key={r.role} delay={i * 0.07}>
                  <Tilt max={7} lift={9} className="h-full">
                    <Card hover className="hud edge-gold h-full p-6">
                      <span
                        className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
                        /* `${r.tint}1f` produced `var(--color-paid)1f` — not a
                           colour, so the pill background was silently dropped
                           and only the dot and label were tinted. */
                        style={{
                          background: `color-mix(in oklab, ${r.tint} 14%, transparent)`,
                          color: r.tint,
                        }}
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

            {/* Bottom Row: Card 3 spanning full width */}
            <Reveal delay={0.14}>
              <Tilt max={7} lift={9}>
                <Card hover className="hud edge-gold p-6">
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
                    style={{
                      background: "color-mix(in oklab, var(--color-ink-3) 14%, transparent)",
                      color: "var(--color-ink-3)",
                    }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: "var(--color-ink-3)" }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                      Visitor
                    </span>
                  </span>
                  <p className="display mt-4 text-[20px]">You're just looking.</p>
                  <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
                    {[
                      "Browse the calendar and gallery",
                      "See polls and the leaderboard",
                      "No account needed to look around",
                    ].map((perk) => (
                      <li key={perk} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-2">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gold" aria-hidden />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Tilt>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ── Community channels ───────────────────────────── */}
      {/* Sits mid-page, straight after "where you fit": someone who has just read
          how the club works is the person most likely to join a channel. */}
      <CommunityLinks />

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

      {/* ── Terms and conditions ─────────────────────────────
          Replaces the old "Turn up fifteen minutes early" section. The four
          cards still carry the on-the-day practicalities, but the heading and
          copy now point at the actual agreement, and the refund line comes
          from lib/policies so it cannot disagree with the refund page. */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Reveal>
          <div className="datastrip mb-10" />
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="eyebrow mb-2 text-gold">Terms and conditions</p>
              <h2 className="display text-[clamp(26px,3.6vw,38px)]">
                What you're agreeing to.
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
                Register for a session and you confirm you're medically fit to take part, and that
                you take part at your own risk. There's a briefing fifteen minutes before every
                start — the route, the junctions, where the marshals will be.
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                {REFUND_ONE_LINER} If the club cancels, everyone is refunded in full.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/terms" className={buttonClass("gold", "md")}>
                  Read the full terms
                </Link>
                <Link to="/refunds" className={buttonClass("outline", "md")}>
                  Refund policy
                </Link>
                <Link to="/privacy" className={buttonClass("ghost", "md")}>
                  Privacy
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { Icon: ClockIcon, t: "Briefing at −15", b: "Route, junctions, bag drop." },
                { Icon: PinIcon, t: "Marshalled corners", b: "Gold bibs. Follow their calls." },
                { Icon: TicketIcon, t: "Scan and go", b: "QR at the start line." },
                {
                  Icon: SparkIcon,
                  t: `Refunds to −${REFUND_WINDOW_HOURS}h`,
                  b: "Full refund before then.",
                },
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

// ── Sub-components ────────────────────────────────────────

/**
 * Scroll-driven character opacity reveal.
 * Each character fades from 0 → 1 (starts fully hidden) as scroll progress
 * passes its threshold, left to right across progress range 0.05 → 0.50.
 */

function ScrollRevealText({
  text,
  scrollProgress,
  animate = true,
}: {
  text: string;
  scrollProgress: ReturnType<typeof useSpring>;
  /** Off below `lg`, where the driving scroll progress never advances and every
      character would otherwise stay at opacity 0. */
  animate?: boolean;
}) {
  const chars = text.split("");
  if (!animate) {
    return <h2 className="display text-[clamp(26px,7vw,48px)] leading-tight">{text}</h2>;
  }
  return (
    <h2
      className="display text-[clamp(26px,3.6vw,48px)] leading-tight"
      aria-label={text}
    >
      {chars.map((char, i) => {
        /* Was 0.05 + (i/n) * 0.38 with a 0.1 window, so the last character did
           not finish until 53% of the section's scroll and the heading was
           entirely invisible at 0 — the section pinned to a blank screen. Now
           it starts writing on immediately and is fully readable by 25%. */
        const start = 0.06 + (i / chars.length) * 0.3;
        const end = start + 0.08;
        return (
          <CharSpan
            key={i}
            char={char}
            scrollProgress={scrollProgress}
            inputRange={[start, end]}
          />
        );
      })}
    </h2>
  );
}
/**
 * Single character — isolated so each only re-evaluates its own opacity range.
 */
function CharSpan({
  char,
  scrollProgress,
  inputRange,
}: {
  char: string;
  scrollProgress: ReturnType<typeof useSpring>;
  inputRange: [number, number];
}) {
  const opacity = useTransform(scrollProgress, inputRange, [0, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block whitespace-pre">
      {char}
    </motion.span>
  );
}

/**
 * "How it works" step card.
 *
 * Tall dark solid card — no border, no bracket, no grid overlay.
 * Large step number dominates the top half for typography contrast.
 * Graphic badge pill (icon + label) sits anchored below the number.
 */
function HowStepCard({
  step,
}: {
  step: {
    n: string;
    t: string;
    b: string;
    badge: { label: string; color: string; bg: string; icon: string };
  };
}) {
  return (
    <Tilt max={4} lift={10}>
      <div
        className="group relative overflow-hidden rounded-3xl"
        style={{
          background: "#111214",
          padding: "clamp(24px, 3vw, 32px)",
          /* Was clamp(260px, 30vw, 340px) — 340px on a desktop width, well past
             what the number + badge + two lines of copy need. Two stacked cards
             at that height could not fit a viewport alongside the headline, so
             the lower row sat below the fold for most of the scroll. */
          minHeight: "clamp(180px, 17vw, 230px)",
        }}
      >
        {/* One-pixel top-edge highlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "rgba(255,255,255,0.08)" }}
        />

        <p
          className="display leading-none tnum select-none"
          style={{
            fontSize: "clamp(56px, 8vw, 88px)",
            color: "rgba(255,255,255,0.08)",
            letterSpacing: "-0.03em",
          }}
        >
          {step.n}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
            style={{ background: step.badge.bg }}
          >
            <span className="text-[13px] leading-none" aria-hidden>
              {step.badge.icon}
            </span>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ color: step.badge.color }}
            >
              {step.badge.label}
            </span>
          </span>

          <span
            className="ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.3)",
            }}
          >
            STEP {step.n}
          </span>
        </div>

        <h3
          className="mt-5 font-semibold leading-tight text-white"
          style={{ fontSize: "clamp(17px, 2vw, 21px)" }}
        >
          {step.t}
        </h3>

        <p
          className="mt-2.5 text-[13px] leading-relaxed"
          style={{ color: "rgba(255,255,255,0.38)" }}
        >
          {step.b}
        </p>

        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `linear-gradient(to top, ${step.badge.bg}, transparent)`,
          }}
        />
      </div>
    </Tilt>
  );
}