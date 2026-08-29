import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Button, Card, Field, Input, useToast } from "./ui";

/**
 * Organiser control for the home page background video.
 *
 * A URL rather than an upload, deliberately. A hero clip that looks like
 * anything is several megabytes, and the deployment rejects request bodies over
 * 4.5MB — so an upload field would fail for precisely the files people have.
 * Pointing at a file served from `public/` or object storage sidesteps that and
 * gets a CDN in front of it.
 */
export function HeroVideoPanel() {
  const toast = useToast();
  const load = useCallback(() => api.clubInfo(), []);
  const { data: club, setData } = useFetch(load);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(club?.hero_video_url ?? "");
  }, [club?.hero_video_url]);

  const current = club?.hero_video_url ?? null;
  const dirty = url.trim() !== (current ?? "");

  const save = async (next: string) => {
    setBusy(true);
    try {
      // Empty string clears it server-side, which is how "Remove" works.
      const updated = await api.updateClubInfo({ hero_video_url: next });
      setData(() => updated);
      toast(next ? "Hero video updated." : "Hero video removed.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-[15px] font-semibold text-ink">Home page video</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        Plays muted on a loop behind the headline. Leave it empty to keep the 3D graphic.
      </p>

      <div className="mt-5 space-y-4">
        <Field
          label="Video URL"
          htmlFor="hero-video"
          hint="An .mp4 or .webm. Drop the file in the site's public folder and use /hero.mp4, or paste a link from storage."
        >
          <Input
            id="hero-video"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/hero.mp4"
            inputMode="url"
          />
        </Field>

        {/* A silent preview, so a wrong or dead link is obvious here rather than
            on the public home page. */}
        {url.trim() && (
          <div className="overflow-hidden rounded-xl border border-white/8 bg-surface-2/60">
            <video
              key={url.trim()}
              src={url.trim()}
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              className="aspect-video w-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          <Button loading={busy} disabled={!dirty} onClick={() => void save(url.trim())}>
            Save video
          </Button>
          {current && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setUrl("");
                void save("");
              }}
            >
              Remove
            </Button>
          )}
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Keep it under about 8MB and a few seconds long — it downloads before anyone reads the
          headline. It is skipped for visitors who ask for reduced motion.
        </p>
      </div>
    </Card>
  );
}
