import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { BarList, ChartCard, DataTable, HeroFigure, TableToggle } from "../components/charts";
import { Medal } from "../components/icons";
import { Tilt } from "../components/tilt";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  Avatar,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, minsToHm } from "../lib/format";
import { useFetch } from "../lib/useFetch";

export function Leaderboard() {
  const { user } = useAuth();
  const load = useCallback(() => api.leaderboard(), []);
  const { data, loading, error, reload } = useFetch(load);
  const [showTable, setShowTable] = useState(false);

  const rows = data?.leaderboard ?? [];
  const totalKm = rows.reduce((s, r) => s + r.weekly_distance_km, 0);
  const totalRuns = rows.reduce((s, r) => s + r.runs_count, 0);
  const mine = rows.find((r) => r.user_id === user?.id);

  return (
    <Page>
      <PageScene variant="towers" opacity={0.28} />
      <PageHeader
        eyebrow={data?.club_name ?? "Strava"}
        title="This week's board"
        description="Distance logged by everyone who has linked Strava. Resets on Monday."
        action={
          user && !user.strava_id ? (
            <Link to="/profile" className={buttonClass("gold", "md")}>
              Link Strava
            </Link>
          ) : (
            <Link to="/profile" className={buttonClass("outline", "md")}>
              Your profile
            </Link>
          )
        }
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
          <Card className="p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-12 w-32" />
          </Card>
          <Card className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-full" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<span aria-hidden>▲</span>}
            title="Nobody's linked Strava yet"
            body="Link your account from your profile and you'll appear here after your next run."
            action={
              user ? (
                <Link to="/profile" className={buttonClass("gold", "sm")}>
                  Link Strava
                </Link>
              ) : (
                <Link to="/login" className={buttonClass("gold", "sm")}>
                  Sign in
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          {/* Hero figure — exactly one per view */}
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr]">
            <HeroFigure
              label="Club distance this week"
              value={`${totalKm.toFixed(1)} km`}
              caption={`${rows.length} athlete${rows.length === 1 ? "" : "s"} · ${totalRuns} runs logged`}
            />

            <Card className="p-6">
              <p className="eyebrow">Leader</p>
              <div className="mt-3 flex items-center gap-3">
                <Avatar name={rows[0].name} size={40} ring />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{rows[0].name}</p>
                  <p className="tnum text-[13px] text-ink-3">
                    {rows[0].weekly_distance_km.toFixed(1)} km · {rows[0].avg_pace}
                  </p>
                </div>
              </div>
              <div className="hairline my-4" />
              <p className="text-[12px] leading-relaxed text-ink-3">
                {rows.length > 1
                  ? `${(rows[0].weekly_distance_km - rows[1].weekly_distance_km).toFixed(1)} km clear of second place.`
                  : "Out in front, unopposed."}
              </p>
            </Card>

            <Card className="p-6">
              <p className="eyebrow">Your week</p>
              {mine ? (
                <>
                  <p className="display mt-3 text-[34px]">
                    {mine.weekly_distance_km.toFixed(1)}
                    <span className="ml-1 text-[16px] font-semibold text-ink-3">km</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
                    <span className="tnum">Rank #{mine.rank}</span>
                    <span className="tnum">{mine.runs_count} runs</span>
                    <span className="tnum">{mine.avg_pace}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                    You're not on the board yet.
                  </p>
                  <Link
                    to="/profile"
                    className={buttonClass("outline", "sm", "mt-4 w-full")}
                  >
                    {user ? "Link Strava" : "Sign in"}
                  </Link>
                </>
              )}
            </Card>
          </div>

          {/* Podium — the top three, raised in 3D by placing */}
          {rows.length >= 2 && (
            <div className="mt-5 grid grid-cols-3 items-end gap-3 sm:gap-5">
              {[rows[1], rows[0], rows[2]].filter(Boolean).map((r) => {
                const place = r.rank as 1 | 2 | 3;
                const height = place === 1 ? "h-28" : place === 2 ? "h-20" : "h-16";
                return (
                  <Tilt key={r.user_id} max={8} lift={8} className="text-center">
                    <div style={{ transformStyle: "preserve-3d" }}>
                      {/* Avatar is a fixed-size block, so it needs an explicit
                          centring wrapper; the Z-lift stays modest or the
                          perspective projection visibly detaches it. */}
                      <div
                        className="flex justify-center"
                        style={{ transform: "translateZ(14px)" }}
                      >
                        <Avatar
                          name={r.name}
                          size={place === 1 ? 56 : 44}
                          ring={r.user_id === user?.id}
                        />
                      </div>
                      <p className="mt-2 truncate text-[13px] font-semibold text-ink">
                        {r.name.split(" ")[0]}
                      </p>
                      <p className="tnum text-[11px] text-ink-3">
                        {r.weekly_distance_km.toFixed(1)} km
                      </p>
                      <div
                        className={cn(
                          "podium mt-2 grid place-items-center rounded-t-xl border border-white/8",
                          height,
                          place === 1
                            ? "bg-gradient-to-b from-gold/28 to-gold/5"
                            : "bg-gradient-to-b from-white/10 to-white/2",
                        )}
                      >
                        <Medal place={place} className={place === 1 ? "size-8" : "size-6"} />
                      </div>
                    </div>
                  </Tilt>
                );
              })}
            </div>
          )}

          {/* Distance chart — single series, so no legend box */}
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
            <ChartCard
              title="Weekly distance"
              subtitle="Kilometres logged since Monday"
              action={
                <TableToggle showing={showTable} onToggle={() => setShowTable((s) => !s)} />
              }
            >
              {showTable ? (
                <DataTable
                  columns={["Athlete", "Distance (km)", "Runs", "Pace"]}
                  rows={rows.map((r) => [
                    r.name,
                    r.weekly_distance_km.toFixed(1),
                    r.runs_count,
                    r.avg_pace,
                  ])}
                />
              ) : (
                <BarList
                  unit=" km"
                  format={(v) => v.toFixed(1)}
                  data={rows.map((r) => ({
                    id: r.user_id,
                    label: r.name,
                    value: r.weekly_distance_km,
                    meta: r.avg_pace,
                    isYou: r.user_id === user?.id,
                  }))}
                />
              )}
            </ChartCard>

            {/* Standings table */}
            <Card className="overflow-hidden p-0">
              <div className="border-b border-white/8 px-5 py-4">
                <h3 className="text-[15px] font-semibold text-ink">Standings</h3>
                <p className="mt-1 text-xs text-ink-3">Ranked by distance</p>
              </div>

              <ol>
                {rows.map((r, i) => {
                  const isMe = r.user_id === user?.id;
                  return (
                    <motion.li
                      key={r.user_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.3) }}
                      className={cn(
                        "flex items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0",
                        isMe && "bg-gold/6",
                      )}
                    >
                      <span className="grid w-7 shrink-0 place-items-center">
                        {r.rank <= 3 ? (
                          <Medal place={r.rank as 1 | 2 | 3} className="size-6" />
                        ) : (
                          <span className="tnum text-[13px] font-bold text-ink-3">{r.rank}</span>
                        )}
                      </span>

                      <Avatar name={r.name} size={32} ring={isMe} />

                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-[13.5px] font-medium text-ink">
                          {r.name}
                          {isMe && (
                            <span className="shrink-0 rounded-full bg-gold/16 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                              You
                            </span>
                          )}
                        </p>
                        <p className="tnum text-[11px] text-ink-3">
                          {r.runs_count} runs · {minsToHm(r.moving_time_mins)} · {r.avg_pace}
                        </p>
                      </div>

                      <span className="tnum shrink-0 text-[14px] font-semibold text-ink">
                        {r.weekly_distance_km.toFixed(1)}
                        <span className="ml-0.5 text-[11px] font-normal text-ink-3">km</span>
                      </span>
                    </motion.li>
                  );
                })}
              </ol>
            </Card>
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-ink-3">
            Figures come from the club's Strava integration. The backend currently serves
            deterministic sample stats for every linked athlete.
          </p>
        </>
      )}
    </Page>
  );
}
