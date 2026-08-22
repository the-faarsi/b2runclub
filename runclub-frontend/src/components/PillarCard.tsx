import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useState, type MouseEvent } from "react";
import { cn } from "../lib/format";
import { Card } from "./ui";
import { TiltLayer } from "./tilt";

// Matches the previous <Tilt max={9} lift={10}> on this section, so the
// resting/entering feel is unchanged — only the mechanism moves to springs.
const TILT_MAX = 9;
const LIFT_PX = 10;
const SPRING = { stiffness: 300, damping: 28, mass: 0.6 };

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
 * A Pillars-grid card with a Framer Motion, spring-driven 3D tilt
 * (useMotionValue + useTransform + useSpring — standing in for the shared
 * CSS-var <Tilt> used elsewhere on this page) and a hover image reveal that
 * crossfades in behind the existing icon/title/body content.
 */
export function PillarCard({ pillar }: { pillar: Pillar }) {
  const [hovered, setHovered] = useState(false);

  // Raw 0–1 cursor progress across the card. Centred (0.5, 0.5) is the
  // resting position — no tilt, glare parked in the middle.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rotateXDeg = useTransform(py, [0, 1], [TILT_MAX, -TILT_MAX]);
  const rotateYDeg = useTransform(px, [0, 1], [-TILT_MAX, TILT_MAX]);
  const springRotateX = useSpring(rotateXDeg, SPRING);
  const springRotateY = useSpring(rotateYDeg, SPRING);
  const springLift = useSpring(hovered ? LIFT_PX : 0, SPRING);

  // The glare follows the raw cursor position directly (no spring lag),
  // same as the shared <Tilt>'s specular sweep.
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glareBackground = useMotionTemplate`radial-gradient(16rem circle at ${glareX} ${glareY}, rgb(255 255 255 / 0.14), transparent 46%)`;

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    px.set(nx);
    py.set(ny);
  };

  const handleLeave = () => {
    setHovered(false);
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
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
        {/* Hover image reveal — crossfades in behind the copy */}
        {pillar.image && (
          <>
            <img
              src={pillar.image}
              alt=""
              aria-hidden
              loading="lazy"
              className="pointer-events-none absolute inset-0 size-full scale-105 object-cover opacity-0 transition-[opacity,transform] duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-100 group-hover:opacity-100"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void/92 via-void/55 to-void/10 opacity-0 transition-opacity duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100"
              aria-hidden
            />
          </>
        )}

        {/* Specular sweep, tracking the raw cursor position */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBackground }}
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        />

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

          {/* Kept outside <TiltLayer> — its `transform` would otherwise become
              the containing block for this title's absolute positioning,
              anchoring it to the wrong (shrink-wrapped) box instead of this
              card-filling wrapper. `layout` gives the position/size jump a
              smooth FLIP transition instead of a hard cut. Sits between the
              icon and body in source order so resting (non-hover) flow still
              reads icon → title → body. */}
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