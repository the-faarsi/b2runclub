import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/layout";
import { Button, Field, Input, Select, useToast } from "../components/ui";
import { useAuth } from "../lib/auth";

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
              ["Volunteers", "Marshal an event and your entry is comped."],
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

        <Field label="I'm joining as" htmlFor="role">
          <Select id="role" value={form.role} onChange={set("role")}>
            <option value="MEMBER">Member — I want to run</option>
            <option value="VOLUNTEER">Volunteer — I want to marshal</option>
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
