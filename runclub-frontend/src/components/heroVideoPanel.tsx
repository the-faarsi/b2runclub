import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { videoKind, youtubeEmbedUrl, youtubeId } from "../lib/video";
import { Button, Card, Field, Input, useToast } from "./ui";

/**
 * The cap that actually applies now.
 *
 * It used to be the platform's 4.5MB request-body limit, because the file was
 * posted through the API. Uploads go browser → object storage via a signed URL
 * instead, so the function never sees the bytes and that limit no longer binds.
 */
const MAX_MB = 200;

/**
 * Organiser control for the home page background video.
 *
 * Two ways in, because neither covers everything on its own: a YouTube link
 * costs nothing to host and streams at any size, and an uploaded file avoids
 * YouTube's branding and works without a third party. The player works out
 * which it has been given from the value, so there is no type to pick.
 */
export function HeroVideoPanel() {
  const toast = useToast();
  const load = useCallback(() => api.clubInfo(), []);
  const { data: club, setData } = useFetch(load);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** 0-1 while a file is going up. A 50MB upload with no feedback looks stuck. */
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(club?.hero_video_url ?? "");
  }, [club?.hero_video_url]);

  const current = club?.hero_video_url ?? null;
  const trimmed = url.trim();
  const dirty = trimmed !== (current ?? "");
  const kind = videoKind(trimmed);
  const ytId = kind === "youtube" ? youtubeId(trimmed) : null;

  const save = async (next: string) => {
    setBusy(true);
    try {
      // Empty string clears it server-side, which is how "Remove" works.
      // The route answers { message, club } — not the record on its own, which
      // is what this used to assume, so the saved value was dropped from local
      // state and the panel showed the field as empty until a reload.
      const { club: updated } = await api.saveClubInfo({ hero_video_url: next });
      setData(() => updated);
      setUrl(updated.hero_video_url ?? "");
      toast(next ? "Hero video updated." : "Hero video removed.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "err");
    } finally {
      setBusy(false);
    }
  };

  /** Uploads, then saves the returned URL — one action from the organiser's side. */
  const pickFile = async (file: File) => {
    const mb = file.size / 1024 / 1024;
    if (mb > MAX_MB) {
      toast(`That file is ${mb.toFixed(0)}MB. The limit is ${MAX_MB}MB.`, "err");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const { url: stored } = await api.uploadVideo(file, setProgress);
      await save(stored);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "err");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-[15px] font-semibold text-ink">Home page video</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        Plays muted on a loop behind the hero. Leave it empty to keep the 3D graphic.
      </p>

      <div className="mt-5 space-y-4">
        <Field
          label="YouTube link or video URL"
          htmlFor="hero-video"
          hint="Any YouTube address works — watch, youtu.be, shorts or embed. Or paste a direct .mp4 / .webm link."
        >
          <Input
            id="hero-video"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=… or /hero.mp4"
            inputMode="url"
          />
        </Field>

        {trimmed && (
          <p className="text-[12px] text-ink-3">
            Reads as{" "}
            <span className="font-semibold text-gold">
              {kind === "youtube" ? "a YouTube video" : "a video file"}
            </span>
            {kind === "youtube" && ytId ? ` (${ytId})` : ""}.
          </p>
        )}

        {/* Silent preview, so a wrong or dead link is obvious here rather than
            on the public home page. */}
        {trimmed && (
          <div className="overflow-hidden rounded-xl border border-white/8 bg-surface-2/60">
            {kind === "youtube" && ytId ? (
              <iframe
                key={ytId}
                title="Hero video preview"
                src={youtubeEmbedUrl(ytId)}
                allow="autoplay; encrypted-media"
                className="aspect-video w-full border-0"
              />
            ) : (
              <video
                key={trimmed}
                src={trimmed}
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
                className="aspect-video w-full object-cover"
              />
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          <Button loading={busy && !uploading} disabled={!dirty} onClick={() => void save(trimmed)}>
            Save video
          </Button>
          <Button
            variant="outline"
            loading={uploading}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {uploading && progress > 0
              ? `Uploading ${Math.round(progress * 100)}%`
              : "Upload a file"}
          </Button>
          {current && (
            <Button
              variant="ghost"
              disabled={busy || uploading}
              onClick={() => {
                setUrl("");
                void save("");
              }}
            >
              Remove
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Reset so picking the same file twice still fires onChange.
              e.target.value = "";
              if (f) void pickFile(f);
            }}
          />
        </div>

        {uploading && (
          <div className="h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-200"
              style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
            />
          </div>
        )}

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Up to {MAX_MB}MB. Files go straight to storage rather than through the API, so the host's
          request-size limit no longer applies. Keep it short anyway — it downloads before anyone
          reads the page. Skipped entirely for visitors who ask for reduced motion.
        </p>
      </div>
    </Card>
  );
}
