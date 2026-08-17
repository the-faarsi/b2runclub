import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/format";
import { useCalmMotion } from "../lib/motion";

/**
 * Cursor-driven 3D tilt.
 *
 * Rotation is written straight to CSS custom properties on the element rather
 * than through React state, so a pointer move never triggers a render. The
 * transform lives in CSS (see `.tilt` in index.css) which keeps it on the
 * compositor.
 *
 * Children can opt into depth with `.tilt-layer` + `--depth`, which lifts them
 * along Z so the card has genuine parallax rather than a flat skew.
 */
export function Tilt({
  children,
  className,
  /** Max rotation in degrees. Kept small — big angles hurt readability. */
  max = 7,
  /** Lift the whole card toward the viewer on hover. */
  lift = 6,
  /** Adds a moving specular sheen across the surface. */
  glare = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  lift?: number;
  glare?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number>();
  const calm = useCalmMotion();

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (calm) return;
      const el = ref.current;
      if (!el) return;

      // Coalesce to one write per frame; pointermove can fire far faster.
      if (raf.current) return;
      const { clientX, clientY } = e;

      raf.current = requestAnimationFrame(() => {
        raf.current = undefined;
        const r = el.getBoundingClientRect();
        const px = (clientX - r.left) / r.width;
        const py = (clientY - r.top) / r.height;

        el.style.setProperty("--ry", `${(px - 0.5) * 2 * max}deg`);
        el.style.setProperty("--rx", `${(0.5 - py) * 2 * max}deg`);
        el.style.setProperty("--lift", `${lift}px`);
        el.style.setProperty("--gx", `${px * 100}%`);
        el.style.setProperty("--gy", `${py * 100}%`);
        el.style.setProperty("--glare", "1");
      });
    },
    [calm, max, lift],
  );

  const reset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = undefined;
    }
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--lift", "0px");
    el.style.setProperty("--glare", "0");
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={cn("tilt", glare && "tilt-glare", className)}
      style={style}
    >
      {children}
    </div>
  );
}

/** Lifts its children toward the viewer inside a <Tilt>. */
export function TiltLayer({
  children,
  depth = 24,
  className,
}: {
  children: ReactNode;
  /** Z offset in px. Larger = floats further above the card. */
  depth?: number;
  className?: string;
}) {
  return (
    <div className={cn("tilt-layer", className)} style={{ "--depth": `${depth}px` } as CSSProperties}>
      {children}
    </div>
  );
}

/**
 * Two-sided card that rotates in 3D. Used for the QR ticket, where the flip
 * reads as turning a physical ticket over.
 */
export function FlipCard({
  flipped,
  front,
  back,
  className,
}: {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
  className?: string;
}) {
  const calm = useCalmMotion();

  return (
    <div className={cn("flip", className)} data-flipped={flipped} data-calm={calm}>
      <div className="flip-inner">
        <div className="flip-face">{front}</div>
        <div className="flip-face flip-back">{back}</div>
      </div>
    </div>
  );
}
