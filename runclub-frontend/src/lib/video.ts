/**
 * Telling a YouTube link apart from a video file, and turning the former into
 * something that can actually be embedded.
 *
 * Shared by the hero player and the organiser panel so the preview in the
 * dashboard cannot disagree with what the home page ends up showing.
 */

/** Where a hero video came from. `null` for an unusable value. */
export type VideoKind = "youtube" | "file" | null;

/**
 * Pulls the 11-character id out of any of the shapes YouTube hands out:
 * watch?v=, youtu.be/, /embed/, /shorts/, /live/, and any of them with extra
 * query parameters attached.
 */
export function youtubeId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // A bare id pasted on its own.
  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }

  const v = url.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;

  const m = url.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

export function videoKind(raw: string | null | undefined): VideoKind {
  if (!raw?.trim()) return null;
  if (youtubeId(raw)) return "youtube";
  return "file";
}

/**
 * Embed URL for a looping, silent background player.
 *
 * `mute=1` is not optional — no browser autoplays audio. `loop` needs
 * `playlist` set to the same id or YouTube plays once and stops. `controls=0`
 * and `modestbranding=1` keep it looking like a backdrop rather than a player,
 * and `nocookie` avoids setting tracking cookies on visitors who never asked
 * to watch anything.
 */
export function youtubeEmbedUrl(id: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: id,
    controls: "0",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    showinfo: "0",
    iv_load_policy: "3",
    disablekb: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** Still frame for a YouTube video, used as the reduced-motion fallback. */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
}
