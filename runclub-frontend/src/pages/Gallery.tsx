import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DownloadIcon, SparkIcon, UsersIcon } from "../components/icons";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import { Tilt } from "../components/tilt";
import {
  Avatar,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, relativeTime, ROLE_META } from "../lib/format";
import { DUR, EASE } from "../lib/motion";
import type { Photo } from "../lib/types";
import { useFetch } from "../lib/useFetch";

/** 8MB, matching the backend's multer limit. */
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

export function Gallery() {
  const { role, user } = useAuth();
  const toast = useToast();

  const load = useCallback(() => api.gallery(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  /** Only organisers and volunteers may contribute; everyone else views. */
  const canPost = role === "ADMIN" || role === "VOLUNTEER";
  const isAdmin = role === "ADMIN";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const photos = data ?? [];

  const canDelete = (p: Photo) => isAdmin || p.uploader.id === user?.id;

  const remove = async (p: Photo) => {
    setRemoving(p.id);
    try {
      await api.deletePhoto(p.id);
      setData((prev) => (prev ?? []).filter((x) => x.id !== p.id));
      setLightbox(null);
      toast("Photo removed.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove the photo", "err");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Page>
      <PageScene variant="frames" opacity={0.3} />
      <PageHeader
        eyebrow="Club gallery"
        title="Gallery"
        description={
          canPost
            ? "Shots from the road, the trail and the after-party. Organisers and volunteers can add to it."
            : "Shots from the road, the trail and the after-party, posted by the crew who run the sessions."
        }
        action={
          canPost ? (
            <Button onClick={() => setUploadOpen(true)}>
              <SparkIcon className="size-3.5" />
              Add photos
            </Button>
          ) : (
            <Link to="/calendar" className={buttonClass("outline", "md")}>
              Find a session
            </Link>
          )
        }
      />

      {/* View-only notice for members and visitors, so the absence of an
          upload button is explained rather than just missing. */}
      {!canPost && !loading && photos.length > 0 && (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-white/8 bg-surface/60 px-4 py-3 text-[13px] text-ink-3">
          <UsersIcon className="size-4 shrink-0" />
          This is a view-only gallery. Organisers and volunteers post the photos — ask one of them
          if you'd like a shot added.
        </p>
      )}

      {loading ? (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {[280, 200, 340, 240, 300, 220].map((h, i) => (
            <Skeleton key={i} className="mb-4 w-full" style={{ height: h }} />
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : photos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SparkIcon className="size-5" />}
            title="No photos yet"
            body={
              canPost
                ? "Add the first one — a start line, a finish, a muddy shoe."
                : "Nothing posted yet. Check back after the next session."
            }
            action={
              canPost && (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  Add photos
                </Button>
              )
            }
          />
        </Card>
      ) : (
        /* Masonry via CSS columns — keeps portrait and landscape shots at
           their natural aspect ratio without cropping. */
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {photos.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.reveal, delay: Math.min(i * 0.04, 0.3), ease: EASE }}
              className="break-inside-avoid"
            >
              <Tilt max={6} lift={8}>
                <button
                  onClick={() => setLightbox(p)}
                  className="group relative block w-full overflow-hidden rounded-[var(--radius-card)] border border-white/8 text-left"
                  aria-label={p.caption ?? `Photo by ${p.uploader.name}`}
                >
                  <img
                    src={p.url}
                    alt={p.caption ?? `Club photo by ${p.uploader.name}`}
                    loading="lazy"
                    className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />

                  {/* Caption plate, revealed on hover */}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-void/95 via-void/70 to-transparent p-4 opacity-0 transition-all duration-400 group-hover:translate-y-0 group-hover:opacity-100">
                    {p.caption && (
                      <span className="block text-[13px] font-medium leading-snug text-ink">
                        {p.caption}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-ink-3">
                      {p.uploader.name} · {relativeTime(p.created_at)}
                    </span>
                  </span>
                </button>
              </Tilt>
            </motion.div>
          ))}
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onAdded={(photo) => {
          setData((prev) => [photo, ...(prev ?? [])]);
          toast("Photo added to the gallery.", "ok");
        }}
      />

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightbox(null)}
              className="absolute inset-0 bg-void/92 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, rotateX: 6 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: DUR.base, ease: EASE }}
              style={{ perspective: 1200 }}
              className="relative max-h-full w-full max-w-4xl"
            >
              <img
                src={lightbox.url}
                alt={lightbox.caption ?? "Club photo"}
                className="max-h-[74vh] w-full rounded-2xl border border-white/10 object-contain"
              />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Avatar name={lightbox.uploader.name} size={34} />
                <div className="min-w-0 flex-1">
                  {lightbox.caption && (
                    <p className="text-[14px] font-medium text-ink">{lightbox.caption}</p>
                  )}
                  <p className="text-[12px] text-ink-3">
                    {lightbox.uploader.name} ·{" "}
                    {(ROLE_META[lightbox.uploader.role] ?? ROLE_META.MEMBER).label} ·{" "}
                    {relativeTime(lightbox.created_at)}
                  </p>
                </div>

                <a
                  href={lightbox.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("outline", "sm")}
                >
                  <DownloadIcon className="size-3.5" />
                  Open
                </a>

                {canDelete(lightbox) && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={removing === lightbox.id}
                    onClick={() => remove(lightbox)}
                  >
                    Delete
                  </Button>
                )}

                <Button size="sm" variant="ghost" onClick={() => setLightbox(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Page>
  );
}

/* ── Upload ───────────────────────────────────────────────── */

function UploadModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (photo: Photo) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setCaption("");
      setLinkUrl("");
      setError(null);
      setDragging(false);
    }
  }, [open]);

  // Object URLs must be revoked or the blob leaks for the page's lifetime.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accept = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That's not an image file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`That image is ${(f.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`);
      return;
    }
    setError(null);
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file && !linkUrl.trim()) {
      setError("Choose an image or paste an image URL.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.addPhoto({
        file: file ?? undefined,
        url: file ? undefined : linkUrl.trim(),
        caption: caption.trim() || undefined,
      });
      onAdded(res.photo);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a photo"
      subtitle="JPEG, PNG, WebP, GIF or AVIF, up to 8MB."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "grid cursor-pointer place-items-center rounded-xl border border-dashed p-6 text-center transition-colors",
            dragging ? "border-gold bg-gold/8" : "border-white/14 hover:border-gold/45",
          )}
        >
          {preview ? (
            <div className="w-full">
              <img
                src={preview}
                alt="Preview"
                className="mx-auto max-h-56 rounded-lg object-contain"
              />
              <p className="mt-3 text-[12px] text-ink-3">
                {file?.name} · {((file?.size ?? 0) / 1024).toFixed(0)} KB · click to change
              </p>
            </div>
          ) : (
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold">
                <SparkIcon className="size-[18px]" />
              </span>
              <p className="mt-3 text-[13.5px] font-medium text-ink">
                Drop an image here, or click to choose
              </p>
              <p className="mt-1 text-[12px] text-ink-3">Straight from your phone or camera roll</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </div>

        <Field label="Caption" htmlFor="ph-caption" hint="Optional, but it helps people find it.">
          <Input
            id="ph-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Sunrise at the river loop"
            maxLength={160}
          />
        </Field>

        {!file && (
          <Field
            label="…or paste an image URL"
            htmlFor="ph-url"
            hint="Use this if the photo already lives somewhere online."
          >
            <Input
              id="ph-url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </Field>
        )}

        {error && (
          <p className="rounded-lg border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3 py-2 text-[13px] text-ink-2">
            <span aria-hidden className="mr-1.5 font-bold text-[color:var(--color-failed)]">
              !
            </span>
            {error}
          </p>
        )}

        <div className="flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={busy} className="flex-1">
            Add to gallery
          </Button>
        </div>
      </form>
    </Modal>
  );
}
