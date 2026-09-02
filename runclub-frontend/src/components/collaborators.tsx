import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../lib/api";
import { cn, instagramHandle, instagramHref } from "../lib/format";
import { DUR, EASE, useCalmMotion } from "../lib/motion";
import type { Collaborator } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { InstagramIcon, SparkIcon } from "./icons";
import { buttonClass, Card } from "./ui";

const TIER = {
  SPONSOR: { label: "Sponsor", tint: "var(--color-gold)" },
  PARTNER: { label: "Partner", tint: "var(--color-free)" },
  COMMUNITY: { label: "Community", tint: "var(--color-paid)" },
  FEATURED: { label: "Featured partner", tint: "var(--color-gold)" },
} as const;

const tierOf = (t: string) => TIER[t as keyof typeof TIER] ?? TIER.PARTNER;

function Monogram({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return <span className="display text-[22px] tracking-tight text-gold">{initials}</span>;
}

/**
 * The featured partners, in their own block above the scroller.
 *
 * Separate rather than another entry on the ring: the ring turns, so any one
 * card is only readable for a couple of seconds and is one of eight. A partner
 * the club wants named needs to sit still and be legible.
 *
 * Data-driven off the same Collaborator table as the scroller, so this is an
 * admin edit rather than a code change — the alternative was hardcoding a
 * business name and URL into the page, which is not something that should need
 * a deploy to correct.
 *
 * Renders nothing when no row is tiered FEATURED, so the home page is unchanged
 * on a fresh install.
 */
export function FeaturedPartners() {
  const load = useCallback(() => api.collaborators(), []);
  const { data, loading } = useFetch(load);

  const featured = (data ?? []).filter((c) => c.tier === "FEATURED");
  if (loading || featured.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="rule-gold mb-8" />
      <p className="eyebrow mb-2 text-gold">Where we train</p>
      <h2 className="display text-[clamp(26px,3.6vw,38px)]">
        {featured.length === 1 ? "Our home gym" : "Featured partners"}
      </h2>

      <div className={cn("mt-7 grid gap-4", featured.length > 1 && "sm:grid-cols-2")}>
        {featured.map((c) => {
          /* The club keeps a partner's Instagram in `website`, since that is
             often the only page a local business has. Detected rather than
             stored separately so the admin form stays one field. */
          const handle = c.website ? instagramHandle(c.website) : null;
          const isInstagram = Boolean(c.website && /instagram\.com/i.test(c.website));

          return (
            <Card key={c.id} className="card-glow flex flex-wrap items-center gap-5 p-6 sm:p-7">
              <span
                className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-gold/25 bg-gold/8"
                aria-hidden
              >
                {c.logo_url ? (
                  <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Monogram name={c.name} />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="display text-[clamp(20px,2.4vw,26px)]">{c.name}</h3>
                {c.blurb && (
                  <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-ink-2">
                    {c.blurb}
                  </p>
                )}
              </div>

              {c.website && (
                <a
                  href={isInstagram ? instagramHref(c.website) : c.website}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("outline", "md", "shrink-0")}
                >
                  {isInstagram ? (
                    <>
                      <InstagramIcon className="size-4" />
                      @{handle}
                    </>
                  ) : (
                    <>{c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} →</>
                  )}
                </a>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Collaborators on a rotating 3D cylinder.
 *
 * Each card is pushed out along Z and rotated to face outward, so the ring has
 * genuine depth rather than a flat scroll. The ring turns continuously via a CSS
 * animation — deliberately CSS, because `animation-play-state: paused` is what
 * lets hovering stop it, and a JS-driven transform cannot be paused that way.
 *
 * Hovering a card pulls it toward the viewer and raises its shout-out.
 */
export function CollaboratorScroller() {
  const load = useCallback(() => api.collaborators(), []);
  const { data, loading } = useFetch(load);
  const calm = useCalmMotion();
  const [active, setActive] = useState<Collaborator | null>(null);
  const [radius, setRadius] = useState(520);
  const stageRef = useRef<HTMLDivElement>(null);

  /* FEATURED rows are excluded: they render in their own block above, and
     showing them in both places would read as the same partner listed twice. */
  const rows = (data ?? []).filter((c) => c.tier !== "FEATURED");

  // Repeat a short list so the ring is populated rather than gappy.
  const reps = rows.length === 0 ? 0 : rows.length < 6 ? Math.ceil(8 / rows.length) : 1;
  const ring = Array.from({ length: reps }, () => rows).flat();
  const step = ring.length ? 360 / ring.length : 0;

  // The cylinder radius has to grow with the card count or faces overlap.
  useEffect(() => {
    if (!ring.length) return;
    const cardWidth = 250;
    const needed = cardWidth / (2 * Math.tan(Math.PI / ring.length));
    setRadius(Math.max(420, Math.min(820, needed)));
  }, [ring.length]);

  if (loading || rows.length === 0) return null;

  return (
    <section className="relative overflow-hidden py-20">
      {/* Header */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2 text-gold">In good company</p>
            <h2 className="display text-[clamp(26px,3.6vw,38px)]">Our collaborators</h2>
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-ink-3">
            The people who kit us out, feed us and keep our routes open. Hover one to bring it
            forward and hear the shout-out.
          </p>
        </div>
        <div className="datastrip mt-6" />
      </div>

      {/* 3D ring */}
      <div
        ref={stageRef}
        className="stage3d relative mx-auto mt-10 h-[300px] w-full"
        onMouseLeave={() => setActive(null)}
        style={
          {
            maskImage: "linear-gradient(90deg, transparent, black 14%, black 86%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, black 14%, black 86%, transparent)",
          } as CSSProperties
        }
      >
        <div
          className={cn("stage3d-track absolute left-1/2 top-1/2", !calm && "ring-spin")}
          style={
            {
              "--ring-duration": `${Math.max(26, ring.length * 3.4)}s`,
              "--ring-radius": `${radius}px`,
              // Static fallback for reduced motion, where the animation is off.
              transform: `translate(-50%, -50%) translateZ(-${radius}px)`,
            } as CSSProperties
          }
        >
          {ring.map((c, i) => {
            const t = tierOf(c.tier);
            const angle = i * step;
            const dimmed = active && active.id !== c.id;

            return (
              <button
                key={`${c.id}-${i}`}
                type="button"
                onMouseEnter={() => setActive(c)}
                onFocus={() => setActive(c)}
                onBlur={() => setActive(null)}
                onClick={() => c.website && window.open(c.website, "_blank", "noreferrer")}
                aria-label={`${c.name}${c.blurb ? ` — ${c.blurb}` : ""}`}
                className={cn(
                  "coin absolute left-1/2 top-1/2 grid h-[132px] w-[186px] -translate-x-1/2 -translate-y-1/2",
                  "place-items-center rounded-2xl border bg-surface/85 p-4 backdrop-blur-sm",
                  dimmed ? "border-white/8 opacity-35" : "border-gold/25 opacity-100",
                )}
                style={{
                  transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                  boxShadow:
                    "0 1px 0 0 rgb(255 255 255 / 0.07) inset, 0 26px 50px -26px rgb(0 0 0 / 0.85)",
                }}
              >
                {/* Face */}
                <span className="grid place-items-center gap-2 text-center">
                  {c.logo_url ? (
                    <img
                      src={c.logo_url}
                      alt={c.name}
                      loading="lazy"
                      className="max-h-9 max-w-[120px] object-contain"
                    />
                  ) : (
                    <Monogram name={c.name} />
                  )}
                  <span className="block max-w-[150px] truncate text-[12.5px] font-semibold text-ink">
                    {c.name}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                    style={{ background: `${t.tint}22`, color: t.tint }}
                  >
                    {t.label}
                  </span>
                </span>

                {/* Gold edge highlight */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{
                    background:
                      "linear-gradient(140deg, rgb(233 185 73 / 0.14), transparent 42%)",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Shout-out */}
      <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 14, rotateX: 10 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DUR.base, ease: EASE }}
              style={{ perspective: 1000 }}
              className="card hud mx-auto flex max-w-2xl items-start gap-4 p-5"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold">
                <SparkIcon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                  {active.name}
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      background: `${tierOf(active.tier).tint}22`,
                      color: tierOf(active.tier).tint,
                    }}
                  >
                    {tierOf(active.tier).label}
                  </span>
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                  {active.blurb || "A friend of the club."}
                </p>
                {active.website && (
                  <span className="mt-2 inline-block text-[12px] font-medium text-gold">
                    {active.website.replace(/^https?:\/\//, "")} →
                  </span>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.p
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-[12px] text-ink-3"
            >
              Hover a card to bring it forward.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
