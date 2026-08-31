import { motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";
import { cn, eventDate, eventTime, minsToHm, secsToClock } from "../lib/format";
import type { HealthWorkout } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { CycleIcon, RunIcon, SwimIcon } from "./icons";
import { Button, Card, Modal, Skeleton, Tabs, useToast } from "./ui";

/**
 * Which icon to show per parsed activity label. Apple has dozens of activity
 * types and adds more each release, so this matches on substrings and falls back
 * to the run mark rather than trying to enumerate them.
 */
function ActivityIcon({ type, className }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  if (t.includes("cycl") || t.includes("bike")) return <CycleIcon className={className} />;
  if (t.includes("swim")) return <SwimIcon className={className} />;
  if (t.includes("walk") || t.includes("hik")) return <WalkIcon className={className} />;
  return <RunIcon className={className} />;
}

/** Not in icons.tsx because walking only ever appears in an imported log. */
function WalkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-5"} fill="none" aria-hidden>
      <circle cx="13" cy="4" r="1.9" fill="currentColor" />
      <path
        d="M12.4 8.2 10 11.6l2.6 2 .7 3.6M12.4 8.2l2.8.9 1.4 3M12.6 13.6 10.4 21M13.3 17.2 15 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Window = "7" | "30" | "all";

/**
 * Health-app sync for the signed-in member.
 *
 * This imports a file the member exports from their phone rather than syncing in
 * the background, and the UI says so plainly — Apple HealthKit and Android Health
 * Connect are both on-device APIs with no server endpoint, so there is nothing a
 * web backend can authenticate against. Pretending otherwise would set an
 * expectation the platform cannot meet.
 */
export function HealthSyncCard() {
  const toast = useToast();
  const load = useCallback(() => api.myHealth(), []);
  const { data, loading, error, reload } = useFetch(load);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [window_, setWindow] = useState<Window>("30");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.importHealth(file);
      toast(
        res.truncated
          ? `${res.message} — only the most recent were kept, that export is very large.`
          : res.message,
        "ok",
      );
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed", "err");
    } finally {
      setBusy(false);
      // Reset so re-picking the same file still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clearAll = async () => {
    try {
      const res = await api.clearHealth();
      toast(res.message, "ok");
      setConfirmClear(false);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not clear", "err");
    }
  };

  const removeOne = async (w: HealthWorkout) => {
    try {
      await api.deleteWorkout(w.id);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove", "err");
    }
  };

  const totals =
    window_ === "7" ? data?.last_7_days : window_ === "30" ? data?.last_30_days : data?.all_time;

  const hasData = (data?.total_count ?? 0) > 0;

  return (
    <Card className="mt-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">Health app</h3>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-3">
            Bring your runs across from Apple Health, or from any watch that exports GPX. Your
            workouts stay private — organisers never see them.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={() => setHelpOpen(true)}>
            How?
          </Button>
          <Button size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
            {hasData ? "Import again" : "Import workouts"}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xml,.gpx,application/xml,text/xml,application/gpx+xml"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      {loading ? (
        <Skeleton className="mt-5 h-24 w-full rounded-xl" />
      ) : error ? (
        <p className="mt-4 rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-2.5 text-[13px] text-ink-2">
          {error}
        </p>
      ) : !hasData ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/12 p-6 text-center">
          <p className="text-[13.5px] font-medium text-ink">Nothing imported yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-ink-3">
            On iPhone: Health → your photo → Export All Health Data. Unzip it and upload the{" "}
            <code className="rounded bg-white/8 px-1 py-0.5 text-[11.5px]">export.xml</code> inside.
            Or drop in a single <code className="rounded bg-white/8 px-1 py-0.5 text-[11.5px]">.gpx</code>{" "}
            from your watch.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <Tabs<Window>
              value={window_}
              onChange={setWindow}
              tabs={[
                { value: "7", label: "Last 7 days" },
                { value: "30", label: "Last 30 days" },
                { value: "all", label: "All time", count: data?.total_count },
              ]}
            />
          </div>

          {totals && (
            <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-3">
              <div className="bg-surface p-4">
                <p className="eyebrow">Distance</p>
                <p className="display mt-1.5 text-[26px] leading-none tnum text-gold">
                  {totals.distance_km}
                  <span className="ml-1 text-[12px] font-normal text-ink-3">km</span>
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="eyebrow">Moving time</p>
                <p className="display mt-1.5 text-[26px] leading-none tnum">
                  {minsToHm(Math.round(totals.moving_secs / 60))}
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="eyebrow">Workouts</p>
                <p className="display mt-1.5 text-[26px] leading-none tnum">{totals.workouts}</p>
              </div>
            </div>
          )}

          {/* Activity mix */}
          {data && data.by_type.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.by_type.map((t) => (
                <span
                  key={t.activity_type}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2/50 px-3 py-1.5 text-[12px] text-ink-2"
                >
                  <ActivityIcon type={t.activity_type} className="size-3.5 text-gold" />
                  {t.activity_type}
                  <span className="tnum text-ink-3">{t.count}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-5">
            <p className="eyebrow mb-2.5">Recent workouts</p>
            <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/8">
              {(data?.workouts ?? []).slice(0, 12).map((w, i) => (
                <motion.li
                  key={w.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.25) }}
                  className="group flex flex-wrap items-center gap-3 bg-surface/40 px-4 py-3"
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/6"
                    aria-hidden
                  >
                    <ActivityIcon type={w.activity_type} className="size-4 text-gold" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink">
                      {w.activity_type}
                      {w.distance_km != null && (
                        <span className="ml-2 tnum font-normal text-ink-2">{w.distance_km} km</span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-ink-3">
                      {eventDate(w.started_at)} · {eventTime(w.started_at)}
                      {w.device && ` · ${w.device}`}
                      {w.source === "gpx" && " · GPX"}
                    </p>
                  </div>

                  <div className="ml-auto shrink-0 text-right">
                    <p className="tnum text-[13px] text-ink-2">{secsToClock(w.duration_secs)}</p>
                    {w.energy_kcal != null && (
                      <p className="text-[11px] tnum text-ink-3">{w.energy_kcal} kcal</p>
                    )}
                  </div>

                  <button
                    onClick={() => void removeOne(w)}
                    className={cn(
                      "shrink-0 text-[11px] text-ink-3 opacity-0 transition-all",
                      "hover:text-[color:var(--color-failed)] focus-visible:opacity-100 group-hover:opacity-100",
                    )}
                    aria-label={`Remove ${w.activity_type} on ${eventDate(w.started_at)}`}
                  >
                    Remove
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => setConfirmClear(true)}
            className="mt-4 text-[12px] text-ink-3 transition-colors hover:text-[color:var(--color-failed)]"
          >
            Remove all imported workouts
          </button>
        </>
      )}

      {/* ── How-to ─────────────────────────────────────── */}
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Getting your workouts in"
        subtitle="Two routes, both take about a minute"
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-white/8 bg-surface-2/50 p-4">
            <p className="text-[13.5px] font-semibold text-ink">iPhone · Apple Health</p>
            <ol className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
              {[
                "Open Health and tap your profile photo, top right.",
                "Scroll down and tap Export All Health Data, then Export.",
                "Share it to Files, then unzip it on your phone or computer.",
                "Upload the export.xml from the apple_health_export folder.",
              ].map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="mt-px shrink-0 font-bold tnum text-gold">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-white/8 bg-surface-2/50 p-4">
            <p className="text-[13.5px] font-semibold text-ink">Any watch · single run</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              Garmin, Coros, Polar and Suunto all export a run as GPX. Upload that and it
              lands here as one workout, with the distance and duration read from the track.
            </p>
          </div>

          {/*
            Stated openly rather than buried: a member who expects a live sync and
            doesn't get one will assume the feature is broken.
          */}
          <div className="rounded-xl border border-gold/25 bg-gold/[0.06] p-4">
            <p className="text-[13px] font-semibold text-gold">Why isn't this automatic?</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              Apple Health lives on your phone, not on Apple's servers — there's no account a
              website can connect to, by design. Android's Health Connect works the same way. An
              export you choose to share is the only route that doesn't need us to ship a phone app,
              and it means nothing leaves your device unless you send it.
            </p>
          </div>

          <div className="rounded-xl border border-white/8 px-4 py-3">
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Importing the same export twice is safe — workouts are matched on their start time and
              duration, so nothing doubles up.
            </p>
          </div>

          <Button className="w-full" onClick={() => setHelpOpen(false)}>
            Got it
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Remove all imported workouts?"
        subtitle={`${data?.total_count ?? 0} workouts`}
      >
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            This deletes every workout you've imported. Nothing happens to the data in your Health
            app — you can import it again whenever you like.
          </p>
          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmClear(false)}>
              Keep them
            </Button>
            <Button variant="danger" className="flex-1" onClick={clearAll}>
              Remove all
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
