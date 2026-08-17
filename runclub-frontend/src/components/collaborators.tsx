import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState, type CSSProperties } from "react";
import { api } from "../lib/api";
import { cn } from "../lib/format";
import { DUR, EASE } from "../lib/motion";
import type { Collaborator } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { SparkIcon } from "./icons";

const TIER_LABEL: Record<string, string> = {
  SPONSOR: "Sponsor",
  PARTNER: "Partner",
  COMMUNITY: "Community",
};

/** Monogram stand-in when a collaborator has no logo. */
function Monogram({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="display text-[18px] tracking-tight text-gold">{initials}</span>
  );
}

function Logo({ c }: { c: Collaborator }) {
  return (
    <span className="grid h-10 w-24 shrink-0 place-items-center">
      {c.logo_url ? (
        <img
          src={c.logo_url}
          alt={c.name}
          loading="lazy"
          /* Logos arrive in every colour; grayscale keeps the strip coherent
             and colour returns on hover as the reward. */
          className="max-h-10 max-w-24 object-contain opacity-70 grayscale transition-all duration-400 group-hover/item:opacity-100 group-hover/item:grayscale-0"
        />
      ) : (
        <Monogram name={c.name} />
      )}
    </span>
  );
}

/**
 * Continuous marquee of club collaborators. Hovering one pauses the strip and
 * raises a shout-out card for that collaborator.
 *
 * The row is rendered twice and translated by -50%, which gives a seamless loop
 * without measuring widths. The duplicate is aria-hidden so screen readers only
 * hear each collaborator once.
 */
export function CollaboratorScroller() {
  const load = useCallback(() => api.collaborators(), []);
  const { data, loading } = useFetch(load);
  const [active, setActive] = useState<Collaborator | null>(null);

  const rows = data ?? [];
  if (loading || rows.length === 0) return null;

  // Too few to fill the strip? Repeat until the loop reads as continuous.
  const reps = rows.length < 5 ? Math.ceil(6 / rows.length) : 1;
  const lane = Array.from({ length: reps }, () => rows).flat();

  // Longer strips take proportionally longer, so speed stays constant.
  const duration = Math.max(18, lane.length * 4.5);

  return (
    <section className="relative py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-2 text-gold">In good company</p>
            <h2 className="display text-[clamp(22px,3vw,30px)]">Our collaborators</h2>
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-ink-3">
            The people who kit us out, feed us and keep our routes open. Hover one for the
            shout-out.
          </p>
        </div>
      </div>

      {/* Strip — CSS animation, not framer-motion, because
          `animation-play-state: paused` is what makes hover-to-pause work. */}
      <div
        className="marquee group relative mt-8 overflow-hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
        }}
        onMouseLeave={() => setActive(null)}
      >
        <div
          className="marquee-track flex w-max items-center gap-14"
          style={{ "--marquee-duration": `${duration}s` } as CSSProperties}
        >
          {/* Rendered twice so translating by -50% loops seamlessly. */}
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="flex items-center gap-14"
              aria-hidden={copy === 1 || undefined}
            >
              {lane.map((c, i) => (
                <button
                  key={`${copy}-${c.id}-${i}`}
                  type="button"
                  onMouseEnter={() => setActive(c)}
                  onFocus={() => setActive(c)}
                  onBlur={() => setActive(null)}
                  onClick={() => {
                    if (c.website) window.open(c.website, "_blank", "noreferrer");
                  }}
                  className={cn(
                    "group/item flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 transition-all duration-300",
                    "hover:bg-white/4 focus-visible:bg-white/4",
                    active && active.id !== c.id && "opacity-40",
                  )}
                  aria-label={`${c.name}${c.blurb ? ` — ${c.blurb}` : ""}`}
                >
                  <Logo c={c} />
                  <span className="hidden text-left sm:block">
                    <span className="block whitespace-nowrap text-[13px] font-semibold text-ink-2 transition-colors duration-300 group-hover/item:text-ink">
                      {c.name}
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">
                      {TIER_LABEL[c.tier] ?? c.tier}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Shout-out */}
      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 12, rotateX: 8 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DUR.base, ease: EASE }}
              style={{ perspective: 1000 }}
              className="card mx-auto flex max-w-2xl items-start gap-4 p-5"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold">
                <SparkIcon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                  {active.name}
                  <span className="rounded-full bg-gold/14 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                    {TIER_LABEL[active.tier] ?? active.tier}
                  </span>
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                  {active.blurb || "A friend of the club."}
                </p>
                {active.website && (
                  <a
                    href={active.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[12px] font-medium text-gold hover:underline"
                  >
                    {active.website.replace(/^https?:\/\//, "")} →
                  </a>
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
              Hover a collaborator to hear why we rate them.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
