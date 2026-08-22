import { useRef, useState } from "react";
import { cn } from "../lib/format";
import { useCalmMotion } from "../lib/motion";

/** Where to drop the artwork. Transparent PNG or WebP, ~800px wide is plenty. */
const LOGO_SRC = "/creators/wtf-logo.png";

/**
 * The creators' mark — "WTF · With Thariq & faarsi" — not the club's own logo.
 *
 * Tilts in 3D toward the cursor, with a sheen that tracks the pointer and a
 * soft glow behind the artwork.
 *
 * Deliberately NOT a link, and nothing interactive sits inside it. A transform
 * that follows the pointer moves the element continuously, so if it wrapped a
 * control the mousedown and mouseup would land on different things and the
 * browser would never emit a `click` — the exact fault that made the page-header
 * buttons feel dead. Keeping this purely decorative means the effect cannot
 * cost anyone a click.
 *
 * The tilt is written straight to CSS custom properties on pointermove rather
 * than through React state, so moving the cursor does not re-render anything.
 */
export function CreatorsLogo({
  className,
  height = 72,
}: {
  className?: string;
  /** Rendered height of the mark in px. The artwork is 1672×941, so the width
      is ~1.78× this. Below ~60px the "With Thariq & faarsi" subtitle inside the
      artwork stops being legible. */
  height?: number;
}) {
  const calm = useCalmMotion();
  const stage = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Touch and stylus get the static mark: a hover tilt they cannot trigger
    // is just jitter when scrolling past.
    if (calm || e.pointerType !== "mouse") return;
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0 → 1
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(px - 0.5) * 26}deg`);
    el.style.setProperty("--rx", `${(0.5 - py) * 18}deg`);
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.setProperty("--lift", "1");
  };

  const reset = () => {
    const el = stage.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--lift", "0");
  };

  return (
    <div
      className={cn("creator-stage", className)}
      style={{ perspective: "700px" }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
    >
      <div ref={stage} className="creator-tilt">
        {/* Glow behind the mark, brightest where the cursor is. */}
        <span className="creator-glow" aria-hidden />

        {failed ? (
          // The artwork is optional — without it the credit still reads.
          <span className="creator-fallback">
            WTF<span className="creator-fallback-sub">With Thariq &amp; faarsi</span>
          </span>
        ) : (
          <img
            src={LOGO_SRC}
            alt="WTF — With Thariq and faarsi, creators of this application"
            height={height}
            style={{ height }}
            className="creator-img"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}

        {/* Cursor-tracking sheen across the artwork. */}
        <span className="creator-sheen" aria-hidden />
      </div>
    </div>
  );
}

/**
 * The footer credit line: a label plus the mark. Rendered inside <Shell>, so it
 * appears for every role — visitor, member, volunteer and admin alike.
 */
export function CreatorsCredit({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">
        Built by
      </span>
      <CreatorsLogo />
    </div>
  );
}
