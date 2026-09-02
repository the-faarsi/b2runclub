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

  /*
   * Feathered edges, so the clip dissolves into the page instead of sitting in
   * a rectangle.
   *
   * Only the bottom used to fade, via the dark gradient below — the left, right
   * and top edges ended on a hard line, and because the hero is a max-w-7xl
   * column rather than full-bleed, those two vertical seams landed in the middle
   * of the screen on a wide display.
   *
   * The mask is on the wrapper rather than the video, so the darkening overlay
   * fades with it. Masking only the video would leave the overlay covering the
   * full box, which reads as a slightly-darker-than-the-page rectangle — the
   * same problem in a subtler form.
   *
   * One radial layer, not two composited linear ones: `mask-composite` needs a
   * different keyword on WebKit (`source-in`) than everywhere else
   * (`intersect`), and getting that pair wrong hides the video completely in
   * Safari. An ellipse fades all four edges on its own.
   *
   * `farthest-side` rather than a percentage radius. A radial gradient's
   * percentage radii are measured against the box's full width and height, so
   * the 120% I first wrote put the left and right edges at only ~42% along the
   * gradient — still solid black in the mask — and the fade played out beyond
   * the element where there is nothing to fade. `farthest-side` makes 100% land
   * exactly on each edge, so `transparent 100%` means transparent at the border.
   *
   * The stops were 38% / 0.5 at 76% / 0 at 100%, which held the clip fully
   * opaque across only the middle 38% of the radius and spent the other 62%
   * fading. That is a vignette rather than a feathered edge: it squeezed the
   * picture into a small oval and dimmed the faces at the ends of the group.
   *
   * Now the plateau reaches 72% and the whole falloff happens in the outer 28%.
   * Along the horizontal centre line, where 100% is the left or right border:
   *
   *      radius     50%     76%     88%     95%
   *      was       0.84    0.50    0.25    0.10
   *      now       1.00    0.94    0.75    0.36
   *
   * So the fade is narrower (28% of the radius instead of 62%), shallower at
   * every point, and covers less of the frame — while still dissolving all four
   * edges, which is what stops the two vertical seams appearing mid-screen on a
   * wide display.
   */
  const featherMask =
    "radial-gradient(farthest-side ellipse at 50% 50%, #000 72%, rgba(0,0,0,0.72) 90%, transparent 100%)";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{ maskImage: featherMask, WebkitMaskImage: featherMask }}
    >
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

      {/* Readability. Kept light — the only text over this is the pill and the
          button, both of which carry their own background. It no longer has to
          reach solid --color-void at the bottom, because the mask above now
          feathers the whole layer out and the page shows through by itself. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(8,9,11,0.5) 0%, rgba(8,9,11,0.36) 45%, rgba(8,9,11,0.68) 100%)",
        }}
      />
    </div>
  );
}
