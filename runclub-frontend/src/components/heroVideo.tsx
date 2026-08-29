import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useCalmMotion } from "../lib/motion";
import { useFetch } from "../lib/useFetch";
import { videoKind, youtubeEmbedUrl, youtubeId, youtubeThumbnail } from "../lib/video";

/**
 * Looping background video behind the home page hero.
 *
 * Accepts either a YouTube link or a video file URL, and works out which from
 * the value itself — an organiser pastes what they have rather than picking a
 * type first.
 *
 * Returns null unless one is set, so the 3D scene stays the default and nothing
 * changes on a fresh install.
 *
 * Muted and inline in both cases, because no browser autoplays audio and iOS
 * otherwise takes a video fullscreen the moment it starts.
 *
 * Skipped under reduced-motion: a looping clip is exactly what that setting
 * exists to stop. A still frame stands in — the poster for a file, YouTube's
 * own thumbnail for an embed.
 */
export function HeroVideo() {
  const calm = useCalmMotion();
  const load = useCallback(() => api.clubInfo(), []);
  const { data: club } = useFetch(load);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  const src = club?.hero_video_url ?? null;
  const kind = videoKind(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || kind !== "file" || calm) return;
    // Autoplay can still be refused (data saver, low power mode). Not an error
    // worth surfacing — the gradient underneath is a valid backdrop.
    void el.play().catch(() => undefined);
  }, [src, kind, calm]);

  if (!src || !kind || failed) return null;

  const ytId = kind === "youtube" ? youtubeId(src) : null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {kind === "youtube" && ytId ? (
        calm ? (
          <img
            src={youtubeThumbnail(ytId)}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          /*
           * The iframe is deliberately oversized and centred.
           *
           * YouTube always letterboxes to 16:9 inside whatever box it is given,
           * so at hero proportions a correctly-sized iframe shows black bars
           * top and bottom. Scaling it past the container and clipping gives
           * the same result `object-fit: cover` would, which an iframe has no
           * way to ask for.
           */
          <iframe
            title=""
            src={youtubeEmbedUrl(ytId)}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen={false}
            tabIndex={-1}
            className="absolute left-1/2 top-1/2 h-[max(100%,56.25vw)] w-[max(100%,177.78vh)] -translate-x-1/2 -translate-y-1/2 border-0"
          />
        )
      ) : calm ? (
        // One frame, no loop. `metadata` is enough to paint it without
        // fetching the whole clip.
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

      {/* Readability, but lighter than it was. With the headline gone the only
          text over this is the pill and the button, both of which carry their
          own background — so the clip can actually be seen. It still fades to
          --color-void at the bottom so the section dissolves into the page. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(8,9,11,0.55) 0%, rgba(8,9,11,0.4) 45%, var(--color-void) 100%)",
        }}
      />
    </div>
  );
}
