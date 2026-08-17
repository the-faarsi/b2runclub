import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StatTile } from "../../components/charts";
import { SearchIcon, SparkIcon, UsersIcon } from "../../components/icons";
import { Page, PageHeader } from "../../components/layout";
import { PageScene } from "../../components/scene3d";
import { Confetti } from "../../components/motion";
import { Tilt } from "../../components/tilt";
import {
  Avatar,
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  Tabs,
  useToast,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { cn, fullDate, ROLE_META } from "../../lib/format";
import type { AssignableRole, Member } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

type Filter = "all" | "MEMBER" | "VOLUNTEER" | "VISITOR" | "ADMIN";

const ROLE_TINT: Record<string, string> = {
  ADMIN: "var(--color-gold)",
  VOLUNTEER: "var(--color-free)",
  MEMBER: "var(--color-paid)",
  VISITOR: "var(--color-ink-3)",
};

/** What each role can actually do, shown so a change is never a guess. */
const ROLE_EXPLAINER: Record<AssignableRole, string> = {
  VOLUNTEER:
    "Marshals events and registers for free — entry is comped automatically on every future registration.",
  MEMBER: "Registers for events and pays the entry fee. Can post, comment and vote.",
  VISITOR:
    "Read-only. Can browse events, polls and the leaderboard, but cannot register, post or vote.",
};

export function ManageMembers() {
  const { user } = useAuth();
  const toast = useToast();

  const load = useCallback(() => api.members(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ member: Member; role: AssignableRole } | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const members = data ?? [];

  const counts = useMemo(
    () => ({
      all: members.length,
      ADMIN: members.filter((m) => m.role === "ADMIN").length,
      VOLUNTEER: members.filter((m) => m.role === "VOLUNTEER").length,
      MEMBER: members.filter((m) => m.role === "MEMBER").length,
      VISITOR: members.filter((m) => m.role === "VISITOR").length,
    }),
    [members],
  );

  const visible = useMemo(() => {
    let list = filter === "all" ? members : members.filter((m) => m.role === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [members, filter, query]);

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await api.setMemberRole(pending.member.id, pending.role);
      setData((prev) =>
        (prev ?? []).map((m) => (m.id === pending.member.id ? { ...m, role: pending.role } : m)),
      );
      if (res.changed && pending.role === "VOLUNTEER") {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 1700);
      }
      toast(res.message, "ok");
      setPending(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change the role", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageScene variant="orb" opacity={0.2} />
      <Confetti show={celebrate} />

      <PageHeader
        eyebrow="Organiser"
        title="Members"
        description="The club directory. Promote a member to volunteer and their entry is comped from then on."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin" className={buttonClass("ghost", "md")}>
              Dashboard
            </Link>
            <Link to="/admin/events" className={buttonClass("ghost", "md")}>
              Events
            </Link>
          </div>
        }
      />

      {/* Roll-up */}
      {!loading && !error && members.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="People"
            value={String(counts.all)}
            countTo={counts.all}
            countFormat={(v) => String(Math.round(v))}
            icon={<UsersIcon className="size-4" />}
            sub="Everyone with an account"
          />
          <StatTile
            label="Volunteers"
            value={String(counts.VOLUNTEER)}
            countTo={counts.VOLUNTEER}
            countFormat={(v) => String(Math.round(v))}
            accent="var(--color-free)"
            sub="Comped entry on every event"
          />
          <StatTile
            label="Members"
            value={String(counts.MEMBER)}
            countTo={counts.MEMBER}
            countFormat={(v) => String(Math.round(v))}
            accent="var(--color-paid)"
            sub="Pay the entry fee"
          />
          <StatTile
            label="Organisers"
            value={String(counts.ADMIN)}
            countTo={counts.ADMIN}
            countFormat={(v) => String(Math.round(v))}
            accent="var(--color-gold)"
            sub="Cannot be changed here"
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "Everyone", count: counts.all },
            { value: "MEMBER", label: "Members", count: counts.MEMBER },
            { value: "VOLUNTEER", label: "Volunteers", count: counts.VOLUNTEER },
            { value: "VISITOR", label: "Visitors", count: counts.VISITOR },
          ]}
        />

        <div className="relative ml-auto w-full sm:w-64">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <SearchIcon className="size-4" />
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search members"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="flex items-center gap-4 p-5">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-9 w-32 rounded-lg" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title={query ? "Nobody matches that" : "No one in this group"}
            body={
              query
                ? "Try a different name or email address."
                : "Switch tabs to see the rest of the club."
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((m, i) => {
            const meta = ROLE_META[m.role] ?? ROLE_META.MEMBER;
            const isSelf = m.id === user?.id;
            const isOrganiser = m.role === "ADMIN";
            const locked = isSelf || isOrganiser;

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: Math.min(i * 0.04, 0.24) }}
              >
                <Tilt max={4} lift={6} glare={false}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center gap-4" style={{ transformStyle: "preserve-3d" }}>
                    <div style={{ transform: "translateZ(22px)" }}>
                      <Avatar name={m.name} size={44} ring={m.role === "VOLUNTEER"} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">{m.name}</span>
                        <Badge color={ROLE_TINT[m.role]}>{meta.label}</Badge>
                        {m.role === "VOLUNTEER" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-free)]/12 px-2 py-0.5">
                            <SparkIcon className="size-3 text-[color:var(--color-free)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--color-free)]">
                              Comped entry
                            </span>
                          </span>
                        )}
                        {isSelf && (
                          <span className="rounded-full bg-gold/16 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                            You
                          </span>
                        )}
                      </div>

                      <p className="mt-1 truncate text-[13px] text-ink-3">{m.email}</p>

                      <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
                        <span className="tnum">
                          {m.registration_count} registration
                          {m.registration_count === 1 ? "" : "s"}
                        </span>
                        <span>·</span>
                        <span>Joined {fullDate(m.created_at)}</span>
                        {m.strava_linked && (
                          <>
                            <span>·</span>
                            <span>Strava linked</span>
                          </>
                        )}
                        {!m.has_emergency_contact && m.role !== "VISITOR" && (
                          <>
                            <span>·</span>
                            <span className="text-[color:var(--color-pending)]">
                              No emergency contact
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                      {locked ? (
                        <span className="text-[12px] text-ink-3">
                          {isSelf ? "You can't change your own role" : "Organiser"}
                        </span>
                      ) : (
                        <>
                          {m.role !== "VOLUNTEER" && (
                            <Button
                              size="sm"
                              onClick={() => setPending({ member: m, role: "VOLUNTEER" })}
                            >
                              Promote to volunteer
                            </Button>
                          )}
                          {m.role !== "MEMBER" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPending({ member: m, role: "MEMBER" })}
                            >
                              {m.role === "VOLUNTEER" ? "Back to member" : "Make member"}
                            </Button>
                          )}
                          {m.role !== "VISITOR" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ member: m, role: "VISITOR" })}
                            >
                              Restrict
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
                </Tilt>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Confirm — a role change alters what someone pays, so it is explicit */}
      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={
          pending?.role === "VOLUNTEER"
            ? "Promote to volunteer?"
            : pending?.role === "VISITOR"
              ? "Restrict to visitor?"
              : "Change to member?"
        }
        subtitle={pending ? `${pending.member.name} · ${pending.member.email}` : undefined}
      >
        {pending && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-surface-2/60 p-4">
              <Badge color={ROLE_TINT[pending.member.role]}>
                {(ROLE_META[pending.member.role] ?? ROLE_META.MEMBER).label}
              </Badge>
              <svg viewBox="0 0 24 24" className="size-4 text-ink-3" fill="none" aria-hidden>
                <path
                  d="M5 12h14m-6-6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <Badge color={ROLE_TINT[pending.role]}>
                {(ROLE_META[pending.role] ?? ROLE_META.MEMBER).label}
              </Badge>
            </div>

            <p className="text-[13.5px] leading-relaxed text-ink-2">
              {ROLE_EXPLAINER[pending.role]}
            </p>

            {/* The one genuinely surprising bit: history is not rewritten. */}
            {pending.member.registration_count > 0 && (
              <p className="rounded-xl border border-[color:var(--color-pending)]/25 bg-[color:var(--color-pending)]/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <span
                  aria-hidden
                  className="mr-1.5 font-bold text-[color:var(--color-pending)]"
                >
                  ◍
                </span>
                {pending.member.name.split(" ")[0]} has {pending.member.registration_count} existing
                registration
                {pending.member.registration_count === 1 ? "" : "s"}. Those keep their current
                payment status — this only affects registrations made from now on.
              </p>
            )}

            <p className="text-[12px] text-ink-3">
              They'll get a notification explaining the change.
            </p>

            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                className={cn("flex-1")}
                variant={pending.role === "VISITOR" ? "danger" : "gold"}
                loading={busy}
                onClick={apply}
              >
                {pending.role === "VOLUNTEER"
                  ? "Promote"
                  : pending.role === "VISITOR"
                    ? "Restrict"
                    : "Change role"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
