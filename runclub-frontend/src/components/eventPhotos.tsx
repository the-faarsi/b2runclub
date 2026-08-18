import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { relativeTime, ROLE_META } from "../lib/format";
import type { ClubEvent, Photo } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { Avatar, Button, Card } from "./ui";

/**
 * Photos an organiser or volunteer tagged to this event.
 *
 * Renders nothing when there are none — an event page shouldn't carry an empty
 * "no photos" panel for every session that was never photographed.
 */
export function EventPhotoStrip({ event }: { event: ClubEvent }) {
  const load = useCallback(() => api.gallery(event.id), [event.id]);
  const { data } = useFetch(load);
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  const photos = data ?? [];
  if (photos.length === 0) return null;

  return (
    <>
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">From the day</h2>
            <p className="mt-1 text-[12px] text-ink-3">
              {photos.length} photo{photos.length === 1 ? "" : "s"} tagged to this session
            </p>
          </div>
          <Link to="/gallery" className="text-[12.5px] text-ink-3 hover:text-gold">
            Full gallery →
          </Link>
        </div>

        {/* Horizontal scroller — keeps a long set from pushing the page down */}
        <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {photos.map((p, i) => (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.25) }}
              onClick={() => setLightbox(p)}
              className="group relative size-28 shrink-0 snap-start overflow-hidden rounded-xl border border-white/8 sm:size-32"
              aria-label={p.caption ?? `Photo by ${p.uploader.name}`}
            >
              <img
                src={p.url}
                alt={p.caption ?? `Photo from ${event.title}`}
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            </motion.button>
          ))}
        </div>
      </Card>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-void/90 p-4 backdrop-blur-sm"
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.caption ?? "Photo"}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="max-h-full w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-surface"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightbox.url}
                alt={lightbox.caption ?? "Club photo"}
                className="max-h-[70vh] w-full object-contain bg-void"
              />
              <div className="flex flex-wrap items-center gap-3 p-4">
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
                <Button size="sm" variant="ghost" onClick={() => setLightbox(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
