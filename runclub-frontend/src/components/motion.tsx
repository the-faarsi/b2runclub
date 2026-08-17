import { motion, useScroll, useSpring } from "framer-motion";
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "../lib/format";
import { DUR, EASE, riseIn, staggerParent, useCalmMotion, useCountUp } from "../lib/motion";

/* ── Scroll reveal ────────────────────────────────────────── */

/** Rises into place the first time it enters the viewport. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const Comp = motion[as];
  return (
    <Comp
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-70px" }}
      variants={{
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE, delay } },
      }}
      className={className}
    >
      {children}
    </Comp>
  );
}

/** Wrap a list; each direct <Stagger.Item> child follows the previous. */
export function Stagger({
  children,
  className,
  stagger = 0.06,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={staggerParent(stagger, delay)}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={riseIn} className={className}>
      {children}
    </motion.div>
  );
}

/* ── Spotlight card ───────────────────────────────────────── */

/**
 * A card that lights up under the cursor. The gradient position is written to
 * CSS custom properties rather than React state, so pointer moves never trigger
 * a re-render.
 */
export function Spotlight({
  children,
  className,
  strength = 0.09,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const calm = useCalmMotion();

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || calm) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      el.style.setProperty("--spot", "1");
    },
    [calm],
  );

  const onLeave = useCallback(() => {
    ref.current?.style.setProperty("--spot", "0");
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn("spotlight", className)}
      style={{ "--spot-strength": strength } as CSSProperties}
    >
      {children}
    </div>
  );
}

/* ── Animated number ──────────────────────────────────────── */

/** Counts up on mount. `format` receives the in-flight value. */
export function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString("en-IN"),
  className,
  duration,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const display = useCountUp(value, duration);
  return (
    <span className={className}>
      {format(display)}
    </span>
  );
}

/* ── Scroll progress ──────────────────────────────────────── */

/** Hairline gold progress bar pinned under the navbar. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const width = useSpring(scrollYProgress, { stiffness: 240, damping: 34, mass: 0.4 });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX: width }}
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-gold-deep via-gold to-gold-deep"
    />
  );
}

/* ── Count-up ring (used for fill/turnout) ────────────────── */

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  label,
}: {
  /** 0–1 */
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const calm = useCalmMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-mark-soft)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-mark)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: calm ? c * (1 - clamped) : c }}
          animate={{ strokeDashoffset: c * (1 - clamped) }}
          transition={{ duration: calm ? 0 : 1, ease: EASE }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums text-ink">
        {label ?? `${Math.round(clamped * 100)}%`}
      </span>
    </div>
  );
}

/* ── Celebration ──────────────────────────────────────────── */

/**
 * A short burst of gold confetti for a completed registration. Purely
 * decorative, skipped entirely under reduced-motion, and self-unmounting.
 */
export function Confetti({ show }: { show: boolean }) {
  const calm = useCalmMotion();
  const [pieces] = useState(() =>
    Array.from({ length: 26 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 320,
      rot: (Math.random() - 0.5) * 540,
      delay: Math.random() * 0.14,
      size: 5 + Math.random() * 6,
      tone: i % 3 === 0 ? "var(--color-gold-deep)" : "var(--color-gold)",
    })),
  );

  if (!show || calm) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/3 z-[70] grid place-items-center" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{ opacity: 0, x: p.x, y: 260, rotate: p.rot }}
          transition={{ duration: 1.5, delay: p.delay, ease: [0.2, 0.6, 0.4, 1] }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size * 0.42,
            borderRadius: 1,
            background: p.tone,
          }}
        />
      ))}
    </div>
  );
}
