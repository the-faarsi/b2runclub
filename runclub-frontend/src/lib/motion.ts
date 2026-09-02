import { useEffect, useRef, useState } from "react";
import { useReducedMotion, type Transition, type Variants } from "framer-motion";

/* One easing curve and a few durations, shared by everything, so the whole app
 * moves with the same character. Matches --ease-out-expo in index.css. */

export const EASE = [0.16, 1, 0.3, 1] as const;

export const DUR = {
  fast: 0.18,
  base: 0.32,
  slow: 0.5,
  reveal: 0.62,
} as const;

export const spring: Transition = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 };

/** Soft rise, used for anything entering the viewport. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.slow, ease: EASE } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: DUR.base, ease: EASE } },
};

/** Parent that releases children one after another. */
export function staggerParent(stagger = 0.06, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
}

/** Page-level route transition. */
export const pageIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
};

/**
 * framer-motion's hook returns null before hydration; normalise to a boolean so
 * callers can branch without null checks.
 */
export function useCalmMotion(): boolean {
  return useReducedMotion() === true;
}

/**
 * Live answer to a media query.
 *
 * For the cases a Tailwind breakpoint cannot reach — where the *structure*
 * differs between viewports rather than the styling, so the same element has to
 * be rendered in a different place. Rendering it twice and hiding one copy is
 * the usual trick and it is wrong here: duplicated refs mean an intro animation
 * that only reaches one of them, and duplicated ids and links for a screen
 * reader.
 *
 * Watched rather than read once, so resizing a window or rotating a tablet is
 * handled.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

/**
 * Counts from 0 to `value` with an ease-out curve. Returns the target directly
 * when the viewer prefers reduced motion, so no number ever animates for them.
 */
export function useCountUp(value: number, duration = 900) {
  const calm = useCalmMotion();
  const [display, setDisplay] = useState(calm ? value : 0);
  const frame = useRef<number>();
  const from = useRef(0);

  useEffect(() => {
    if (calm) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic — decelerates without overshooting.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(origin + delta * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else from.current = value;
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, duration, calm]);

  return display;
}

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Live countdown to an ISO timestamp, re-rendering once a second. */
export function useCountdown(iso: string): Remaining {
  const target = new Date(iso).getTime();

  const compute = (): Remaining => {
    const ms = target - Date.now();
    if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
    return {
      days: Math.floor(ms / 86400000),
      hours: Math.floor((ms % 86400000) / 3600000),
      minutes: Math.floor((ms % 3600000) / 60000),
      seconds: Math.floor((ms % 60000) / 1000),
      done: false,
    };
  };

  const [left, setLeft] = useState(compute);

  useEffect(() => {
    setLeft(compute());
    if (target <= Date.now()) return;
    const id = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return left;
}

/** Tracks whether the window has scrolled past a threshold. */
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}
