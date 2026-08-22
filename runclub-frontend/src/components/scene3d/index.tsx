import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { cn } from "../../lib/format";
import { useCalmMotion } from "../../lib/motion";
import { RouteGraphic, TrackGraphic } from "../icons";
import type { SceneVariant } from "./scenes";

/**
 * The single lazy boundary for all WebGL in the app.
 *
 * `./scenes` is imported in exactly one place, so three.js lives in one chunk
 * that downloads on the first 3D page and is then cached for every other route.
 * If three.js ever shows up in the main bundle, something imported it eagerly.
 */
const Scene = lazy(() => import("./scenes"));

export type { SceneVariant };

/** Cheap capability probe; a failed context means we stay on the flat SVG. */
function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

/**
 * Ambient 3D backdrop for a page.
 *
 * Gated three ways, because one canvas per route adds up:
 *  - only above the `lg` breakpoint (a phone would download ~223KB for
 *    something the layout hides, and pay the GPU cost on a battery),
 *  - only when WebGL is actually available,
 *  - fetched after idle, so page content paints first.
 *
 * It renders behind the content and never takes pointer events.
 */
export function PageScene({
  variant,
  className,
  /** 0–1. Backdrops sit low so text stays the subject. */
  opacity = 0.5,
  /** Swap the SVG stand-in — the route trace suits wide heroes. */
  fallback = "track",
  /** Skip the corner placement + mask; the hero positions itself. */
  unmasked = false,
}: {
  variant: SceneVariant;
  className?: string;
  opacity?: number;
  fallback?: "track" | "route" | "none";
  unmasked?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const calm = useCalmMotion();

  useEffect(() => {
    // Someone asking for reduced motion almost certainly does not want a
    // WebGL canvas either. Skipping the mount entirely is both a stronger
    // guarantee than "render a single frame" and free of GPU cost — and it
    // means the chunk is never fetched for them.
    if (calm) return;

    const wide = window.matchMedia("(min-width: 1024px)");
    if (!wide.matches) {
      const onChange = () => wide.matches && setEnabled(true);
      wide.addEventListener("change", onChange);
      return () => wide.removeEventListener("change", onChange);
    }

    if (!webglAvailable()) return;

    const idle = (
      window as unknown as { requestIdleCallback?: (cb: () => void) => number }
    ).requestIdleCallback;

    if (idle) {
      const handle = idle(() => setEnabled(true));
      return () => {
        (window as unknown as { cancelIdleCallback?: (h: number) => void })
          .cancelIdleCallback?.(handle);
      };
    }
    const t = setTimeout(() => setEnabled(true), 350);
    return () => clearTimeout(t);
  }, [calm]);

  const flat =
    fallback === "none" ? null : fallback === "route" ? (
      <RouteGraphic className="h-full w-full text-ink" />
    ) : (
      <TrackGraphic className="h-full w-full text-ink" />
    );

  return (
    <div
      aria-hidden
      className={cn(
        // Offset into the top-right rather than stretched behind the content:
        // cards are translucent (bg-surface/80 + blur), so a full-bleed scene
        // reads as bleed-through under text instead of depth.
        /* right-0, not right-[-8%]. Hanging the backdrop 8% past the right edge
           widened the document by ~10px and gave every page with a scene a real
           horizontal scrollbar. It is decorative and -z-10, so nothing is lost
           by keeping it inside the viewport. */
        "pointer-events-none absolute -top-16 right-0 -z-10 hidden h-[min(78vh,680px)] w-[64%] overflow-hidden lg:block",
        className,
      )}
      style={{
        opacity,
        // Fade out toward the content so nothing competes with copy.
        ...(unmasked
          ? {}
          : {
              maskImage:
                "radial-gradient(115% 100% at 88% 12%, black 12%, rgba(0,0,0,0.55) 46%, transparent 76%)",
              WebkitMaskImage:
                "radial-gradient(115% 100% at 88% 12%, black 12%, rgba(0,0,0,0.55) 46%, transparent 76%)",
            }),
      }}
    >
      {enabled && !failed && !calm ? (
        <SceneBoundary onError={() => setFailed(true)} fallback={flat}>
          <Suspense fallback={flat}>
            <Scene variant={variant} />
          </Suspense>
        </SceneBoundary>
      ) : (
        flat
      )}
    </div>
  );
}

/**
 * Prominent hero canvas for the landing page — same chunk, but positioned by
 * the caller rather than stretched behind the content.
 */
export function Hero3D({ className }: { className?: string }) {
  return (
    <PageScene
      variant="ribbon"
      unmasked
      className={cn("!static !inset-auto !z-0 !block !h-full !w-full", className)}
      opacity={1}
      fallback="route"
    />
  );
}

/**
 * The animated running figure for the "who it's for" section — same
 * in-flow positioning as Hero3D (not the absolutely-positioned corner
 * backdrop PageScene defaults to), just a different variant/fallback.
 */
export function RunnerScene({ className }: { className?: string }) {
  return (
    <PageScene
      variant="runner"
      unmasked
      className={cn("!static !inset-auto !z-0 !block !h-full !w-full", className)}
      opacity={1}
      fallback="track"
    />
  );
}

/* A WebGL context can fail at runtime (driver, blocklist, lost context), and
 * only a class component can catch that. */
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: () => void },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Not fatal — the flat graphic covers it. Logged for diagnosis only.
    console.warn("3D scene unavailable, falling back to the flat graphic:", error, info);
    this.props.onError();
  }

  render() {
    return this.state.crashed ? this.props.fallback : this.props.children;
  }
}