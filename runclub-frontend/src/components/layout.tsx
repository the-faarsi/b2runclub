import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, relativeTime, ROLE_META } from "../lib/format";
import type { Notification } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { Avatar, buttonClass } from "./ui";

/* ── Wordmark ─────────────────────────────────────────────── */

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="B Squared Run Club">
      {/* B² monogram — solid gold plate, ink glyph */}
      <span
        className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-gold text-[color:var(--color-gold-ink)] transition-transform duration-300 group-hover:scale-105"
        aria-hidden
      >
        <span className="display flex items-start text-[15px] leading-none">
          B<span className="ml-px text-[9px] leading-none">2</span>
        </span>
      </span>
      {!compact && (
        <span className="display text-[17px] tracking-[-0.02em]">
          B SQUARED
          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            RC
          </span>
        </span>
      )}
    </Link>
  );
}

/* ── Notifications ────────────────────────────────────────── */

/** Backend notification links are API paths; map them to app routes. */
function resolveLink(link: string | null): string | null {
  if (!link) return null;
  const post = link.match(/^\/api\/forum\/posts\/([^/]+)$/);
  if (post) return `/forum?post=${post[1]}`;
  const ticket = link.match(/^\/api\/events\/registration\/([^/]+)\/ticket$/);
  if (ticket) return `/tickets?open=${ticket[1]}`;
  return null;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = () => {
    api
      .notifications()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = items.filter((n) => !n.is_read).length;

  /** The API only marks one at a time, so fan out and reconcile locally. */
  const markAllRead = async () => {
    const pending = items.filter((n) => !n.is_read);
    if (pending.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await Promise.all(pending.map((n) => api.markNotificationRead(n.id)));
    } catch {
      load(); // fall back to server truth if any call failed
    }
  };

  const onPick = async (n: Notification) => {
    setOpen(false);
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api.markNotificationRead(n.id).catch(() => load());
    }
    const to = resolveLink(n.link);
    if (to) navigate(to);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-white/6 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden>
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-bold text-[color:var(--color-gold-ink)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="card absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden p-0"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <p className="eyebrow text-ink-2">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-gold transition-opacity hover:opacity-75"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[min(420px,60vh)] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-ink-3">
                  Nothing yet. Announcements and payment updates land here.
                </p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onPick(n)}
                    className="flex w-full gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/4"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        n.is_read ? "bg-white/16" : "bg-gold",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-[13px] leading-snug",
                          n.is_read ? "text-ink-3" : "text-ink-2",
                        )}
                      >
                        {n.message}
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-3">
                        {relativeTime(n.created_at)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── User menu ────────────────────────────────────────────── */

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!user) return null;
  const meta = ROLE_META[user.role] ?? ROLE_META.MEMBER;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-white/6"
      >
        <Avatar name={user.name} size={30} />
        <span className="hidden text-left sm:block">
          <span className="block text-[13px] font-medium leading-tight text-ink">
            {user.name.split(" ")[0]}
          </span>
          <span className={cn("block text-[10px] font-semibold uppercase tracking-wider", meta.tint)}>
            {meta.label}
          </span>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="card absolute right-0 top-12 z-50 w-60 overflow-hidden p-0"
          >
            <div className="border-b border-white/8 px-4 py-3">
              <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
              <p className="truncate text-[11px] text-ink-3">{user.email}</p>
            </div>
            <div className="p-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/profile");
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-white/6 hover:text-ink"
              >
                Profile & Strava
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                  navigate("/");
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-white/6 hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Navbar ───────────────────────────────────────────────── */

/** Exact match, or a child path, unless the item defines its own test. */
function isItemActive(item: NavItem, pathname: string) {
  if (item.active) return item.active(pathname);
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

interface NavItem {
  to: string;
  label: string;
  /** Overrides the default "exact or a child path" test. */
  active?: (pathname: string) => boolean;
}

function navItems(isAdmin: boolean, canRegister: boolean, isClubMember: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: "/calendar", label: "Calendar" },
    { to: "/events", label: "Events" },
    { to: "/gallery", label: "Gallery" },
    { to: "/polls", label: "Polls" },
    { to: "/leaderboard", label: "Leaderboard" },
  ];
  // The forum is club-only — visitors and signed-out users never see the link.
  if (isClubMember) items.splice(3, 0, { to: "/forum", label: "Forum" });
  if (canRegister) items.push({ to: "/tickets", label: "My tickets" });
  if (isAdmin) {
    // Dashboard first, then the directory. Members was previously reachable only
    // via a button on the dashboard, which made it hard to find.
    items.push(
      {
        to: "/admin",
        label: "Dashboard",
        /**
         * "/admin" is a prefix of "/admin/members", so the default test would light
         * both up at once — and two items sharing layoutId="nav-underline" makes the
         * sliding underline jump between them. Dashboard therefore claims every
         * admin page except the one Members owns.
         */
        active: (path) =>
          path === "/admin" ||
          (path.startsWith("/admin/") &&
            !path.startsWith("/admin/members") &&
            !path.startsWith("/admin/database")),
      },
      { to: "/admin/members", label: "Members" },
      { to: "/admin/database", label: "Database" },
    );
  }
  return items;
}

export function Navbar() {
  const { user, isAdmin, canRegister, isClubMember } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const items = navItems(isAdmin, canRegister, isClubMember);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled && "border-b border-white/8 bg-void/72 backdrop-blur-xl",
      )}
    >
      <div
        className={cn(
          "relative mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          scrolled ? "sm:px-1 lg:px-1.5" : "sm:px-6 lg:px-8",
        )}
      >
        {/* `layout` (not a manual x-tween) so this tracks wherever the row's
            padding change actually puts it, rather than a hard-coded offset
            that would drift out of sync if the padding values change later. */}
        <motion.div layout transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <Logo />
        </motion.div>

        {/* Positioned absolutely against the row (not just the space between
            the logo and the right controls) so it lands dead-centre of the
            whole bar once scrolled, regardless of how wide either side is.
            `layout` hands the static → absolute transition to Framer Motion,
            which keeps it smooth across the position-scheme change — a plain
            CSS transition can't interpolate that. */}
        <motion.nav
          layout
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "hidden items-center transition-[background-color,padding,border-radius] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:flex",
            scrolled
              ? "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 gap-0.5 rounded-[20px] bg-gold px-3 py-2"
              : "static flex-1 justify-evenly",
          )}
        >
          {items.map((it) => {
            /*
             * Active state is computed here rather than taken from NavLink's own
             * `isActive`. "/admin" is a prefix of "/admin/members" and
             * "/admin/database", so the built-in prefix match lights up two items
             * at once — and two elements sharing layoutId="nav-underline" makes the
             * underline jump between them.
             */
            const isActive = isItemActive(it, location.pathname);
            return (
              <motion.div
                key={it.to}
                layout
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <NavLink
                  to={it.to}
                  className={cn(
                    "relative rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200",
                    scrolled
                      ? "text-[color:var(--color-gold-ink)]"
                      : isActive
                        ? "text-ink"
                        : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {it.label}
                  {isActive && !scrolled && (
                    <motion.span
                      layoutId="nav-underline"
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold"
                    />
                  )}
                </NavLink>
              </motion.div>
            );
          })}
        </motion.nav>

        <motion.div
          layout
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="ml-auto flex items-center gap-1.5"
        >
          {user ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className={buttonClass("ghost", "sm")}>
                Sign in
              </Link>
              {/* Wrapped rather than using `hidden` on the button itself —
                  the variant's own `inline-flex` would fight it. */}
              <span className="hidden sm:block">
                <Link to="/signup" className={buttonClass("gold", "sm")}>
                  Join the club
                </Link>
              </span>
            </div>
          )}

          <button
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={mobileOpen}
            className="grid size-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-white/6 md:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
              <path
                d={mobileOpen ? "M18 6 6 18M6 6l12 12" : "M4 7h16M4 12h16M4 17h16"}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-b border-white/8 bg-void/95 backdrop-blur-xl md:hidden"
          >
            <div className="space-y-0.5 px-4 py-3">
              {/* Same active test as the desktop nav, so the two never disagree. */}
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm font-medium",
                    isItemActive(it, location.pathname) ? "bg-white/6 text-ink" : "text-ink-3",
                  )}
                >
                  {it.label}
                </NavLink>
              ))}
              {!user && (
                <Link
                  to="/signup"
                  className="mt-2 block rounded-lg bg-gold px-3 py-2.5 text-center text-sm font-semibold text-[color:var(--color-gold-ink)]"
                >
                  Join the club
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ── Page furniture ───────────────────────────────────────── */

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.main
      // Routes swing in on the X axis — a slight 3D hinge rather than a slide.
      initial={{ opacity: 0, y: 14, rotateX: 6 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1400, transformStyle: "preserve-3d" }}
      className={cn("relative mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8", className)}
    >
      {children}
    </motion.main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-gold">{eyebrow}</p>}
        <h1 className="display text-[clamp(28px,4.5vw,40px)]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Footer() {
  /**
   * The WhatsApp invite comes from editable club info rather than a constant, so
   * an organiser can replace it when WhatsApp resets the group link. Mounted once
   * in the app shell, so this is a single request for the whole session.
   */
  const loadClub = useCallback(() => api.clubInfo(), []);
  const { data: club } = useFetch(loadClub);

  return (
    <footer className="border-t border-white/8 py-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Logo compact />
          <p className="text-xs text-ink-3">
            B Squared Run Club · {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {club?.contact_email && (
            <a
              href={`mailto:${club.contact_email}`}
              className="text-xs text-ink-2 transition-colors hover:text-gold"
            >
              {club.contact_email}
            </a>
          )}
          <Link to="/about" className="text-xs text-ink-3 transition-colors hover:text-gold">
            About the club
          </Link>
          <Link to="/gallery" className="text-xs text-ink-3 transition-colors hover:text-gold">
            Gallery
          </Link>
          <p className="text-xs text-ink-3">Bring water.</p>
        </div>
      </div>
    </footer>
  );
}