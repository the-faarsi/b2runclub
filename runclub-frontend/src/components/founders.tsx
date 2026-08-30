import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { cn, instagramHandle, instagramHref } from "../lib/format";
import { useFetch } from "../lib/useFetch";
import { InstagramIcon, StravaIcon } from "./icons";
import { Skeleton } from "./ui";

/** Initials fallback when no photo has been uploaded yet. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** A bare Strava id becomes an athlete URL; a full URL is used as given. */
function stravaHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://www.strava.com/athletes/${value}`;
}

/**
 * The people who started the club.
 *
 * Renders nothing until an organiser adds someone, so the home page does not
 * carry an empty shelf on a fresh install. Content is managed at
 * /admin/founders.
 */
export function Founders() {
  const reduced = useReducedMotion();
  /** Which card is flipped by tap. Hover and focus are handled in CSS. */
  const [flipped, setFlipped] = useState<string | null>(null);
  const load = useCallback(() => api.founders(), []);
  const { data, loading } = useFetch(load);

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-9 w-72" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const founders = data ?? [];
  if (founders.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="datastrip mb-10" />

      <div className="max-w-2xl">
        <p className="eyebrow mb-2 text-gold">Founders</p>
        <h2 className="display text-[clamp(26px,3.6vw,38px)]">
          {founders.length === 1 ? "Who started it." : "Who started it all."}
        </h2>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
          The club runs on volunteers, but somebody had to turn up first.
        </p>
      </div>

      <div
        className={cn(
          "mt-9 grid gap-4",
          founders.length === 1
            ? "max-w-md"
            : founders.length === 2
              ? "sm:grid-cols-2"
              : "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {founders.map((f, i) => (
          <motion.div
            key={f.id}
            initial={reduced ? undefined : { opacity: 0, y: 18 }}
            whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.08, 0.24), ease: [0.16, 1, 0.3, 1] }}
          >
            {/*
              Two-sided: portrait and name on the front, the bio and the links
              on the back. A fixed height rather than auto, because both faces
              are absolutely positioned and an auto-height parent would collapse
              to nothing.
            */}
            {/* data-hoverflip turns it on hover and on keyboard focus;
                data-stretch makes both faces fill the fixed-height box.
                onClick covers touch, where there is no hover at all. */}
            <div
              className="flip h-[clamp(320px,46vw,400px)] w-full"
              data-hoverflip="true"
              data-stretch="true"
              data-flipped={flipped === f.id}
              data-calm={reduced}
              tabIndex={0}
              role="button"
              aria-label={`${f.name} — ${flipped === f.id ? "hide" : "show"} details`}
              onClick={() => setFlipped((prev) => (prev === f.id ? null : f.id))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFlipped((prev) => (prev === f.id ? null : f.id));
                }
              }}
            >
              <div className="flip-inner">
                {/* ── Front ── */}
                <div className="flip-face hud edge-gold border border-white/8 bg-surface">
                  <div className="relative h-full w-full overflow-hidden bg-surface-2/60">
                    {f.photo_url ? (
                      <img
                        src={f.photo_url}
                        alt={f.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center">
                        <span className="display text-[clamp(36px,8vw,60px)] text-ink-3">
                          {initials(f.name)}
                        </span>
                      </span>
                    )}

                    {/* Name over the foot of the portrait. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(8,9,11,0.96) 12%, rgba(8,9,11,0.6) 55%, transparent 100%)",
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <p className="text-[18px] font-semibold leading-snug text-ink">{f.name}</p>
                      {f.role && <p className="eyebrow mt-1 text-gold">{f.role}</p>}
                      <p className="mt-2.5 text-[11.5px] uppercase tracking-[0.14em] text-ink-3">
                        More →
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Back ── */}
                <div className="flip-face flip-back hud edge-gold border border-white/8 bg-surface">
                  <div className="flex h-full flex-col p-5">
                    <p className="text-[17px] font-semibold text-ink">{f.name}</p>
                    {f.role && <p className="eyebrow mt-1 text-gold">{f.role}</p>}

                    {f.bio && (
                      <p className="mt-3.5 flex-1 overflow-y-auto whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">
                        {f.bio}
                      </p>
                    )}

                    {(f.instagram || f.strava) && (
                      <div className="mt-4 flex flex-wrap items-center gap-2.5">
                        {/* Instagram is the one people actually follow, so it is a
                            full labelled button rather than a 32px icon square. */}
                        {f.instagram && (
                          <a
                            href={instagramHref(f.instagram)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="tap inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-gold transition-colors hover:border-gold/60 hover:bg-gold/16"
                          >
                            <InstagramIcon className="size-5 shrink-0" />
                            <span className="truncate text-[14px] font-semibold">
                              @{instagramHandle(f.instagram)}
                            </span>
                          </a>
                        )}
                        {f.strava && (
                          <a
                            href={stravaHref(f.strava)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`${f.name} on Strava`}
                            className="tap grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 text-ink-3 transition-colors hover:border-gold/40 hover:text-gold"
                          >
                            <StravaIcon className="size-5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
