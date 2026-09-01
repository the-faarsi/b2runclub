import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InstagramIcon, PlusIcon, StravaIcon, UsersIcon } from "../../components/icons";
import { Page, PageHeader } from "../../components/layout";
import { PageScene } from "../../components/scene3d";
import {
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from "../../components/ui";
import { api } from "../../lib/api";
import type { Founder } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

/** Initials fallback, matching the public section. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ManageFounders() {
  const toast = useToast();
  const load = useCallback(() => api.founders(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Founder | null>(null);
  const [confirm, setConfirm] = useState<Founder | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = data ?? [];
  const nextOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 10 : 0;

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await api.deleteFounder(confirm.id);
      setData((prev) => (prev ?? []).filter((f) => f.id !== confirm.id));
      toast(res.message, "ok");
      setConfirm(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove", "err");
    } finally {
      setBusy(false);
    }
  };

  const onSaved = (f: Founder, mode: "added" | "updated") => {
    setData((prev) => {
      const list = prev ?? [];
      const next =
        mode === "added" ? [...list, f] : list.map((x) => (x.id === f.id ? f : x));
      return next.sort(
        (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
      );
    });
    toast(mode === "added" ? `${f.name} added.` : `${f.name} updated.`, "ok");
  };

  return (
    <Page>
      <PageScene variant="towers" opacity={0.2} />
      <PageHeader
        eyebrow="Organiser"
        title="Founders"
        description="The people who started the club, shown on the home page. Leave it empty and the section simply doesn't appear."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin" className={buttonClass("ghost", "md")}>
              Dashboard
            </Link>
            <Link to="/admin/collaborators" className={buttonClass("ghost", "md")}>
              Collaborators
            </Link>
            <Button onClick={() => setAdding(true)}>
              <PlusIcon className="size-3.5" />
              Add founder
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="size-16 rounded-xl" />
              <Skeleton className="mt-4 h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title="No founders added yet"
            body="Add the people who started the club — a name, a title and a couple of lines. They appear in their own section on the home page."
            action={
              <Button size="sm" onClick={() => setAdding(true)}>
                Add the first one
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: Math.min(i * 0.05, 0.2) }}
            >
              <Card className="h-full p-5">
                <div className="flex items-start gap-4">
                  <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/8 bg-surface-2/60">
                    {f.photo_url ? (
                      <img src={f.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[15px] font-semibold text-ink-3">
                        {initials(f.name)}
                      </span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{f.name}</p>
                    {f.role && <p className="eyebrow mt-0.5 text-gold">{f.role}</p>}
                    <p className="mt-1 text-[11.5px] text-ink-3">Order {f.sort_order}</p>

                    {(f.instagram || f.strava) && (
                      <div className="mt-2 flex items-center gap-2 text-ink-3">
                        {f.instagram && (
                          <span className="inline-flex items-center gap-1 text-[11.5px]">
                            <InstagramIcon className="size-3" />@{f.instagram}
                          </span>
                        )}
                        {f.strava && (
                          <span className="inline-flex items-center gap-1 text-[11.5px]">
                            <StravaIcon className="size-3" />
                            Strava
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {f.bio && (
                  <p className="mt-4 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
                    {f.bio}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(f)}>
                    <span className="text-[color:var(--color-failed)]">Delete</span>
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <FounderModal
        open={adding || editing !== null}
        editing={editing}
        nextOrder={nextOrder}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={onSaved}
      />

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Remove this founder?"
        subtitle={confirm ? `${confirm.name} will disappear from the home page.` : undefined}
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          The photo is deleted with the record. Nothing else is affected.
        </p>
        <div className="mt-6 flex gap-2.5">
          <Button variant="outline" onClick={() => setConfirm(null)} className="flex-1">
            Keep
          </Button>
          <Button variant="danger" loading={busy} onClick={remove} className="flex-1">
            Remove
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

function FounderModal({
  open,
  editing,
  nextOrder,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = creating a new one. */
  editing: Founder | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: (f: Founder, mode: "added" | "updated") => void;
}) {
  const isEdit = editing !== null;
  const [form, setForm] = useState({
    name: "",
    role: "",
    bio: "",
    instagram: "",
    strava: "",
    photo_url: "",
    sort_order: "0",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            name: editing.name,
            role: editing.role ?? "",
            bio: editing.bio ?? "",
            instagram: editing.instagram ?? "",
            strava: editing.strava ?? "",
            photo_url: editing.photo_url ?? "",
            sort_order: String(editing.sort_order),
          }
        : {
            name: "",
            role: "",
            bio: "",
            instagram: "",
            strava: "",
            photo_url: "",
            sort_order: String(nextOrder),
          },
    );
    setPhoto(null);
    setError(null);
  }, [open, editing, nextOrder]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Give the founder a name.");
      return;
    }
    const order = Number.parseInt(form.sort_order, 10);
    setBusy(true);
    try {
      const shared = {
        name: form.name.trim(),
        role: form.role.trim(),
        bio: form.bio.trim(),
        // The @ is stripped server-side too, but doing it here keeps the field
        // showing what was actually stored after a save.
        instagram: form.instagram.trim().replace(/^@/, ""),
        strava: form.strava.trim(),
        photoFile: photo ?? undefined,
        // Skipped when a new file is uploaded — the file wins server-side, and
        // sending the old URL alongside it would be ambiguous.
        photo_url: photo ? undefined : form.photo_url.trim(),
      };
      if (editing) {
        const res = await api.updateFounder(editing.id, {
          ...shared,
          sort_order: Number.isFinite(order) ? order : 0,
        });
        onSaved(res.founder, "updated");
      } else {
        const res = await api.addFounder({
          ...shared,
          sort_order: Number.isFinite(order) ? order : nextOrder,
        });
        onSaved(res.founder, "added");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? "Could not save" : "Could not add");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit founder" : "Add a founder"}
      subtitle={
        isEdit
          ? `${editing.name} · changes show on the home page straight away`
          : "Shown on the home page. Everything here is public."
      }
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="fo-name">
            <Input
              id="fo-name"
              value={form.name}
              onChange={set("name")}
              placeholder="Selva Kumar"
              maxLength={80}
            />
          </Field>
          <Field label="Title" htmlFor="fo-role" hint="Optional.">
            <Input
              id="fo-role"
              value={form.role}
              onChange={set("role")}
              placeholder="Founder & Head Coach"
              maxLength={80}
            />
          </Field>
        </div>

        <Field label="Bio" htmlFor="fo-bio" hint="A couple of lines. Line breaks are kept.">
          <Textarea
            id="fo-bio"
            rows={4}
            value={form.bio}
            onChange={set("bio")}
            placeholder={"Started the club with a Tuesday night loop and four people.\nStill marshals the first corner."}
            maxLength={600}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Instagram" htmlFor="fo-ig" hint="Handle only — the @ is optional.">
            <Input
              id="fo-ig"
              value={form.instagram}
              onChange={set("instagram")}
              placeholder="selva.runs"
              maxLength={60}
            />
          </Field>
        </div>

        <Field
          label="Strava"
          htmlFor="fo-strava"
          hint="Paste their Strava link — a share link or a profile URL both work."
        >
          <Input
            id="fo-strava"
            value={form.strava}
            onChange={set("strava")}
            placeholder="https://strava.app.link/…"
            inputMode="url"
          />
        </Field>

        <Field
          label="Sort order"
          htmlFor="fo-order"
          hint="Lowest first. Ties fall back to whoever was added first."
        >
          <Input
            id="fo-order"
            type="number"
            value={form.sort_order}
            onChange={set("sort_order")}
            inputMode="numeric"
          />
        </Field>

        {/* Photo */}
        <div>
          <span className="eyebrow mb-1.5 block text-ink-2">Photo</span>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-white/14 p-4 transition-colors hover:border-gold/45"
          >
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/8 bg-surface-2/60">
              {/* Falls back to whatever the row already has, so an edit shows the
                  current photo rather than an empty slot. */}
              {preview || form.photo_url ? (
                <img src={preview ?? form.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UsersIcon className="size-4 text-ink-3" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-[13px] text-ink-3">
              {photo
                ? `${photo.name} · click to change`
                : form.photo_url
                  ? "Click to replace the photo"
                  : "Click to upload a photo (optional). A square portrait works best."}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f && f.size > 8 * 1024 * 1024) {
                  setError("Photo must be under 8MB.");
                  return;
                }
                setPhoto(f ?? null);
              }}
            />
          </div>

          {!photo && (
            <div className="mt-3">
              <Input
                value={form.photo_url}
                onChange={set("photo_url")}
                placeholder="…or paste a photo URL"
                inputMode="url"
                aria-label="Photo URL"
              />
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-3">
            No photo is fine — their initials are shown instead.
          </p>
        </div>

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
            {isEdit ? "Save changes" : "Add founder"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
