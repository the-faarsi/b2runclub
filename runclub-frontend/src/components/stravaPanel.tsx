import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { cn, eventDate, eventTime, secsToClock } from "../lib/format";
import type { StravaActivity } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { Badge, Button, Card, Skeleton, useToast } from "./ui";

/** Strava's own mark, so the button is recognisable. */
function StravaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-4"} aria-hidden>
      <path
        fill="currentColor"
        d="M13.83 17.25 11.4 12.4l-2.44 4.85H5.28L11.4 5.1l6.11 12.15h-3.68Z"
      />
      <path fill="currentColor" opacity="0.6" d="M15.5 17.25 13.83 20.6l-1.67-3.35h3.34Z" />
    </svg>
  );
}

/**
 * Strava connection for the signed-in member.
 *
 * Replaces a free-text "athlete ID" field that accepted any string, saved it, and
 * reported success — nothing was ever connected. The athlete id now comes from
 * Strava itself during the token exchange, so it cannot be invented.
 */
export function StravaPanel() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const loadLink = useCallback(() => api.stravaLink(), []);
  const { data: link, loading, reload } = useFetch(loadLink);

  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<StravaActivity[] | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [loadingActs, setLoadingActs] = useState(false);

  /**
   * Strava redirects back to /profile?strava=… after consent. Report the outcome,
   * then strip the query so a refresh doesn't replay the message.
   */
  useEffect(() => {
    const outcome = params.get("strava");
    if (!outcome) return;

    const reason = params.get("reason");
    if (outcome === "connected") toast("Strava connected.", "ok");
    else if (outcome === "denied") toast("Strava linking was cancelled — nothing changed.", "info");
    else toast(reason || "Strava linking failed.", "err");

    const next = new URLSearchParams(params);
    next.delete("strava");
    next.delete("reason");
    setParams(next, { replace: true });
    reload();
    // `params` is intentionally the only trigger; reload/setParams are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await api.stravaAuthorizeUrl();
      // Full navigation, not fetch — the consent screen is Strava's own page.
      window.location.href = url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start Strava linking", "err");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await api.disconnectStrava();
      toast(res.message, "ok");
      setActivities(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not disconnect", "err");
    } finally {
      setBusy(false);
    }
  };

  const fetchActivities = async () => {
    setActError(null);
    setLoadingActs(true);
    try {
      const res = await api.stravaActivities(15);
      setActivities(res.activities);
      if (res.activities.length === 0) setActError("Strava returned no recent activities.");
      reload();
    } catch (err) {
      setActError(err instanceof Error ? err.message : "Could not fetch activities");
    } finally {
      setLoadingActs(false);
    }
  };

  if (loading) {
    return (
      <Card className="mt-5 p-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-4 h-20 w-full rounded-xl" />
      </Card>
    );
  }

  const configured = link?.configured ?? false;
  const connected = link?.connected ?? false;

  return (
    <Card className="mt-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <StravaIcon className="size-4 text-[#fc4c02]" />
            Strava
          </h3>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-3">
            Connect your own Strava account so your runs count towards the club board. You approve
            it on Strava — this app never sees your Strava password.
          </p>
        </div>
        {connected && (
          <Badge color="var(--color-paid)" icon="✓">
            Connected
          </Badge>
        )}
      </div>

      {/* ── Not configured on the server ─────────────── */}
      {!configured && (
        <div className="mt-4 rounded-xl border border-[color:var(--color-pending)]/30 bg-[color:var(--color-pending)]/8 px-4 py-3.5">
          <p className="text-[13px] font-semibold text-ink">Strava isn't set up yet</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
            An organiser needs to register the club's Strava API application and add the credentials
            to the server. Until then there's nothing to connect to — which is why the old
            "paste your athlete ID" box has been removed: it never actually linked anything.
          </p>
        </div>
      )}

      {/* ── Configured and connected ─────────────────── */}
      {configured && connected && link?.athlete && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3.5 rounded-xl border border-white/8 bg-surface-2/50 p-4">
            {link.athlete.avatar_url ? (
              <img
                src={link.athlete.avatar_url}
                alt=""
                className="size-11 shrink-0 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#fc4c02]/15">
                <StravaIcon className="size-5 text-[#fc4c02]" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">
                {link.athlete.name ?? `Athlete ${link.athlete.athlete_id}`}
              </p>
              <p className="text-[12px] text-ink-3">
                {[
                  link.athlete.username && `@${link.athlete.username}`,
                  [link.athlete.city, link.athlete.country].filter(Boolean).join(", ") || null,
                ]
                  .filter(Boolean)
                  .join(" · ") || `ID ${link.athlete.athlete_id}`}
              </p>
            </div>
            <a
              href={link.athlete.profile_url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[12px] font-medium text-gold hover:underline"
            >
              View on Strava →
            </a>
          </div>

          <p className="mt-2.5 text-[11.5px] text-ink-3">
            Connected {link.connected_at ? eventDate(link.connected_at) : "—"}
            {link.last_synced_at && ` · last synced ${eventDate(link.last_synced_at)}`}
            {link.scope && ` · scope: ${link.scope}`}
          </p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button loading={loadingActs} onClick={fetchActivities}>
              {activities ? "Refresh activities" : "Load my recent activities"}
            </Button>
            <Button variant="ghost" loading={busy} onClick={disconnect}>
              Disconnect
            </Button>
          </div>

          {actError && (
            <p className="mt-3 rounded-xl border border-[color:var(--color-pending)]/30 bg-[color:var(--color-pending)]/8 px-3.5 py-2.5 text-[12.5px] text-ink-2">
              {actError}
            </p>
          )}

          {activities && activities.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow mb-2">Recent activities · live from Strava</p>
              <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/8">
                {activities.map((a, i) => (
                  <motion.li
                    key={a.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: Math.min(i * 0.03, 0.25) }}
                    className="flex flex-wrap items-center gap-3 bg-surface/40 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[13.5px] font-medium text-ink hover:text-gold"
                      >
                        {a.name}
                      </a>
                      <p className="text-[11.5px] text-ink-3">
                        {a.type} · {eventDate(a.started_at)} {eventTime(a.started_at)}
                        {a.elevation_m ? ` · ${Math.round(a.elevation_m)} m climb` : ""}
                      </p>
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                      <p className="text-[13px] tnum text-ink-2">
                        {a.distance_km != null ? `${a.distance_km} km` : "—"}
                      </p>
                      {a.moving_secs != null && (
                        <p className="text-[11px] tnum text-ink-3">{secsToClock(a.moving_secs)}</p>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                Fetched on demand. Strava allows 100 requests per 15 minutes across the whole app,
                so this isn't polled automatically.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Configured, not yet connected ────────────── */}
      {configured && !connected && (
        <div className="mt-4">
          <Button
            loading={busy}
            onClick={connect}
            className={cn("bg-[#fc4c02] text-white hover:bg-[#e34402]")}
          >
            <StravaIcon className="size-4" />
            Connect with Strava
          </Button>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
            Takes you to Strava to approve access to your activity list. You can disconnect here at
            any time, and doing so revokes it on Strava too.
          </p>
        </div>
      )}
    </Card>
  );
}
