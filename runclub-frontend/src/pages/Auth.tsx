import { motion } from "framer-motion";
import { useCallback, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "../components/layout";
import { Button, buttonClass, Field, Input, Select, Spinner, useToast } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";

/* Seeded by `npm run test:api` in the backend. Dev-only affordance. */
const DEMO_ACCOUNTS = [
  { label: "Organiser", email: "admin@runclub.com", password: "adminpassword" },
  { label: "Member", email: "member@runclub.com", password: "memberpassword" },
  { label: "Volunteer", email: "volunteer@runclub.com", password: "volunteerpassword" },
];

function AuthLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left: the pitch */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/8 p-10 lg:flex">
        <div
          className="absolute inset-0 -z-10 speedlines opacity-60"
          aria-hidden
        />
        <div
          className="absolute -left-32 top-1/4 -z-10 size-[32rem] rounded-full opacity-[0.13] blur-3xl"
          style={{ background: "var(--color-gold)" }}
          aria-hidden
        />
        <Logo />
        {aside}
        <p className="text-xs text-ink-3">B Squared Run Club · {new Date().getFullYear()}</p>
      </div>

      {/* Right: the form */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

/* ── Sign in ──────────────────────────────────────────────── */

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/events";

  const submit = async (e: React.FormEvent, creds?: { email: string; password: string }) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(creds?.email ?? email, creds?.password ?? password);
      toast(`Welcome back, ${user.name.split(" ")[0]}.`, "ok");
      navigate(user.role === "ADMIN" ? "/admin" : from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={
        <div className="max-w-md">
          <p className="eyebrow mb-4 text-gold">Members' entrance</p>
          <h2 className="display text-[clamp(34px,4.4vw,52px)]">
            The club runs
            <br />
            on <span className="text-gold">rhythm.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            Sign in to grab your spot on the next run, pull up your QR ticket, vote on routes and
            check where you sit on this week's board.
          </p>
        </div>
      }
    >
      <h1 className="display text-3xl">Sign in</h1>
      <p className="mt-2 text-sm text-ink-3">
        New here?{" "}
        <Link to="/signup" className="font-medium text-gold hover:underline">
          Join the club
        </Link>
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@runclub.com"
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <div className="-mt-2 text-right">
          <Link to="/forgot-password" className="text-[12.5px] text-ink-3 hover:text-gold">
            Forgotten your password?
          </Link>
        </div>

        {error && (
          <p className="rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[13px] text-ink-2">
            <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-failed)]">
              !
            </span>
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          Sign in
        </Button>
      </form>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-xl border border-white/8 bg-surface/60 p-4">
          <p className="eyebrow mb-3">Demo accounts</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={(e) => submit(e, a)}
                disabled={busy}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-gold/40 hover:text-ink disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

/* ── Join ─────────────────────────────────────────────────── */

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "MEMBER",
    emergency_contact: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }

    setBusy(true);
    try {
      const user = await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        emergency_contact: form.emergency_contact.trim() || undefined,
      });
      toast(`You're in. Welcome, ${user.name.split(" ")[0]}.`, "ok");
      navigate(user.role === "ADMIN" ? "/admin" : "/events", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={
        <div className="max-w-md">
          <p className="eyebrow mb-4 text-gold">New members</p>
          <h2 className="display text-[clamp(34px,4.4vw,52px)]">
            Show up.
            <br />
            That's the <span className="text-gold">hard part.</span>
          </h2>
          <dl className="mt-8 space-y-4">
            {[
              ["Members", "Register for runs, pay in-app, carry a QR ticket."],
              ["Volunteers", "Promoted by an organiser. Marshal a session, entry comped."],
              ["Visitors", "Browse the calendar and the forum, no account needed."],
            ].map(([term, def]) => (
              <div key={term} className="flex gap-3">
                <dt className="w-24 shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
                  {term}
                </dt>
                <dd className="text-[14px] leading-relaxed text-ink-2">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      }
    >
      <h1 className="display text-3xl">Join the club</h1>
      <p className="mt-2 text-sm text-ink-3">
        Already a member?{" "}
        <Link to="/login" className="font-medium text-gold hover:underline">
          Sign in
        </Link>
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Full name" htmlFor="name">
          <Input
            id="name"
            required
            autoComplete="name"
            value={form.name}
            onChange={set("name")}
            placeholder="Priya Nair"
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@runclub.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            placeholder="••••••••"
          />
        </Field>

        {/* Volunteer is not offered here: it comps entry to every event, so an
            organiser grants it from the directory. The backend refuses it on
            /register regardless of what the client sends. */}
        <Field
          label="I'm joining as"
          htmlFor="role"
          hint="Want to marshal? Join as a member and ask an organiser to promote you."
        >
          <Select id="role" value={form.role} onChange={set("role")}>
            <option value="MEMBER">Member — I want to run</option>
            <option value="VISITOR">Visitor — just looking</option>
          </Select>
        </Field>

        <Field
          label="Emergency contact"
          htmlFor="emergency"
          hint="Optional now, required before you register for a run."
        >
          <Input
            id="emergency"
            value={form.emergency_contact}
            onChange={set("emergency_contact")}
            placeholder="+91 99999 88888"
            autoComplete="tel"
          />
        </Field>

        {error && (
          <p className="rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[13px] text-ink-2">
            <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-failed)]">
              !
            </span>
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

/* ── Forgotten password ───────────────────────────────────── */

const RESET_ASIDE = (
  <div className="max-w-md">
    <p className="eyebrow mb-4 text-gold">Locked out</p>
    <h2 className="display text-[clamp(34px,4.4vw,52px)]">
      Happens to
      <br />
      <span className="text-gold">everyone.</span>
    </h2>
    <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
      We'll email you a single-use link. It expires in 45 minutes, and asking for a new one
      immediately retires the old link.
    </p>
  </div>
);

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Only ever set in development, where SMTP is unconfigured. */
  const [devLink, setDevLink] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setSent(true);
      setDevLink(res.reset_link ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the reset");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout aside={RESET_ASIDE}>
      <h1 className="display text-3xl">Reset your password</h1>

      {sent ? (
        <div className="mt-6 space-y-5">
          {/*
            Deliberately says nothing about whether the address exists — the
            backend answers identically either way, and so must this.
          */}
          <p className="rounded-xl border border-gold/25 bg-gold/8 px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-2">
            If that address has an account, a reset link is on its way. Check your inbox — and your
            spam folder.
          </p>

          {devLink && (
            <div className="rounded-xl border border-white/10 bg-surface/60 p-4">
              <p className="eyebrow mb-2">Development mode</p>
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                No SMTP is configured, so nothing was actually emailed. Use this link directly:
              </p>
              <Link
                to={devLink.replace(/^.*(?=\/reset-password)/, "")}
                className="mt-2.5 block break-all text-[12px] font-medium text-gold hover:underline"
              >
                {devLink}
              </Link>
            </div>
          )}

          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1" onClick={() => setSent(false)}>
              Use another email
            </Button>
            <Link to="/login" className={buttonClass("gold", "md", "flex-1")}>
              Back to sign in
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-3">
            Enter your email and we'll send you a link to set a new one.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="Email" htmlFor="reset-email">
              <Input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@runclub.com"
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[13px] text-ink-2">
                <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-failed)]">
                  !
                </span>
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              Send the reset link
            </Button>

            <p className="text-center text-[13px] text-ink-3">
              Remembered it?{" "}
              <Link to="/login" className="font-medium text-gold hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </>
      )}
    </AuthLayout>
  );
}

/* ── Choose a new password ────────────────────────────────── */

export function ResetPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const check = useCallback(
    (): Promise<{ valid: boolean; email?: string }> =>
      token ? api.checkResetToken(token) : Promise.resolve({ valid: false }),
    [token],
  );
  const { data, loading } = useFetch(check);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      await api.resetPassword(token, password);
      toast("Password changed — sign in with the new one.", "ok");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout aside={RESET_ASIDE}>
      {loading ? (
        <div className="flex items-center gap-3 text-sm text-ink-3">
          <Spinner className="size-4" />
          Checking your link…
        </div>
      ) : !data?.valid ? (
        <div className="space-y-5">
          <h1 className="display text-3xl">That link has expired</h1>
          <p className="text-[14px] leading-relaxed text-ink-2">
            Reset links work once and last 45 minutes. Asking for a new one also retires any
            earlier link, so if you requested it twice, only the newest email works.
          </p>
          <Link to="/forgot-password" className={buttonClass("gold", "lg", "w-full")}>
            Send a fresh link
          </Link>
        </div>
      ) : (
        <>
          <h1 className="display text-3xl">Set a new password</h1>
          <p className="mt-2 text-sm text-ink-3">
            For <span className="font-medium text-ink-2">{data.email}</span>
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
              <Input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <Field label="Confirm it" htmlFor="confirm-password">
              <Input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[13px] text-ink-2">
                <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-failed)]">
                  !
                </span>
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              Change my password
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
