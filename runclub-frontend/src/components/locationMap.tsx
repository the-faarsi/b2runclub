import { useState } from "react";
import { PinIcon } from "./icons";
import { Card } from "./ui";

/**
 * A map of where an event starts.
 *
 * Driven by the location text an organiser typed, not coordinates — the Event
 * model has no lat/lng, and asking organisers to find some would mean most
 * events never get a map. Google's `output=embed` accepts a free-text query and
 * needs no API key, which is the only option that works from what we store.
 *
 * Not loaded until asked. It is a third-party frame that sets cookies, so it
 * would be rude to mount one on every event view for the many people who only
 * wanted the start time — and it keeps the page light. The address and a link
 * out are always visible, so the useful part needs no click.
 */
export function LocationMap({ location }: { location: string }) {
  const [shown, setShown] = useState(false);

  const place = location.trim();
  if (!place) return null;

  const query = encodeURIComponent(place);
  const embed = `https://www.google.com/maps?q=${query}&output=embed`;
  const full = `https://www.google.com/maps/search/?api=1&query=${query}`;

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3 p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold">
          <PinIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Where</p>
          <p className="mt-0.5 truncate text-[15px] font-medium text-ink">{place}</p>
        </div>
        <div className="flex items-center gap-2">
          {!shown && (
            <button
              type="button"
              onClick={() => setShown(true)}
              className="tap rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-gold/40 hover:text-gold"
            >
              Show map
            </button>
          )}
          <a
            href={full}
            target="_blank"
            rel="noreferrer"
            className="tap rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-gold/40 hover:text-gold"
          >
            Directions
          </a>
        </div>
      </div>

      {shown && (
        <div className="relative aspect-[4/3] w-full border-t border-white/8 sm:aspect-[16/9]">
          <iframe
            title={`Map of ${place}`}
            src={embed}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            style={{ border: 0 }}
          />
        </div>
      )}
    </Card>
  );
}
