import { type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/format";
import { useCalmMotion } from "../lib/motion";

/**
 * Layout wrapper. The cursor-driven 3D tilt it used to apply has been removed.
 *
 * The rotation moved a card — and every control inside it — while the pointer
 * travelled across it. Aiming at a button meant the button shifting out from under
 * the cursor as you arrived, so clicks landed on the card instead. On dense pages
 * like the member directory, where each row carries Promote / Restrict, that made
 * the buttons feel broken.
 *
 * Deliberately kept as a component rather than deleted from ~20 call sites: it
 * still carries `className` (several callers rely on `h-full` for equal-height grid
 * cells), so removing the motion is a one-line change here instead of a risky
 * sweep. Hover feedback now comes from `Card`'s own border and background shift,
 * which changes no geometry.
 */
export function Tilt({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Accepted and ignored — kept so existing call sites still typecheck. */
  max?: number;
  lift?: number;
  glare?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

/**
 * Was a Z-offset layer inside <Tilt>. Now a passthrough, since without the 3D
 * parent a translateZ has nothing to project against.
 */
export function TiltLayer({
  children,
  className,
}: {
  children: ReactNode;
  depth?: number;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
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
