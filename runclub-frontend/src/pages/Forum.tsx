import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import {
  Avatar,
  Button,
  buttonClass,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
} from "../components/ui";
import { ShareAnnouncementModal } from "../components/whatsappShare";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, relativeTime, ROLE_META } from "../lib/format";
import type { Post } from "../lib/types";
import { useFetch } from "../lib/useFetch";

type Filter = "all" | "announcements" | "discussion";

export function Forum() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  const load = useCallback(() => api.posts(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  const [filter, setFilter] = useState<Filter>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const [highlight, setHighlight] = useState<string | null>(null);
  /** Announcement queued for the WhatsApp hand-off, or null. */
  const [sharing, setSharing] = useState<Post | null>(null);

  // Only organisers ever open the share dialog, and the only field used is the
  // WhatsApp invite link — so skip the request entirely for everyone else.
  const loadClub = useCallback(
    () => (isAdmin ? api.clubInfo() : Promise.resolve(null)),
    [isAdmin],
  );
  const { data: club } = useFetch(loadClub);

  const posts = data ?? [];

  // Deep link from a notification: /forum?post=<id>
  useEffect(() => {
    const target = params.get("post");
    if (!target || posts.length === 0) return;
    setHighlight(target);
    setFilter("all");
    const el = document.getElementById(`post-${target}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    params.delete("post");
    setParams(params, { replace: true });
    const timer = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(timer);
  }, [params, posts, setParams]);

  const counts = useMemo(() => {
    const announcements = posts.filter((p) => p.is_announcement).length;
    return { all: posts.length, announcements, discussion: posts.length - announcements };
  }, [posts]);

  const visible = useMemo(() => {
    if (filter === "announcements") return posts.filter((p) => p.is_announcement);
    if (filter === "discussion") return posts.filter((p) => !p.is_announcement);
    return posts;
  }, [posts, filter]);

  return (
    <Page>
      <PageScene variant="constellation" opacity={0.26} />
      <PageHeader
        eyebrow="Community"
        title="Forum"
        description="Organisers post here — route changes, session notes and club news. Anyone signed in can reply. Announcements are pinned to the top."
        action={
          /* Broadcast channel: only organisers can start a thread. Everyone
             else replies, so there is no "sign in to post" prompt for them. */
          isAdmin ? (
            <Button onClick={() => setComposeOpen(true)}>New post</Button>
          ) : !user ? (
            <Link to="/login" className={buttonClass("outline", "md")}>
              Sign in to reply
            </Link>
          ) : null
        }
      />

      <div className="mb-6">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "Everything", count: counts.all },
            { value: "announcements", label: "Announcements", count: counts.announcements },
            { value: "discussion", label: "Discussion", count: counts.discussion },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="flex gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<span aria-hidden>◉</span>}
            title="Nothing posted yet"
            body={
              isAdmin
                ? "Publish the first one — a route change, a session note, or club news."
                : "The organisers haven't posted yet. When they do, it lands here and you can reply."
            }
            action={
              isAdmin && (
                <Button size="sm" onClick={() => setComposeOpen(true)}>
                  Write a post
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              index={i}
              highlighted={highlight === post.id}
              onShare={setSharing}
              onCommented={(comment) =>
                setData((prev) =>
                  (prev ?? []).map((p) =>
                    p.id === post.id ? { ...p, comments: [...p.comments, comment] } : p,
                  ),
                )
              }
              onDeleted={(postId) =>
                setData((prev) => (prev ?? []).filter((p) => p.id !== postId))
              }
              onCommentDeleted={(postId, commentId) =>
                setData((prev) =>
                  (prev ?? []).map((p) =>
                    p.id === postId
                      ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) }
                      : p,
                  ),
                )
              }
            />
          ))}
        </div>
      )}

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        canAnnounce={isAdmin}
        onCreated={(post) => {
          // Announcements sort first, matching the backend ordering.
          setData((prev) => {
            // Guard the array: a create response that omits `comments` would
            // otherwise crash PostCard on `post.comments.length`.
            const next = [{ ...post, comments: post.comments ?? [] }, ...(prev ?? [])];
            return next.sort((a, b) => {
              if (a.is_announcement !== b.is_announcement) return a.is_announcement ? -1 : 1;
              return +new Date(b.created_at) - +new Date(a.created_at);
            });
          });
          toast(post.is_announcement ? "Announcement broadcast to the club." : "Post published.", "ok");
          // Every organiser post is a broadcast, so every one offers the
          // WhatsApp hand-off — not just the pinned announcements.
          setSharing({ ...post, comments: post.comments ?? [] });
        }}
      />

      <ShareAnnouncementModal
        post={sharing}
        open={sharing !== null}
        onClose={() => setSharing(null)}
        communityUrl={club?.whatsapp ?? null}
      />
    </Page>
  );
}

/* ── Post ─────────────────────────────────────────────────── */

function PostCard({
  post,
  index,
  highlighted,
  onCommented,
  onDeleted,
  onCommentDeleted,
  onShare,
}: {
  post: Post;
  index: number;
  highlighted: boolean;
  onCommented: (comment: Post["comments"][number]) => void;
  onDeleted: (postId: string) => void;
  onCommentDeleted: (postId: string, commentId: string) => void;
  onShare: (post: Post) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const authorMeta = ROLE_META[post.author.role] ?? ROLE_META.MEMBER;
  const comments = post.comments ?? [];

  // Mirrors the backend rule: your own, or anything if you're an organiser.
  const canDeletePost = Boolean(user && (user.id === post.author_id || user.role === "ADMIN"));
  const moderating = Boolean(user && user.role === "ADMIN" && user.id !== post.author_id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setBusy(true);
    try {
      const res = await api.addComment(post.id, content);
      onCommented(res.comment);
      setDraft("");
    } catch {
      /* surfaced by the disabled state; keep the draft for a retry */
    } finally {
      setBusy(false);
    }
  };

  const removePost = async () => {
    setDeleting(true);
    try {
      await api.deletePost(post.id);
      toast(moderating ? "Post removed — the author was notified." : "Post deleted.", "ok");
      onDeleted(post.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the post", "err");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const removeComment = async (commentId: string) => {
    try {
      await api.deleteComment(commentId);
      onCommentDeleted(post.id, commentId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the reply", "err");
    }
  };

  return (
    <motion.div
      id={`post-${post.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3) }}
    >
      <Card
        className={cn(
          "overflow-hidden transition-all duration-500",
          post.is_announcement && "border-gold/25",
          highlighted && "ring-2 ring-gold/50",
        )}
      >
        {post.is_announcement && (
          <div className="flex items-center gap-2 border-b border-gold/20 bg-gold/8 px-5 py-2">
            <span className="text-[11px] text-gold" aria-hidden>
              ★
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
              Club announcement
            </span>
          </div>
        )}

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Avatar name={post.author.name} size={38} ring={post.is_announcement} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[13px] font-semibold text-ink">{post.author.name}</span>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.12em]",
                    authorMeta.tint,
                  )}
                >
                  {authorMeta.label}
                </span>
                <span className="text-[11px] text-ink-3">· {relativeTime(post.created_at)}</span>
              </div>

              <h2 className="mt-2 text-[17px] font-semibold leading-snug text-ink">
                {post.title}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">
                {post.content}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-white/6 pt-4">
            <button
              onClick={() => {
                setOpen((o) => !o);
                if (!open) setTimeout(() => inputRef.current?.focus(), 250);
              }}
              className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3 transition-colors hover:text-gold"
              aria-expanded={open}
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
                <path
                  d="M21 12a8 8 0 0 1-8 8H8l-5 2 1.6-4.4A8 8 0 1 1 21 12Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
              {comments.length === 0
                ? "Comment"
                : `${comments.length} ${comments.length === 1 ? "reply" : "replies"}`}
            </button>

            {/* Organisers can push any post to WhatsApp at any time — the
                prompt shown at publish is skippable, and an older post may be
                worth re-sharing. */}
            {user?.role === "ADMIN" && (
              <button
                onClick={() => onShare(post)}
                className="ml-auto text-[12px] font-medium text-ink-3 transition-colors hover:text-[#25d366]"
              >
                Share to WhatsApp
              </button>
            )}

            {/* Authors may remove their own post; organisers may remove anyone's. */}
            {canDeletePost && (
              <button
                onClick={() => setConfirmDelete(true)}
                className={cn(
                  "text-[12px] font-medium text-ink-3 transition-colors hover:text-[color:var(--color-failed)]",
                  user?.role !== "ADMIN" && "ml-auto",
                )}
              >
                Delete
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-4">
                  {comments.map((c) => {
                    const canDeleteComment =
                      user && (user.id === c.user_id || user.role === "ADMIN");

                    return (
                      <div key={c.id} className="group flex gap-2.5">
                        <Avatar name={c.user.name} size={28} />
                        <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-surface-2/60 px-3.5 py-2.5">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-[12px] font-semibold text-ink">
                              {c.user.name}
                            </span>
                            <span className="text-[10px] text-ink-3">
                              {relativeTime(c.created_at)}
                            </span>
                            {canDeleteComment && (
                              <button
                                onClick={() => void removeComment(c.id)}
                                /* Revealed on hover, but always reachable by keyboard. */
                                className="ml-auto text-[10px] font-medium text-ink-3 opacity-0 transition-all hover:text-[color:var(--color-failed)] focus-visible:opacity-100 group-hover:opacity-100"
                                aria-label={`Delete ${c.user.name}'s reply`}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                            {c.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {user ? (
                    <form onSubmit={submit} className="flex gap-2.5 pt-1">
                      <Avatar name={user.name} size={28} />
                      <Input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Add a reply…"
                        aria-label="Add a reply"
                        className="h-10"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        loading={busy}
                        disabled={!draft.trim()}
                        className="h-10"
                      >
                        Reply
                      </Button>
                    </form>
                  ) : (
                    <p className="pt-1 text-[12px] text-ink-3">
                      <Link to="/login" className="text-gold hover:underline">
                        Sign in
                      </Link>{" "}
                      to join the thread.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this post?"
        subtitle={post.title}
      >
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            {moderating
              ? `This removes ${post.author.name}'s post and every reply on it. They'll get a notification telling them an organiser removed it.`
              : "This removes your post and every reply on it."}{" "}
            It can't be undone.
          </p>

          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" className="flex-1" loading={deleting} onClick={removePost}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

/* ── Compose ──────────────────────────────────────────────── */

function ComposeModal({
  open,
  onClose,
  canAnnounce,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  canAnnounce: boolean;
  onCreated: (post: Post) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setContent("");
      setAnnounce(false);
      setError(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !content.trim()) {
      setError("Give it a title and a body.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.createPost({
        title: title.trim(),
        content: content.trim(),
        is_announcement: announce,
      });
      onCreated(res.post);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New post"
      subtitle="Keep it useful — routes, logistics, race reports."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Title" htmlFor="post-title">
          <Input
            id="post-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunday long run — new river route"
            maxLength={140}
          />
        </Field>

        <Field label="Body" htmlFor="post-body" hint={`${content.length} characters`}>
          <Textarea
            id="post-body"
            rows={7}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's the plan?"
          />
        </Field>

        {canAnnounce && (
          <div className="rounded-xl border border-white/8 bg-surface-2/40 p-4">
            <Checkbox
              checked={announce}
              onChange={setAnnounce}
              label="Publish as a club announcement"
              description="Pins the post to the top and sends a notification to every member and volunteer."
            />
          </div>
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
            {announce ? "Broadcast" : "Publish"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
