import { useEffect, useState } from "react";
import { CLUB_NAME } from "../lib/brand";

import { Button, Modal } from "./ui";
import type { Post } from "../lib/types";

/**
 * Sharing an announcement to the club's WhatsApp community.
 *
 * There is deliberately no server-side send here. Meta's Groups API (2026) can
 * only message groups the business creates through the API — capped at 8
 * participants and requiring an Official Business Account — so it cannot post
 * into a consumer community group joined via a chat.whatsapp.com invite. The
 * only route that reaches the real group without an unofficial WhatsApp Web
 * bot (a ToS breach that risks the club's number being banned) is WhatsApp's
 * own share handoff: we compose the message, the organiser picks the community
 * and taps send.
 */

/** WhatsApp bolds with *single asterisks*, not markdown's double. */
export function announcementMessage(post: Post, origin: string): string {
  const body = post.content.trim();
  // Long posts get trimmed on a word boundary — the full text is one tap away.
  const snippet = body.length > 280 ? `${body.slice(0, 277).replace(/\s+\S*$/, "")}…` : body;

  return [
    post.is_announcement
      ? `*📣 New announcement — ${CLUB_NAME}*`
      : `*🏃 New post — ${CLUB_NAME}*`,
    "",
    `*${post.title.trim()}*`,
    "",
    snippet,
    "",
    `Read it here: ${origin}/forum`,
  ].join("\n");
}

/**
 * wa.me with only `text` and no phone number opens WhatsApp's own chat picker,
 * so the organiser chooses the community from inside WhatsApp. This is the
 * documented click-to-chat behaviour and works on mobile, Desktop and Web.
 */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function ShareAnnouncementModal({
  post,
  open,
  onClose,
  communityUrl,
}: {
  post: Post | null;
  open: boolean;
  onClose: () => void;
  /** The club's WhatsApp invite link, if an organiser has set one. */
  communityUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  if (!post) return null;
  const message = announcementMessage(post, window.location.origin);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers; the
      // message is on screen and selectable, so this is not worth an error.
      setCopied(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share to the community"
      subtitle="Your post is already live in the forum and every member has an in-app notification."
    >
      <div className="space-y-4">
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          WhatsApp gives no way for an app to post into a community group on its own, so this
          hands the message to WhatsApp with the text written for you — pick the community and
          send.
        </p>

        {/* Exactly what will be sent, so nothing is a surprise. */}
        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-surface-2 p-3.5 font-sans text-[13px] leading-relaxed text-ink-2">
          {message}
        </pre>

        <div className="flex flex-wrap gap-2.5">
          <a
            href={whatsappShareUrl(message)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-[#04310f] transition-opacity hover:opacity-90"
            style={{ background: "#25d366" }}
          >
            <WhatsAppGlyph />
            Share to WhatsApp
          </a>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? "Copied ✓" : "Copy message"}
          </Button>
        </div>

        {communityUrl && (
          <p className="text-[12px] text-ink-3">
            Not signed in to WhatsApp on this device?{" "}
            <a
              href={communityUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-gold hover:opacity-80"
            >
              Open the community group
            </a>{" "}
            and paste the copied message.
          </p>
        )}

        <button
          onClick={onClose}
          className="text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink-2"
        >
          Skip — don't share this one
        </button>
      </div>
    </Modal>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.06h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.03-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.23-8.23 2.2 0 4.26.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.22-8.23 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.09-.16.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.84-.85 2.04 0 1.2.87 2.37.99 2.53.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}
