import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ClubEvent, RouteGeometry } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { RouteGraphic } from "./icons";
import { Button, Card, EmptyState, Skeleton, useToast } from "./ui";

/** Padding inside the 0–1 viewBox so the stroke never clips at the edge. */
const PAD = 0.06;

function toPath(points: { x: number; y: number }[]) {
  const span = 1 - PAD * 2;
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(PAD + p.x * span).toFixed(4)} ${(PAD + p.y * span).toFixed(4)}`)
    .join(" ");
}

/**
 * The course, drawn as an SVG path from the event's GPX.
 *
 * The backend normalises the track to a 0–1 box with the aspect ratio preserved,
 * so this needs no mapping library, no tile server and no API key — which also
 * means it works offline and costs nothing per view.
 */
function TrackShape({ geo }: { geo: RouteGeometry }) {
  const reduced = useReducedMotion();
  const path = toPath(geo.points);

  return (
    <svg viewBox="0 0 1 1" className="w-full" style={{ aspectRatio: "1 / 1" }} aria-hidden>
      <defs>
        <linearGradient id="route-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e9b949" />
          <stop offset="100%" stopColor="#b38a22" />
        </linearGradient>
      </defs>

      {/* Faint wide underlay reads as the road surface beneath the line */}
      <path
        d={path}
        fill="none"
        stroke="rgba(233,185,73,0.13)"
        strokeWidth={0.055}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <motion.path
        d={path}
        fill="none"
        stroke="url(#route-stroke)"
        strokeWidth={0.016}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? undefined : { pathLength: 0 }}
        animate={reduced ? undefined : { pathLength: 1 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Start and finish markers */}
      {geo.points[0] && (
        <circle
          cx={PAD + geo.points[0].x * (1 - PAD * 2)}
          cy={PAD + geo.points[0].y * (1 - PAD * 2)}
          r={0.022}
          fill="var(--color-paid)"
          stroke="#08090b"
          strokeWidth={0.008}
        />
      )}
      {geo.points.length > 1 && (
        <circle
          cx={PAD + geo.points[geo.points.length - 1].x * (1 - PAD * 2)}
          cy={PAD + geo.points[geo.points.length - 1].y * (1 - PAD * 2)}
          r={0.022}
          fill="var(--color-gold)"
          stroke="#08090b"
          strokeWidth={0.008}
        />
      )}
    </svg>
  );
}

/** Elevation as a filled area chart under the course. */
function ElevationProfile({ geo }: { geo: RouteGeometry }) {
  const profile = geo.elevation_profile;
  if (!profile) return null;

  const pts = profile.points;
  const range = Math.max(1, profile.max - profile.min);

  // Carry the last known elevation across gaps rather than dropping to zero,
  // which would draw a spike that isn't in the data.
  let last = profile.min;
  const coords = pts.map((ele, i) => {
    if (ele !== null) last = ele;
    const x = pts.length > 1 ? i / (pts.length - 1) : 0;
    const y = 1 - (last - profile.min) / range;
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(4)} ${(0.1 + c.y * 0.8).toFixed(4)}`).join(" ");
  const area = `${line} L1 1 L0 1 Z`;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Elevation</p>
        <p className="text-[11px] tnum text-ink-3">
          {profile.min}–{profile.max} m
        </p>
      </div>
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="mt-2 h-16 w-full"
        aria-label={`Elevation profile from ${profile.min} to ${profile.max} metres`}
      >
        <defs>
          <linearGradient id="ele-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(233,185,73,0.35)" />
            <stop offset="100%" stopColor="rgba(233,185,73,0.02)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ele-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth={0.012}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/* ── Public: the course card ──────────────────────────────── */

/**
 * Shows the course for an event. Renders nothing when no GPX is attached, unless
 * the viewer is an organiser — they get the upload control instead.
 */
export function RouteCard({ event, isAdmin }: { event: ClubEvent; isAdmin: boolean }) {
  const load = useCallback(
    async (): Promise<RouteGeometry | null> => {
      try {
        return await api.eventRoute(event.id);
      } catch (err) {
        // 404 just means "no route attached" — that is a normal state, not an error.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    [event.id],
  );

  const { data, loading, error, reload } = useFetch(load);

  if (loading) {
    return (
      <Card className="mt-6 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 aspect-square w-full max-w-sm rounded-2xl" />
      </Card>
    );
  }

  // No route and no permission to add one: show nothing at all.
  if (!data && !isAdmin) return null;

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <RouteGraphic className="size-4 text-gold" />
            The course
          </h2>
          {data && (
            <p className="mt-1 text-[12px] text-ink-3">
              {data.distance_km ? `${data.distance_km} km` : "Distance unknown"}
              {data.elevation_m ? ` · ${data.elevation_m} m climb` : ""} · {data.point_count} GPS
              points
            </p>
          )}
        </div>
        {isAdmin && <RouteUpload event={event} onUploaded={reload} hasRoute={Boolean(data)} />}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-2.5 text-[13px] text-ink-2">
          {error}
        </p>
      )}

      {data ? (
        <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
          <div className="mx-auto w-full max-w-[320px] rounded-2xl border border-white/8 bg-void/40 p-3">
            <TrackShape geo={data} />
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8">
              <div className="bg-surface p-3.5">
                <p className="eyebrow">Distance</p>
                <p className="display mt-1 text-[22px] tnum">
                  {data.distance_km ?? "—"}
                  <span className="ml-1 text-[12px] font-normal text-ink-3">km</span>
                </p>
              </div>
              <div className="bg-surface p-3.5">
                <p className="eyebrow">Climb</p>
                <p className="display mt-1 text-[22px] tnum">
                  {data.elevation_m ?? "—"}
                  <span className="ml-1 text-[12px] font-normal text-ink-3">m</span>
                </p>
              </div>
            </div>

            <ElevationProfile geo={data} />

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: "var(--color-paid)" }}
                  aria-hidden
                />
                Start
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: "var(--color-gold)" }}
                  aria-hidden
                />
                Finish
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={<RouteGraphic className="size-5" />}
            title="No course attached"
            body="Upload a GPX file and the distance, climb and course shape are worked out from it."
          />
        </div>
      )}
    </Card>
  );
}

/* ── Admin: attach a GPX ──────────────────────────────────── */

function RouteUpload({
  event,
  onUploaded,
  hasRoute,
}: {
  event: ClubEvent;
  onUploaded: () => void;
  hasRoute: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.uploadRoute(event.id, file);
      toast(res.message, "ok");
      onUploaded();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "err");
    } finally {
      setBusy(false);
      // Clear the input so re-picking the same file still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Button
        size="sm"
        variant={hasRoute ? "outline" : "gold"}
        loading={busy}
        onClick={() => inputRef.current?.click()}
      >
        {hasRoute ? "Replace GPX" : "Upload GPX"}
      </Button>
    </>
  );
}
