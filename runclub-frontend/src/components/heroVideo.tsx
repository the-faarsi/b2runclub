import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useCalmMotion } from "../lib/motion";
import { useFetch } from "../lib/useFetch";

/**
 * Looping background video behind the home page hero.
 *
 * Returns null unless an organiser has set one, so the 3D scene stays the
 * default and nothing changes on a fresh install. The URL is stored on the club
 * record and edited from the organiser dashboard.
 *
 * Muted and `playsInline`, because every browser blocks autoplay of anything
 * with sound and iOS otherwise takes the video fullscreen the moment it starts.
 *
 * Skipped entirely under reduced-motion: a looping clip is exactly the kind of
 * thing that setting exists to stop, and the poster frame carries the same
 * picture without the movement.
 */
export function HeroVideo() {
  const calm = useCalmMotion();
  const load = useCallback(() => api.clubInfo(), []);
  const { data: club } = useFetch(load);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  const src = club?.hero_video_url ?? null;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src || calm) return;
    // Autoplay can still be refused (data saver, low power mode). That is not
    // an error worth surfacing — the gradient underneath is a valid backdrop.
    void el.play().catch(() => undefined);
  }, [src, calm]);

  if (!src || failed) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {calm ? (
        // Reduced motion: one frame, no loop. `preload="metadata"` is enough to
        // paint the poster without fetching the whole clip.
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}

      {/* Readability. The hero carries display type at up to 76px over this, and
          an unmasked clip makes all of it illegible. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(8,9,11,0.78) 0%, rgba(8,9,11,0.62) 45%, var(--color-void) 100%)",
        }}
      />
    </div>
  );
}
