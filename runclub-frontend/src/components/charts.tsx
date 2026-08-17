import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { cn, compact } from "../lib/format";
import { AnimatedNumber } from "./motion";
import { Tilt } from "./tilt";

/* Marks use --color-mark (#7da512, validated on surface #14161A) for single-
 * series magnitude, and the fixed status palette for state. Text always wears
 * ink tokens — identity comes from the swatch beside it, never coloured text. */

const SURFACE = "var(--color-surface)";

/* ── Stat tile ────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  sub,
  accent,
  icon,
  meter,
  countTo,
  countFormat,
}: {
  label: string;
  value: string;
  sub?: string;
  /** CSS colour for the swatch/meter fill. Never applied to text. */
  accent?: string;
  icon?: ReactNode;
  /** 0–1; draws a meter under the value, unfilled track = dim step of the fill. */
  meter?: number;
  /** When set, the figure counts up to this instead of rendering `value`. */
  countTo?: number;
  countFormat?: (v: number) => string;
}) {
  return (
    <Tilt max={7} lift={8}>
    <div className="card card-hover edge-gold p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {icon ? (
          <span className="text-ink-3" aria-hidden>
            {icon}
          </span>
        ) : accent ? (
          <span
            className="mt-0.5 size-2 shrink-0 rounded-full"
            style={{ background: accent }}
            aria-hidden
          />
        ) : null}
      </div>

      <p className="display mt-3 text-[34px] text-ink">
        {countTo !== undefined ? (
          <AnimatedNumber value={countTo} format={countFormat} />
        ) : (
          value
        )}
      </p>

      {meter !== undefined && (
        <div
          className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-mark-soft)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: accent ?? "var(--color-mark)" }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, meter * 100))}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}

      {sub && <p className="mt-2.5 text-xs leading-relaxed text-ink-3">{sub}</p>}
    </div>
    </Tilt>
  );
}

/* ── Hero figure — exactly one per view ───────────────────── */

export function HeroFigure({
  label,
  value,
  caption,
  countTo,
  countFormat,
}: {
  label: string;
  value: string;
  caption?: string;
  /** Counts up to this on mount instead of rendering `value` statically. */
  countTo?: number;
  countFormat?: (v: number) => string;
}) {
  return (
    <Tilt max={6} lift={7}>
    <div className="card speedlines grain relative overflow-hidden p-6 sm:p-7">
      <div className="relative" style={{ transformStyle: "preserve-3d" }}>
        <p className="eyebrow">{label}</p>
        <p
          className="display foil mt-2 text-[clamp(44px,7vw,64px)]"
          style={{ transform: "translateZ(38px)" }}
        >
          {countTo !== undefined ? (
            <AnimatedNumber value={countTo} format={countFormat} />
          ) : (
            value
          )}
        </p>
        {caption && <p className="mt-2 text-sm text-ink-3">{caption}</p>}
      </div>
      <motion.div
        className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full blur-3xl"
        style={{ background: "var(--color-gold)" }}
        animate={{ opacity: [0.1, 0.18, 0.1] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
    </div>
    </Tilt>
  );
}

/* ── Horizontal bar list (single series, magnitude) ───────── */

export interface BarDatum {
  id: string;
  label: string;
  value: number;
  /** Optional right-aligned meta shown in the label row (e.g. a pace). */
  meta?: string;
  /** Marks the viewer's own row — a label, never a colour change. */
  isYou?: boolean;
}

export function BarList({
  data,
  format = (v) => compact(v),
  unit,
  emptyLabel = "No data yet",
  maxBar = 24,
}: {
  data: BarDatum[];
  format?: (v: number) => string;
  unit?: string;
  emptyLabel?: string;
  maxBar?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-3">{emptyLabel}</p>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = max > 0 ? (d.value / max) * 100 : 0;
        const share = total > 0 ? (d.value / total) * 100 : 0;
        const isHover = hover === d.id;

        return (
          <div
            key={d.id}
            // Hit target spans the whole row, not just the mark.
            onMouseEnter={() => setHover(d.id)}
            onMouseLeave={() => setHover(null)}
            className="group relative -mx-2 cursor-default rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-white/4"
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] text-ink-2">{d.label}</span>
                {d.isYou && (
                  <span className="shrink-0 rounded-full bg-gold/16 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                    You
                  </span>
                )}
              </span>
              <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                {format(d.value)}
                {unit && <span className="ml-0.5 text-ink-3">{unit}</span>}
              </span>
            </div>

            {/* Bar: grows from a single baseline, 4px rounded data-end, square at base. */}
            <div className="relative h-full w-full" style={{ height: maxBar / 2 }}>
              <div
                className="absolute inset-y-0 left-0 w-full rounded-r-[4px]"
                style={{ background: "var(--color-mark-soft)", opacity: 0.5 }}
                aria-hidden
              />
              <motion.div
                className="absolute inset-y-0 left-0 rounded-r-[4px]"
                style={{ background: "var(--color-mark)" }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%`, opacity: isHover ? 1 : 0.88 }}
                transition={{
                  width: { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 },
                  opacity: { duration: 0.2 },
                }}
              />
            </div>

            {/* Hover tooltip — sits below the first row so it never collides
                with the chart title above it. */}
            {isHover && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute right-2 z-10 rounded-lg border border-white/12 bg-surface-3 px-2.5 py-1.5 text-[11px] shadow-xl",
                  i === 0 ? "top-full" : "top-0 -translate-y-full",
                )}
              >
                <span className="text-ink">
                  {format(d.value)}
                  {unit ?? ""}
                </span>
                <span className="tnum ml-1.5 text-ink-3">{share.toFixed(1)}% of total</span>
                {d.meta && <span className="ml-1.5 text-ink-3">· {d.meta}</span>}
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Status breakdown (stacked, state-coded) ──────────────── */

export interface StatusSegment {
  id: string;
  label: string;
  value: number;
  color: string;
  /** Paired with the colour so state never reads by colour alone. */
  icon: string;
}

export function StatusBar({ segments }: { segments: StatusSegment[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div>
      {total === 0 ? (
        <div
          className="h-3 w-full rounded-full"
          style={{ background: "var(--color-mark-soft)", opacity: 0.5 }}
          aria-hidden
        />
      ) : (
        // 2px surface gaps do the separating — no strokes around segments.
        <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ gap: 2 }}>
          {visible.map((s) => (
            <motion.div
              key={s.id}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: s.value, opacity: hover && hover !== s.id ? 0.45 : 1 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="h-full min-w-1 first:rounded-l-full last:rounded-r-full"
              style={{ background: s.color, flexBasis: 0 }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
        </div>
      )}

      {/* Legend: always present for 2+ series, icon + label + swatch. */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2.5">
        {segments.map((s) => {
          const share = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div
              key={s.id}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "flex items-center gap-2 transition-opacity duration-200",
                hover && hover !== s.id && "opacity-50",
              )}
            >
              <span
                aria-hidden
                className="grid size-4 shrink-0 place-items-center rounded-[3px] text-[9px] font-bold"
                style={{ background: `${s.color}2e`, color: s.color }}
              >
                {s.icon}
              </span>
              <span className="text-[12px] text-ink-2">{s.label}</span>
              <span className="tnum text-[12px] font-semibold text-ink">{s.value}</span>
              {total > 0 && (
                <span className="tnum text-[11px] text-ink-3">{share.toFixed(0)}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Table view — the always-available fallback ───────────── */

export function TableToggle({
  showing,
  onToggle,
}: {
  showing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-ink-2"
      aria-pressed={showing}
    >
      {showing ? "Chart view" : "Table view"}
    </button>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/8">
            {columns.map((c, i) => (
              <th
                key={c}
                className={cn(
                  "pb-2 pt-1 font-semibold text-ink-3",
                  "text-[11px] uppercase tracking-[0.1em]",
                  i > 0 && "text-right",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-white/5 last:border-0">
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "py-2.5",
                    ci === 0 ? "text-ink-2" : "tnum text-right font-medium text-ink",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Section shell for a chart: title, optional action row, recessive frame. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card p-5 sm:p-6", className)} style={{ background: SURFACE }}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
