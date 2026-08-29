import { motion, useReducedMotion } from "framer-motion";
import { useCallback } from "react";
import { api } from "../lib/api";
import { cn } from "../lib/format";
import { useFetch } from "../lib/useFetch";
import { InstagramIcon, StravaIcon } from "./icons";
import { Card, Skeleton } from "./ui";

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
            <Card hover className="hud edge-gold h-full overflow-hidden p-0">
              {/* Fixed aspect rather than a free-height image: portraits arrive at
                  every size, and without it a row of cards steps up and down. */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2/60">
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
                    <span className="display text-[clamp(28px,6vw,44px)] text-ink-3">
                      {initials(f.name)}
                    </span>
                  </span>
                )}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
                  style={{
                    background: "linear-gradient(to top, var(--color-surface), transparent)",
                  }}
                />
              </div>

              <div className="p-5">
                <p className="text-[17px] font-semibold text-ink">{f.name}</p>
                {f.role && (
                  <p className="eyebrow mt-1 text-gold">{f.role}</p>
                )}
                {f.bio && (
                  <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">
                    {f.bio}
                  </p>
                )}

                {(f.instagram || f.strava) && (
                  <div className="mt-4 flex items-center gap-2">
                    {f.instagram && (
                      <a
                        href={`https://instagram.com/${f.instagram}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${f.name} on Instagram`}
                        className="tap grid size-8 place-items-center rounded-lg border border-white/10 text-ink-3 transition-colors hover:border-gold/40 hover:text-gold"
                      >
                        <InstagramIcon className="size-3.5" />
                      </a>
                    )}
                    {f.strava && (
                      <a
                        href={stravaHref(f.strava)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${f.name} on Strava`}
                        className="tap grid size-8 place-items-center rounded-lg border border-white/10 text-ink-3 transition-colors hover:border-gold/40 hover:text-gold"
                      >
                        <StravaIcon className="size-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
