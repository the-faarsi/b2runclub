import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../lib/format";

/* ── Button ───────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "gold" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  gold: "bg-gold text-[color:var(--color-gold-ink)] hover:bg-gold-deep font-semibold shadow-[0_8px_24px_-10px_rgb(233_185_73/0.6)]",
  ghost: "text-ink-2 hover:text-ink hover:bg-white/6",
  outline: "border border-white/14 text-ink hover:border-white/28 hover:bg-white/4",
  danger:
    "border border-[color:var(--color-failed)]/40 text-[color:var(--color-failed)] hover:bg-[color:var(--color-failed)]/10",
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-lg gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-13 px-7 text-[15px] rounded-xl gap-2.5",
};

export function Button({
  variant = "gold",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "btn-3d inline-flex shrink-0 items-center justify-center whitespace-nowrap",
        "disabled:pointer-events-none disabled:opacity-45",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

/** Same visual contract as Button, but renders an anchor-like element.
 *  Use for navigation so we never nest <a> inside <button>. */
export function LinkButton({
  variant = "gold",
  size = "md",
  className,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  return (
    <a
      {...rest}
      className={cn(
        "btn-3d inline-flex shrink-0 items-center justify-center whitespace-nowrap",
        BUTTON_SIZES[size ?? "md"],
        BUTTON_VARIANTS[variant ?? "gold"],
        className,
      )}
    >
      {children}
    </a>
  );
}

/** Class string for styling a react-router <Link> as a button. */
export function buttonClass(
  variant: NonNullable<ButtonProps["variant"]> = "gold",
  size: NonNullable<ButtonProps["size"]> = "md",
  extra?: string,
) {
  return cn(
    "btn-3d inline-flex shrink-0 items-center justify-center whitespace-nowrap",
    BUTTON_SIZES[size],
    BUTTON_VARIANTS[variant],
    extra,
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Card ─────────────────────────────────────────────────── */

export function Card({
  className,
  hover = false,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div {...rest} className={cn("card", hover && "card-hover", className)}>
      {children}
    </div>
  );
}

/* ── Badge ────────────────────────────────────────────────── */

export function Badge({
  children,
  color,
  icon,
  className,
}: {
  children: ReactNode;
  /** A CSS colour. Drives the dot + ring only; the text stays ink. */
  color?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[11px] font-semibold uppercase tracking-[0.08em]",
        color ? "text-ink-2" : "border-white/12 text-ink-3",
        className,
      )}
      style={color ? { borderColor: `${color}59`, background: `${color}1a` } : undefined}
    >
      {color && !icon && (
        <span
          className="size-1.5 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
      )}
      {icon && (
        <span aria-hidden style={{ color }} className="text-[11px] leading-none">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/* ── Form fields ──────────────────────────────────────────── */

const FIELD_BASE =
  "w-full rounded-xl border border-white/10 bg-surface-2/70 px-3.5 text-sm text-ink " +
  "placeholder:text-ink-3 transition-colors duration-200 " +
  "hover:border-white/18 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="eyebrow block text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[color:var(--color-failed)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cn(FIELD_BASE, "h-11", className)} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea ref={ref} {...rest} className={cn(FIELD_BASE, "py-3 leading-relaxed", className)} />
  );
});

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(FIELD_BASE, "h-11 appearance-none bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236d737f' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 12px center",
      }}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all duration-200",
          checked
            ? "border-gold bg-gold text-[color:var(--color-gold-ink)]"
            : "border-white/20 hover:border-white/40",
        )}
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
            <path
              d="m5 13 4 4L19 7"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <div className="space-y-1">
        <label id={id} className="block cursor-pointer text-sm leading-snug text-ink-2">
          {label}
        </label>
        {description && <p className="text-xs text-ink-3">{description}</p>}
      </div>
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "md",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: "md" | "lg";
  /**
   * Pinned below the scrolling body, so a long form's buttons stay reachable.
   *
   * A `position: sticky` row inside `children` cannot work: as the last child it
   * has no room to move within its parent's box, so it renders exactly where it
   * already was. The footer has to sit outside the scroll container. A submit
   * button placed here needs `form="<id>"` to stay wired to the form above it.
   */
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  /**
   * Rendered through a portal to <body>.
   *
   * `Page` sets `perspective: 1400px` for the 3D page transition, and any
   * transform/perspective makes an element a containing block for
   * `position: fixed` descendants. Inside it this dialog sized itself against
   * <main> rather than the viewport, so `max-h-[88vh]` overflowed the screen and
   * the footer landed below the fold — the event form's Create button was
   * unreachable at every viewport size. The portal escapes that ancestor.
   */
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-void/80 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "card relative flex max-h-[88vh] w-full flex-col overflow-hidden p-0",
              size === "lg" ? "max-w-2xl" : "max-w-md",
            )}
          >
            <div className="shrink-0 px-6 pb-4 pr-8 pt-6 sm:px-7 sm:pt-7">
              <h2 className="display text-xl">{title}</h2>
              {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="absolute right-5 top-5 grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-white/6 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
                <path
                  d="M18 6 6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {/* min-h-0 lets this shrink inside the flex column so it can scroll. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-7 sm:pb-7">
              {children}
            </div>

            {footer && (
              <div className="shrink-0 border-t border-white/8 bg-surface px-6 py-4 sm:px-7">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── Toasts ───────────────────────────────────────────────── */

type Toast = { id: number; message: string; tone: "ok" | "err" | "info" };

const ToastContext = createContext<{
  toast: (message: string, tone?: Toast["tone"]) => void;
} | null>(null);

const TOAST_TONE: Record<Toast["tone"], { color: string; icon: string }> = {
  ok: { color: "var(--color-paid)", icon: "✓" },
  err: { color: "var(--color-failed)", icon: "!" },
  info: { color: "var(--color-free)", icon: "i" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="card pointer-events-auto flex items-start gap-3 p-3.5"
            >
              <span
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                style={{
                  background: `${TOAST_TONE[t.tone].color}26`,
                  color: TOAST_TONE[t.tone].color,
                }}
                aria-hidden
              >
                {TOAST_TONE[t.tone].icon}
              </span>
              <p className="pt-0.5 text-[13px] leading-snug text-ink-2">{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx.toast;
}

/* ── States ───────────────────────────────────────────────── */

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("skeleton", className)} style={style} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-xl border border-white/8 bg-surface-2 text-ink-3">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<span className="text-lg font-bold text-[color:var(--color-failed)]">!</span>}
      title="Something went sideways"
      body={message}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

/* ── Avatar ───────────────────────────────────────────────── */

export function Avatar({
  name,
  size = 36,
  ring = false,
}: {
  name: string;
  size?: number;
  ring?: boolean;
}) {
  // Deterministic hue per person so faces stay recognisable across views.
  const hue = useMemo(() => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }, [name]);

  const label = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold",
        ring && "ring-2 ring-gold/40",
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, oklch(0.42 0.09 ${hue}), oklch(0.26 0.05 ${hue}))`,
        color: `oklch(0.92 0.04 ${hue})`,
      }}
    >
      {label}
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-surface/60 p-1"
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors duration-200",
              active ? "text-[color:var(--color-gold-ink)]" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-lg bg-gold"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {t.label}
              {t.count !== undefined && (
                <span className={cn("tnum text-[11px]", active ? "opacity-60" : "opacity-70")}>
                  {t.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
