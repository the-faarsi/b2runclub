import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useVelocity,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Link } from "react-router-dom";
import { ClubFeatures, JoinBanner } from "../components/clubFeatures";
import { CollaboratorScroller } from "../components/collaborators";
import { Founders } from "../components/founders";
import { HeroVideo } from "../components/heroVideo";
import { RunnerScene } from "../components/scene3d";
import { AnimatedNumber, Reveal } from "../components/motion";
import { Tilt } from "../components/tilt";
import { UpcomingScroller } from "../components/upcomingScroller";
import { buttonClass, Card } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, isPast } from "../lib/format";
import { useMediaQuery } from "../lib/motion";
import { useFetch } from "../lib/useFetch";

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

/** Small chevron for the "keep scrolling" hint — local rather than pulled
 *  from ../components/icons since this is a one-off, purely decorative mark. */
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 9l7 7 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const HOW_STEPS = [
  {
    n: "01",
    t: "Pick a session",
    b: "Route, start time and entry, all on the board.",
    badge: { label: "Calendar", color: "var(--color-gold)", bg: "rgba(233,185,73,0.13)", icon: "📅" },
  },
  {
    n: "02",
    t: "Sign the waiver",
    b: "Once, with an emergency contact.",
    badge: { label: "One time", color: "var(--color-free)", bg: "rgba(100,200,120,0.13)", icon: "✍️" },
  },
  {
    n: "03",
    t: "Pay in-app",
    b: "Card through Razorpay. Volunteers pay nothing.",
    badge: { label: "Secure pay", color: "var(--color-paid)", bg: "rgba(100,160,255,0.13)", icon: "💳" },
  },
  {
    n: "04",
    t: "Show your ticket",
    b: "We scan the QR at the start line.",
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

export function Landing() {
  const { user } = useAuth();

  const load = useCallback(() => api.events(), []);
  const { data: events, loading } = useFetch(load);


  const upcoming = (events ?? [])
    .filter((e) => e.status === "PUBLISHED" && !isPast(e.date_time))
    .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));

  const allEvents = events ?? [];

  /*
   * The hero clip's own width/height, once it reports one.
   *
   * Used to give the video area a matching height, because `object-fit: cover`
   * crops whatever does not fit: the club's 16:9 footage in a 2.8:1 hero lost
   * 37% of its frame height at 1440 and 45% at 1920, off the top and bottom.
   */
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  /*
   * Where the call to action goes: under the pill and over the picture on a
   * wide screen, below the whole clip on a phone. 40rem is Tailwind's `sm`.
   *
   * A hook rather than rendering it twice with `sm:hidden` on one copy. The
   * button carries a ref the intro timeline tweens, and a second copy would
   * leave that tween pointing at whichever mounted first — plus a duplicate
   * link for anyone reading the page with a screen reader.
   */
  const ctaOverVideo = useMediaQuery("(min-width: 40rem)");

  // ── Scroll refs for the "How it works" sticky section ──
  const stickyRef = useRef<HTMLDivElement>(null);

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

  // "Keep scrolling" hint (mobile/tablet, see the section below): fades in
  // just after the heading starts writing on and fades out as card 04
  // finishes, so it's never on screen for a fully blank or fully settled
  // frame.
  const scrollHintOpacity = useTransform(smoothProgress, [0, 0.05, 0.85, 0.97], [0, 1, 1, 0]);

  // Direction for that hint: points down while the wheel is moving the
  // section forward, flips to point up the moment the user backs out of it.
  // Read off the raw scrollYProgress (not the spring) — smoothProgress lags
  // by design, so its velocity briefly keeps the old sign for a beat after a
  // real direction change, which showed the wrong arrow right when it
  // mattered most. A small deadzone around 0 ignores the momentum-scroll
  // "settling" jitter at the top/bottom of a fling, which would otherwise
  // flicker the arrow between frames where velocity crosses zero.
  const rawVelocity = useVelocity(scrollYProgress);
  const [scrollDir, setScrollDir] = useState<"down" | "up">("down");
  useMotionValueEvent(rawVelocity, "change", (v) => {
    if (v > 0.02) setScrollDir("down");
    else if (v < -0.02) setScrollDir("up");
  });

  // ── Hero entrance choreography (GSAP) ──
  const heroRef = useRef<HTMLElement>(null);
  const heroPillRef = useRef<HTMLSpanElement>(null);
  const heroBtnPrimaryRef = useRef<HTMLAnchorElement>(null);
  const heroBtnSecondaryRef = useRef<HTMLAnchorElement>(null);
  const heroSpotlightRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        heroPillRef.current,
        { opacity: 0, y: -10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.7)" },
      )
        .fromTo(
          // Only the refs actually mounted — the secondary link is absent once
          // someone is signed in.
          [heroBtnPrimaryRef.current, heroBtnSecondaryRef.current].filter(Boolean),
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.08 },
          "-=0.55",
        )
        .fromTo(
          heroSpotlightRef.current,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.55 },
          "-=0.55",
        );


      const magneticCleanups: Array<() => void> = [];
      if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
        magneticCleanups.push(attachMagneticHover(heroBtnPrimaryRef.current, 0.3));
      }

      return () => {
        magneticCleanups.forEach((cleanup) => cleanup());
      };
    },
    { scope: heroRef },
  );

  /*
   * Built once and rendered in whichever of the two places the viewport calls
   * for. An element rather than a component, so the refs below attach exactly
   * once either way and the intro timeline finds them.
   */
  const heroCta = (
    <div className="flex flex-col items-center gap-4 text-center">
      <Link
        ref={heroBtnPrimaryRef}
        to={user ? "/calendar" : "/signup"}
        className={buttonClass(
          "gold",
          "lg",
          "sweep px-10 py-5 text-[18px] sm:px-14 sm:py-6 sm:text-[20px]",
        )}
      >
        {user ? "See the calendar" : "Join Us"}
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path
            d="M5 12h14m-6-6 6 6-6 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

      {/* Quiet second option for anyone not ready to sign up. A text link
          rather than a button, so the big one stays the only real call.

          The chip is added only where this sits over the picture. Unlike the
          button it has no background of its own, and gold on sunlit footage
          measured 2.19:1 against the 4.5:1 it needs. Below the clip there is
          nothing to protect it from, and the chip would be a faint outline
          around nothing. */}
      {!user && (
        <Link
          ref={heroBtnSecondaryRef}
          to="/calendar"
          className={cn(
            "tap text-[13.5px] text-gold transition-opacity hover:opacity-75",
            ctaOverVideo &&
              "rounded-full border border-gold/25 bg-void/95 px-3 py-1 backdrop-blur-md",
          )}
        >
          or see what's on →
        </Link>
      )}
    </div>
  );

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      {/* No clip here — the shell clips at the viewport instead. Clipping this
          section cut the 3D model off at the container edge, which on a wide
          screen is well inside the visible area. */}
      <section
        ref={heroRef}
        className="relative mx-auto max-w-7xl px-4 sm:px-6 sm:pb-10 lg:px-8"
      >
        {/*
          The video area. HeroVideo sits inside it as `absolute inset-y-0`, and
          `inset-y-0` resolves against this box's *padding* box — so the clip
          covers the padding too and still starts flush under the navbar, while
          this element's height is the only thing deciding the clip's height.

          That mattered: with the padding on the section instead, the clip's box
          was 80px taller than the ratio below asks for, and `object-cover` took
          those 80px back out of the frame — 40px off the top and 40px off the
          bottom. Which is why the bottom still looked cropped after the ratio
          was supposedly handled.

          Height is whichever is greater: the clamp, or 80% of what the clip
          needs to show its whole frame at the viewport's width. The 0.8 is the
          deliberate top crop — see object-bottom in heroVideo.tsx. The clamp
          stands in for the 3D graphic that used to hold this open, and wins on
          a phone, where the ratio alone would ask for 175px and leave the hero
          a thin band; there the crop lands on the sides instead, which is the
          axis with room to spare.
        */}
        <div
          className="relative flex flex-col items-center pt-14 text-center sm:pt-20"
          style={{
            minHeight: videoAspect
              ? `max(clamp(340px, 48vh, 520px), calc(100vw / ${videoAspect} * 0.8))`
              : "clamp(340px, 48vh, 520px)",
          }}
        >
          <HeroVideo onAspect={setVideoAspect} />
          <span
            ref={heroPillRef}
            className="relative inline-flex items-center gap-2 rounded-full border border-gold/35 bg-void/92 px-3 py-1.5 backdrop-blur-md"
          >
            <span className="size-1.5 rounded-full bg-gold pulse-ring" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
              {upcoming.length > 0
                ? `${upcoming.length} event${upcoming.length === 1 ? "" : "s"} open`
                : "Season in planning"}
            </span>
          </span>

          {/* Over the picture, directly under the pill — wide screens only. */}
          {ctaOverVideo && <div className="relative mt-7 sm:mt-9">{heroCta}</div>}
        </div>
      </section>

      {/* Phone: below the clip rather than on it. At 390px the picture crops
          to a near-square and the group fills it, so a button in the middle of
          that covers faces — and there is far less room above the fold to spend
          on a stack. On `sm` and up it renders under the pill instead; see the
          section above. */}
      {!ctaOverVideo && (
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">{heroCta}</div>
      )}

      {/* ── Next up ───────────────────────────────────────── */}
      {/*
        Its own section, deliberately outside the hero.

        It used to sit inside it, and HeroVideo covers the hero with an
        absolutely positioned layer — so on a phone, where the hero is short,
        this card lay across most of the video. Moving it below means the clip
        is only ever behind the model and the button.
      */}
      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      {/* Next event spotlight — one panel per upcoming session, so the whole
          block is readable here rather than only the soonest one. */}
      <div ref={heroSpotlightRef} className="mt-14">
        <UpcomingScroller events={upcoming} loading={loading} />
      </div>
      </section>



      {/* ── Club, in numbers ─────────────────────────────── */}
      {/* A hairline row rather than four tilting cards. The numbers are the
          only part anyone reads, and on a page whose job is to get somebody to
          join, four more cards was four more things to look at.

          A third figure, "Club km", used to sit here. It came from a
          leaderboard endpoint whose numbers were generated by a formula rather
          than measured, and only for accounts that never existed — so it always
          read 0. It went with the integration that fed it. */}
      <Reveal>
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rule-gold mb-8" />
          {/* Both figures are links into the list view. They point at the "All"
              tab in both cases because both are counted across every event —
              land someone on the Upcoming tab and the total they just clicked
              would not match what they are looking at. "Open now" adds
              ?highlight=open, which picks its own subset out of that list. */}
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                label: "Sessions",
                value: allEvents.length,
                to: "/events?filter=all",
                aria: `${allEvents.length} sessions in total — see the full list`,
              },
              {
                label: "Open now",
                value: upcoming.length,
                to: "/events?filter=all&highlight=open",
                aria: `${upcoming.length} sessions open for entry — see them in the list`,
              },
            ].map((s) => (
              <Link
                key={s.label}
                to={s.to}
                aria-label={s.aria}
                className="group block rounded-xl px-2 py-1 text-center transition-colors hover:bg-white/4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:text-left"
              >
                <p className="display foil text-[clamp(30px,6vw,52px)] leading-none">
                  <AnimatedNumber value={s.value} format={(v) => `${Math.round(v)}`} />
                </p>
                {/* The arrow shows at rest, not only on hover — a bare number
                    with a label gives a reader no reason to think it is
                    clickable, and this is the only cue that it is. */}
                <p className="eyebrow mt-2 inline-flex items-center gap-1.5 transition-colors group-hover:text-gold">
                  {s.label}
                  <span
                    aria-hidden
                    className="opacity-45 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
                  >
                    →
                  </span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Inside the club ──────────────────────────────── */}
      {/* High up on purpose. This is what someone is actually deciding about,
          and it used to be absent from the page entirely — the club's own
          features were only discoverable after signing up. */}
      <ClubFeatures />

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
        style={{ height: "180vh" }}
        className="relative"
      >
        {/* top-16, not top-0: the navbar is a 64px sticky band, so pinning flush
            to the viewport top put the "How it works" eyebrow underneath it. */}
        {/* min-h capped at 640px below lg: uncapped min-h-[calc(100vh-4rem)]
            forced this box to the full device height, but the mobile content
            (heading + two 180px-floor cards per column) only ever needs
            ~550-600px — on tall-screen phones that left 200px+ of dead space
            under the last card. The cap doesn't touch the outer 180vh runway
            or the scroll-progress math below (both are driven by stickyRef's
            own fixed height, not by this box), so the reveal/card timing is
            unaffected — only the leftover blank space shrinks. Desktop keeps
            the uncapped height since the larger cards there actually use it. */}
        <div className="sticky top-16 min-h-[min(calc(100vh-4rem),640px)] overflow-visible lg:min-h-[calc(100vh-4rem)]">
          <div className="flex min-h-[min(calc(100vh-4rem),640px)] flex-col justify-start px-4 pb-[clamp(12px,1.5vw,20px)] pt-8 sm:px-6 lg:min-h-[calc(100vh-4rem)] lg:px-8">
            <div className="mx-auto w-full max-w-7xl">

              <p className="eyebrow mb-4 text-gold">How it works</p>
              <ScrollRevealText
                text="Four steps from curious to running."
                scrollProgress={smoothProgress}
                animate
              />

              <div className="mt-5 flex gap-5" style={{ perspective: "1000px" }}>
                {/* Left column — cards 01 and 03. min-w-0 overrides the flex
                    default of min-width: auto, which otherwise refuses to
                    shrink a flex item below its content's intrinsic width —
                    that's what previously overflowed narrow viewports by up
                    to 96px and forced the page to scroll sideways. */}
                <div className="flex min-w-0 flex-1 flex-col gap-5">
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
                  className="flex min-w-0 flex-1 flex-col gap-5"
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
            </div>
          </div>

          {/* Scroll hint — mobile/tablet only (lg+ shows every card at once
              with no dead scroll, so the cue would be redundant there). This
              section pins in place while the page keeps scrolling behind it,
              which reads as "stuck" if someone pauses mid-reveal; the
              bouncing chevrons say keep going. Opacity rides the same
              scrollProgress driving the heading/cards: hidden at progress 0
              (nothing to hint at yet), in by ~0.05 (right as the heading
              starts revealing), and back out by ~0.9 as the last card
              finishes and the section is about to unpin.
              Direction flips with scrollDir: rotating the whole pair 180°
              both turns the chevrons into an "up" mark and flips the
              child's own downward bounce into an upward one (the bounce is
              defined in the child's local space, so the parent's rotate
              carries it along) — so scrolling back up shows the arrows
              pointing and flowing the way that motion is actually going. */}
          <motion.div
            aria-hidden
            style={{ opacity: scrollHintOpacity }}
            className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center lg:hidden"
          >
            <motion.div
              animate={{ y: [0, 7, 0], rotate: scrollDir === "up" ? 180 : 0 }}
              transition={{
                y: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 0.25, ease: "easeOut" },
              }}
              className="flex flex-col items-center text-ink-3"
            >
              <ChevronDownIcon className="h-5 w-5" />
              <ChevronDownIcon className="-mt-3 h-5 w-5 opacity-45" />
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ── Who it's for ─────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Reveal>
          <div className="datastrip mb-10" />
          <p className="eyebrow mb-2 text-gold">How you join</p>
          <h2 className="display text-[clamp(26px,3.6vw,38px)]">Two ways to join.</h2>
        </Reveal>

        {/* 2-Column viewport split: left side reserved for future content, cards on the right */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center">

          {/* Left Column — the running figure */}
          <div className="hidden h-full min-h-[400px] w-full items-center justify-center lg:flex">
            <RunnerScene className="h-full w-full" />
          </div>

          {/* Right column — the two ways in */}
          <div className="grid gap-4">
            
            {/* Member and Volunteer. The third card told visitors they were
                allowed to browse, which they were already doing.
                No `aspect-square`: forcing a square on a ~570px column left a
                large dead gap between the heading and the bullets, and made
                these two cards look unrelated to the wider one underneath. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  role: "Member",
                  tint: "var(--color-paid)",
                  line: "You want to run.",
                  perks: ["Register for any session", "Pay once, carry a QR ticket", "Vote on the routes"],
                },
                {
                  role: "Volunteer",
                  tint: "var(--color-free)",
                  line: "You want to marshal.",
                  perks: ["Entry comped, every event", "Club ID card, junction calls", "Post to the gallery"],
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

          </div>
        </div>
      </section>

      {/* ── Founders ─────────────────────────────────────── */}
      {/* Before the contact section on purpose: knowing who runs the thing is
          what makes someone want to get in touch. Renders nothing until an
          organiser adds people at /admin/founders. */}
      <Founders />




      <CollaboratorScroller />

      {/* ── The ask ──────────────────────────────────────── */}
      {/* One join panel, last. There used to be this and a mid-page banner and
          a separate closing card; on a page this short, one is enough. Renders
          nothing for anyone already signed in. */}
      <JoinBanner />

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
  /* 26px floor overflowed to a wrapped second line on narrow phones — 3.6vw
     (and 7vw here) only overtakes a 26px floor above a ~370-720px viewport,
     so anything narrower was stuck at a flat 26px regardless of how little
     room there was, and "Four steps from curious to running." doesn't fit
     26px on a ~320-430px-wide screen. Lowering the floor to 20px and raising
     the slope to 6.5vw makes it actually shrink on those widths (~21-27px
     depending on device) while landing back on the same values as before at
     sm/lg breakpoints, where there was already room to spare. */
  if (!animate) {
    return <h2 className="display text-[clamp(20px,6.5vw,48px)] leading-tight">{text}</h2>;
  }
  return (
    <h2
      className="display text-[clamp(20px,6.5vw,48px)] leading-tight"
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
        className="group relative flex flex-col justify-between overflow-hidden rounded-3xl"
        style={{
          background: "#111214",
          padding: "clamp(24px, 3vw, 32px)",
          /* Was clamp(260px, 30vw, 340px) — 340px on a desktop width, well past
             what the number + badge + two lines of copy need. Two stacked cards
             at that height could not fit a viewport alongside the headline, so
             the lower row sat below the fold for most of the scroll. Left as-is
             here (not shrunk for the mobile no-description case) since this
             feeds the sticky-runway/masonry height math above — the space
             freed by hiding the description on mobile is instead redistributed
             below via `justify-between`, not by shrinking the card. */
          minHeight: "clamp(180px, 17vw, 230px)",
        }}
      >
        {/* One-pixel top-edge highlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "rgba(255,255,255,0.08)" }}
        />

        {/* Top group — number + badge row */}
        <div>
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

          <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
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
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest sm:ml-auto"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              STEP {step.n}
            </span>
          </div>
        </div>

        {/* Bottom group — title (+ description, sm and up). justify-between
            on the card pins this to the bottom, so hiding the description on
            mobile pushes the title down into the freed space instead of
            leaving a gap underneath it. */}
        <div className="mt-5">
          <h3
            className="font-semibold leading-tight text-white"
            style={{ fontSize: "clamp(17px, 2vw, 21px)" }}
          >
            {step.t}
          </h3>

          <p
            className="mt-2.5 hidden text-[13px] leading-relaxed sm:block"
            style={{ color: "rgba(255,255,255,0.38)" }}
          >
            {step.b}
          </p>
        </div>

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