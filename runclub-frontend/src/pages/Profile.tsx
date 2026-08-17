import { useState } from "react";
import { Link } from "react-router-dom";
import { SparkIcon } from "../components/icons";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  Avatar,
  Badge,
  Button,
  buttonClass,
  Card,
  Field,
  Input,
  useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fullDate, ROLE_META } from "../lib/format";

export function Profile() {
  const { user, patchUser, logout } = useAuth();
  const toast = useToast();

  const [strava, setStrava] = useState(user?.strava_id ?? "");
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const meta = ROLE_META[user.role] ?? ROLE_META.MEMBER;

  const linkStrava = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = strava.trim();
    if (!id) return;

    setBusy(true);
    try {
      const res = await api.linkStrava(id);
      patchUser({ strava_id: res.user.strava_id });
      toast("Strava linked — you'll show on the board after your next run.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not link Strava", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page className="max-w-3xl">
      <PageScene variant="orb" opacity={0.26} />
      <PageHeader eyebrow="Account" title="Your profile" />

      {/* Identity */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={user.name} size={64} ring />
          <div className="min-w-0 flex-1">
            <h2 className="display text-2xl">{user.name}</h2>
            <p className="mt-1 truncate text-[13px] text-ink-3">{user.email}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge color="var(--color-gold)">{meta.label}</Badge>
              {user.strava_id && (
                <Badge color="var(--color-free)" icon="★">
                  Strava linked
                </Badge>
              )}
            </div>
          </div>
        </div>

        {user.created_at && (
          <>
            <div className="hairline my-5" />
            <p className="text-[12px] text-ink-3">Member since {fullDate(user.created_at)}</p>
          </>
        )}
      </Card>

      {/* Volunteer perks — the one benefit worth stating outright */}
      {user.role === "VOLUNTEER" && (
        <Card className="mt-5 border-[color:var(--color-free)]/25 p-6">
          <div className="flex items-start gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl"
              style={{ background: "color-mix(in oklab, var(--color-free) 16%, transparent)" }}
              aria-hidden
            >
              <SparkIcon className="size-[18px] text-[color:var(--color-free)]" />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">You're a club volunteer</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                Your entry is comped on every event — registrations are free and your ticket is
                issued immediately, with no payment step. In return you marshal the session: gold
                bib, junction calls, and a briefing 15 minutes before the start.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/calendar" className={buttonClass("outline", "sm")}>
                  Pick a session
                </Link>
                <Link to="/tickets" className={buttonClass("ghost", "sm")}>
                  Your tickets
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Members: tell them the promotion exists and how to get it */}
      {user.role === "MEMBER" && (
        <Card className="mt-5 p-6">
          <div className="flex items-start gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/6"
              aria-hidden
            >
              <SparkIcon className="size-[18px] text-ink-3" />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Fancy volunteering?</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                Volunteers marshal a session and get their entry comped — every registration free,
                no payment step. Ask an organiser in the forum and they can promote your account.
              </p>
              <Link to="/forum" className={buttonClass("outline", "sm", "mt-4")}>
                Ask in the forum
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Emergency contact — read-only reflection of what the API stores */}
      <Card className="mt-5 p-6">
        <h3 className="text-[15px] font-semibold text-ink">Emergency contact</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          Shared with organisers on event day. It's saved the first time you register, and you can
          update it from any registration form.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-surface-2/50 px-4 py-3">
          <span className="text-[14px] text-ink">
            {user.emergency_contact ? (
              user.emergency_contact
            ) : (
              <span className="text-ink-3">Not set yet</span>
            )}
          </span>
          <Link to="/events" className={buttonClass("outline", "sm")}>
            {user.emergency_contact ? "Update at next registration" : "Add on registration"}
          </Link>
        </div>
      </Card>

      {/* Strava */}
      <Card className="mt-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Strava</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
              Link your athlete ID to appear on the club leaderboard.
            </p>
          </div>
          {user.strava_id && (
            <Link
              to="/leaderboard"
              className="shrink-0 text-[12px] font-medium text-gold hover:underline"
            >
              See the board →
            </Link>
          )}
        </div>

        <form onSubmit={linkStrava} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Field
              label="Strava athlete ID"
              htmlFor="strava"
              hint="The number in your Strava profile URL, e.g. strava.com/athletes/12345678"
            >
              <Input
                id="strava"
                value={strava}
                onChange={(e) => setStrava(e.target.value)}
                placeholder="12345678"
                inputMode="numeric"
              />
            </Field>
          </div>
          <Button type="submit" loading={busy} disabled={!strava.trim()}>
            {user.strava_id ? "Update link" : "Link account"}
          </Button>
        </form>
      </Card>

      {/* Session */}
      <Card className="mt-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Session</h3>
            <p className="mt-1.5 text-[13px] text-ink-3">
              Your sign-in lasts 24 hours, then you'll be asked again.
            </p>
          </div>
          <Button variant="outline" onClick={logout}>
            Sign out
          </Button>
        </div>
      </Card>
    </Page>
  );
}
