import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { cn } from "../lib/format";
import { Card } from "./ui";
import { TiltLayer } from "./tilt";

// Matches the previous <Tilt max={9} lift={10}> on this section, so the
// resting/entering feel is unchanged — only the mechanism moves to springs.
const TILT_MAX = 9;
const LIFT_PX = 10;
const SPRING = { stiffness: 300, damping: 28, mass: 0.6 };

/**
 * Stagger between each card's one-shot shine, once the grid scrolls into
 * view. Cards fire in index order, 1 card every STAGGER_MS, instead of all
 * at once.
 */
const STAGGER_MS = 1000;

export interface Pillar {
  Icon: (props: { className?: string }) => JSX.Element;
  title: string;
  body: string;
  /**
   * Revealed on hover. Drop the file at `public/pillars/<name>.jpg` and
   * point this at its served path, e.g. `/pillars/calendar.jpg`. Omit it to
   * skip the reveal for that card.
   */
  image?: string;
}

/**
 * A Pillars-grid card with:
 *  - Spring-driven 3D tilt on mouse/touch
 *  - Hover/tap image reveal (works on touch via onTouchStart/End)
 *  - A one-shot diagonal shine sweep 0.5 s after the image reveals
 *  - A one-shot staggered shine across the grid, fired once the card
 *    scrolls into view (index prop) — never repeats after that
 */
export function PillarCard({
  pillar,
  index = 0,
}: {
  pillar: Pillar;
  /** Position in the grid — drives the staggered one-shot shine delay. */
  index?: number;
}) {
  const [hovered, setHovered] = useState(false);
  // Drives the shine sweep: 0 = off-screen left, 1 = off-screen right.
  const shineX = useMotionValue(-1);
  // Ref so the one-shot visibility trigger can read the latest hovered value
  // without closing over a stale copy.
  const hoveredRef = useRef(false);
  hoveredRef.current = hovered;
  // The card's own element, so an IntersectionObserver can tell us when the
  // pillars section has actually scrolled into view.
  const cardRef = useRef<HTMLDivElement>(null);

  // Raw 0–1 cursor progress across the card. Centred (0.5, 0.5) at rest.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rotateXDeg = useTransform(py, [0, 1], [TILT_MAX, -TILT_MAX]);
  const rotateYDeg = useTransform(px, [0, 1], [-TILT_MAX, TILT_MAX]);
  const springRotateX = useSpring(rotateXDeg, SPRING);
  const springRotateY = useSpring(rotateYDeg, SPRING);
  const springLift = useSpring(hovered ? LIFT_PX : 0, SPRING);

  // Glare follows raw cursor (no spring lag).
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glareBackground = useMotionTemplate`radial-gradient(16rem circle at ${glareX} ${glareY}, rgb(255 255 255 / 0.14), transparent 46%)`;

  // Shine band: a skewed translucent strip that sweeps left → right.
  // shineX runs from -1 (fully off-screen left) to 2 (fully off-screen right)
  // and is expressed as a translateX percentage on the strip itself.
  const shineTranslate = useTransform(shineX, (v) => `${v * 100}%`);

  /** Fire the shine sweep once. Resets shineX so it can replay next time. */
  const fireShine = () => {
    shineX.set(-1);
    animate(shineX, 2, { duration: 0.7, ease: [0.4, 0, 0.2, 1] });
  };

  // ── One-shot shine: fires once the card scrolls into view, staggered by
  //    index, and never again. Re-arms on a full page reload since component
  //    state resets, but does not repeat while the page stays open. ──
  useEffect(() => {
    if (!pillar.image || !cardRef.current) return;

    let fired = false;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || fired) return;
        fired = true;
        observer.disconnect();

        delayTimer = setTimeout(() => {
          // Don't auto-shine if the user is already interacting with this card.
          if (!hoveredRef.current) fireShine();
        }, index * STAGGER_MS);
      },
      { threshold: 0.3 },
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
      if (delayTimer) clearTimeout(delayTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillar.image, index]);

  // ── Shine triggered by hover/tap reveal ──
  // Fires 0.5 s after hovered becomes true (after the image crossfade starts).
  useEffect(() => {
    if (!hovered || !pillar.image) return;
    const t = setTimeout(fireShine, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, pillar.image]);

  // ── Mouse handlers ──
  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    px.set(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    py.set(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)));
  };

  const handleEnter = () => {
    setHovered(true);
  };

  const handleLeave = () => {
    setHovered(false);
    px.set(0.5);
    py.set(0.5);
  };

  // ── Touch handlers ──
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    px.set(Math.min(1, Math.max(0, (touch.clientX - rect.left) / rect.width)));
    py.set(Math.min(1, Math.max(0, (touch.clientY - rect.top) / rect.height)));
    setHovered(true);
  };

  const handleTouchEnd = () => {
    setTimeout(() => {
      setHovered(false);
      px.set(0.5);
      py.set(0.5);
    }, 600);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="group relative h-full"
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        z: springLift,
        transformPerspective: 900,
        transformStyle: "preserve-3d",
      }}
    >
      <Card hover className="relative h-full overflow-hidden p-6 edge-gold">

        {/* ── Image reveal (hover/tap) ── */}
        {pillar.image && (
          <>
            <motion.img
              src={pillar.image}
              alt=""
              aria-hidden
              loading="lazy"
              className="pointer-events-none absolute inset-0 size-full object-cover"
              animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 1.05 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Dark gradient so text stays readable over the photo */}
            <motion.div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void/92 via-void/55 to-void/10"
              aria-hidden
              animate={{ opacity: hovered ? 1 : 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* ── Shine sweep ──
                A skewed translucent band that travels left → right once.
                mix-blend-mode overlay lets the image show through the shine
                rather than the band covering it with an opaque colour. */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-[45%] -skew-x-12"
              style={{
                translateX: shineTranslate,
                background:
                  "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.13) 40%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.13) 60%, transparent 100%)",
                mixBlendMode: "overlay",
              }}
            />
          </>
        )}

        {/* ── Cursor glare (mouse only) ── */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBackground }}
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* ── Card content ── */}
        <div className="relative h-full">
          <TiltLayer depth={34}>
            <motion.span
              animate={{ opacity: hovered ? 0 : 1, scale: hovered ? 0.85 : 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="grid size-10 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold"
              aria-hidden
            >
              <pillar.Icon className="size-[18px]" />
            </motion.span>
          </TiltLayer>

          <motion.h3
            layout
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "font-semibold text-ink",
              hovered
                ? "absolute bottom-0 left-0 text-[26px] leading-tight"
                : "static mt-4 text-[15px]",
            )}
          >
            {pillar.title}
          </motion.h3>

          <TiltLayer depth={18}>
            <motion.p
              animate={{ opacity: hovered ? 0 : 1 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 text-[13.5px] leading-relaxed text-ink-3"
            >
              {pillar.body}
            </motion.p>
          </TiltLayer>
        </div>
      </Card>
    </motion.div>
  );
}