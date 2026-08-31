import { useState } from "react";
import { CLUB_MONOGRAM, CLUB_NAME, CLUB_WORDMARK } from "../lib/brand";
import { cn } from "../lib/format";

/**
 * Where the artwork is expected to live. Drop the file at
 * `runclub-frontend/public/logo.png` and it is served from the site root.
 *
 * Overridable so a club can point at object storage instead of committing a
 * binary — set VITE_CLUB_LOGO_URL.
 */
export const CLUB_LOGO_SRC = import.meta.env.VITE_CLUB_LOGO_URL?.trim() || "/logo.png";

/**
 * The club's full logo lockup, for the home page.
 *
 * Falls back to the built monogram-and-wordmark if the file is missing, so the
 * hero never shows a broken image — and so this can ship before the artwork
 * does. `onError` fires for a 404, which is exactly the case worth handling.
 */
export function ClubLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <span
          className="grid size-20 place-items-center rounded-2xl bg-gold text-[color:var(--color-gold-ink)]"
          aria-hidden
        >
          <span className="display text-[34px] leading-none">{CLUB_MONOGRAM}</span>
        </span>
        <span className="display text-[clamp(24px,5vw,38px)] tracking-[-0.02em]">
          {CLUB_WORDMARK}
        </span>
      </div>
    );
  }

  return (
    <img
      src={CLUB_LOGO_SRC}
      alt={CLUB_NAME}
      /* The artwork is the first thing on the page, so it is not lazy. */
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("mx-auto h-auto w-auto object-contain", className)}
    />
  );
}
