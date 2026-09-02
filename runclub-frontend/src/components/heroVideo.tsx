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
export function HeroVideo({
  onAspect,
}: {
  /**
   * The clip's own width/height, reported once known.
   *
   * The hero needs it to size itself, because `object-fit: cover` crops to fill
   * whatever box it is given and the club's footage is 16:9 against a hero far
   * wider than that — 37% of the frame height was being thrown away at 1440,
   * 45% at 1920. Only the parent can fix that, and only if it knows the ratio.
   */
  onAspect?: (ratio: number) => void;
} = {}) {
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

  /*
   * YouTube always encodes and serves 16:9, and an iframe exposes nothing about
   * its content, so that is reported outright rather than measured. A file's
   * real dimensions arrive with its metadata — see onLoadedMetadata below.
   */
  useEffect(() => {
    if (kind === "youtube") onAspect?.(16 / 9);
  }, [kind, onAspect]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || kind !== "file" || calm) return;
    // Autoplay can still be refused (data saver, low power mode). Not an error
    // worth surfacing — the first frame stands as a still, and the page's own
    // background shows through where the clip does not reach.
    void el.play().catch(() => undefined);
  }, [src, kind, calm]);

  if (!src || !kind || failed) return null;

  const ytId = kind === "youtube" ? youtubeId(src) : null;

  /*
   * No edge mask. The clip fills the hero outright.
   *
   * It used to be feathered by a radial mask — an ellipse inscribed in the box,
   * which meant the four corners could never be reached and the picture always
   * read as an oval. Successive passes widened the opaque plateau from 38% to
   * 88% of the radius chasing that, which is the shape asking to be dropped
   * rather than tuned.
   *
   * Removing the mask on its own would have been worse than keeping it, and the
   * other two changes here are what make "no border" actually look like no
   * border:
   *
   *   1. Full-bleed. The hero section is `mx-auto max-w-7xl`, so this layer was
   *      1280px wide with page either side. Unmasked and container-width, the
   *      left and right edges become hard vertical lines at x=80 and x=1360 on
   *      a 1440 screen — a rectangle floating mid-page. `left-1/2 w-screen
   *      -translate-x-1/2` spans the viewport instead, putting those edges
   *      where a hard cut is unremarkable. The Shell clips overflow-x, so the
   *      ~15px of 100vw that a desktop scrollbar accounts for is trimmed rather
   *      than adding a scrollbar.
   *
   *   2. No darkening wash over the picture. The clip plays at full strength;
   *      the only thing on top of it is a 64-80px dissolve at the very bottom
   *      edge, which is there because that edge is otherwise a hard horizontal
   *      line the full width of the screen. Earlier versions of that gradient
   *      spanned most of the frame and were narrowed three times — 72px, 46px,
   *      31px — before being dropped and then reinstated as a border alone.
   *
   *   3. The hero sizes itself to the clip's own aspect ratio, reported through
   *      `onAspect`. `object-fit: cover` fills the box and crops the overflow,
   *      so a 16:9 clip in a 2.8:1 hero lost 37% of its frame height at 1440
   *      and 45% at 1920 — off the top and bottom, since object-position
   *      defaults to centre. With the box matching the ratio there is nothing
   *      left to crop vertically. The hero then asks for 80% of that height on
   *      purpose, trimming the top fifth — sky and treetops — and
   *      `object-bottom` is what puts the whole trim there rather than
   *      splitting it between top and bottom as centred cover would.
   *
   * The events pill carries its own near-opaque background rather than
   * borrowing contrast from a wash, which is what let the wash go. Gold text on
   * an 8% gold tint measured 1.6:1 over sunlit footage. See Landing.tsx.
   *
   * The left and right edges land at the viewport and the top sits below the
   * sticky navbar, so neither needs anything.
   */
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
    >
      {kind === "youtube" && ytId ? (
        calm ? (
          <img
            src={youtubeThumbnail(ytId)}
            alt=""
            className="h-full w-full object-cover object-bottom"
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
          className="h-full w-full object-cover object-bottom"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) onAspect?.(v.videoWidth / v.videoHeight);
          }}
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
          className="h-full w-full object-cover object-bottom"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) onAspect?.(v.videoWidth / v.videoHeight);
          }}
          onError={() => setFailed(true)}
        />
      )}

      {/* The dissolve, at the bottom edge only.
          Short on purpose — a border, not a wash. The clip's foot is a hard
          horizontal line the full width of the screen, and every earlier
          attempt at hiding it used a gradient spanning most of the frame; this
          one covers 64px on a phone and 80px above that, so the picture is
          untouched everywhere else. */}
      <div
        className="absolute inset-x-0 bottom-0 h-16 sm:h-20"
        style={{
          background:
            "linear-gradient(to top, rgb(8 9 11) 0%, rgb(8 9 11 / 0.72) 38%, transparent 100%)",
        }}
      />
    </div>
  );
}
