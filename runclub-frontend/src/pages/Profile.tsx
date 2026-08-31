import { Link } from "react-router-dom";
import { SparkIcon } from "../components/icons";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import { Avatar, Badge, Button, buttonClass, Card } from "../components/ui";
import { AccountSettings } from "../components/accountSettings";
import { HealthSyncCard } from "../components/healthSync";
import { MyResultsCard, StreakCard } from "../components/streaks";
import { useAuth } from "../lib/auth";
import { fullDate, ROLE_META } from "../lib/format";

export function Profile() {
  const { user, logout, canRegister } = useAuth();

  if (!user) return null;
  const meta = ROLE_META[user.role] ?? ROLE_META.MEMBER;

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

      {/* Everything editable, in one place */}
      <Card className="mt-5 p-6">
        <h3 className="text-[15px] font-semibold text-ink">Your details</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          Edit any of these yourself. Changes take effect straight away.
        </p>
        <div className="mt-5">
          <AccountSettings />
        </div>
      </Card>

      {/* Attendance record and badges — only meaningful for people who run */}
      {canRegister && (
        <>
          <StreakCard />
          <MyResultsCard />
          <HealthSyncCard />
        </>
      )}

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
                club ID card, junction calls, and a briefing 15 minutes before the start.
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
