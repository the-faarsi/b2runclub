import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon, SparkIcon } from "../../components/icons";
import { Page, PageHeader } from "../../components/layout";
import { PageScene } from "../../components/scene3d";
import { Tilt } from "../../components/tilt";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/format";
import type { Collaborator, CollaboratorTier } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

const TIERS: { value: CollaboratorTier; label: string; tint: string }[] = [
  { value: "SPONSOR", label: "Sponsor", tint: "var(--color-gold)" },
  { value: "PARTNER", label: "Partner", tint: "var(--color-free)" },
  { value: "COMMUNITY", label: "Community", tint: "var(--color-paid)" },
];

const tierOf = (t: string) => TIERS.find((x) => x.value === t) ?? TIERS[1];

export function ManageCollaborators() {
  const toast = useToast();
  const load = useCallback(() => api.collaborators(), []);
  const { data, loading, error, reload, setData } = useFetch(load);

  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Collaborator | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = data ?? [];

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await api.deleteCollaborator(confirm.id);
      setData((prev) => (prev ?? []).filter((c) => c.id !== confirm.id));
      toast(res.message, "ok");
      setConfirm(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageScene variant="frames" opacity={0.22} />
      <PageHeader
        eyebrow="Organiser"
        title="Collaborators"
        description="Partners and sponsors shown in the home page scroller. The blurb is the shout-out revealed on hover."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin" className={buttonClass("ghost", "md")}>
              Dashboard
            </Link>
            <Link to="/" className={buttonClass("ghost", "md")}>
              View scroller
            </Link>
            <Button onClick={() => setAdding(true)}>
              <PlusIcon className="size-3.5" />
              Add collaborator
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-10 w-24" />
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
            icon={<SparkIcon className="size-5" />}
            title="No collaborators yet"
            body="Add the shops, cafés and trusts that support the club. They appear in a scrolling strip on the home page."
            action={
              <Button size="sm" onClick={() => setAdding(true)}>
                Add the first one
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((c, i) => {
            const tier = tierOf(c.tier);
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: Math.min(i * 0.05, 0.3) }}
              >
                <Tilt max={6} lift={8}>
                  <Card hover className="edge-gold flex h-full flex-col p-5">
                    <div className="flex items-start gap-4">
                      <span className="grid h-12 w-24 shrink-0 place-items-center rounded-lg border border-white/8 bg-surface-2/60">
                        {c.logo_url ? (
                          <img
                            src={c.logo_url}
                            alt={c.name}
                            className="max-h-10 max-w-20 object-contain"
                          />
                        ) : (
                          <span className="display text-[16px] text-gold">
                            {c.name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((w) => w[0]?.toUpperCase())
                              .join("")}
                          </span>
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-ink">{c.name}</span>
                          <Badge color={tier.tint}>{tier.label}</Badge>
                        </div>
                        {c.website && (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 block truncate text-[12px] text-ink-3 hover:text-gold"
                          >
                            {c.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </div>
                    </div>

                    <p
                      className={cn(
                        "mt-4 flex-1 text-[13px] leading-relaxed",
                        c.blurb ? "text-ink-2" : "text-ink-3 italic",
                      )}
                    >
                      {c.blurb || "No shout-out written yet — hover will show a fallback."}
                    </p>

                    <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3">
                      <span className="tnum text-[11px] text-ink-3">order {c.sort_order}</span>
                      <Button size="sm" variant="danger" onClick={() => setConfirm(c)}>
                        Remove
                      </Button>
                    </div>
                  </Card>
                </Tilt>
              </motion.div>
            );
          })}
        </div>
      )}

      <AddModal
        open={adding}
        nextOrder={rows.length}
        onClose={() => setAdding(false)}
        onAdded={(c) => {
          setData((prev) =>
            [...(prev ?? []), c].sort(
              (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
            ),
          );
          toast(`${c.name} added to the scroller.`, "ok");
        }}
      />

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Remove collaborator?"
        subtitle={confirm?.name}
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          They'll disappear from the home page scroller straight away. Any logo you uploaded is
          deleted too.
        </p>
        <div className="mt-6 flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>
            Keep them
          </Button>
          <Button variant="danger" className="flex-1" loading={busy} onClick={remove}>
            Remove
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

/* ── Add ──────────────────────────────────────────────────── */

function AddModal({
  open,
  nextOrder,
  onClose,
  onAdded,
}: {
  open: boolean;
  nextOrder: number;
  onClose: () => void;
  onAdded: (c: Collaborator) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    blurb: "",
    website: "",
    tier: "PARTNER" as CollaboratorTier,
    logo_url: "",
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ name: "", blurb: "", website: "", tier: "PARTNER", logo_url: "" });
    setLogo(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!logo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Give the collaborator a name.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.addCollaborator({
        name: form.name.trim(),
        blurb: form.blurb.trim() || undefined,
        website: form.website.trim() || undefined,
        tier: form.tier,
        sort_order: nextOrder,
        logoFile: logo ?? undefined,
        logo_url: logo ? undefined : form.logo_url.trim() || undefined,
      });
      onAdded(res.collaborator);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a collaborator"
      subtitle="Shown in the home page scroller. Everything here is public."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Name" htmlFor="co-name">
          <Input
            id="co-name"
            value={form.name}
            onChange={set("name")}
            placeholder="Riverside Cafe"
            maxLength={80}
          />
        </Field>

        <Field
          label="Shout-out"
          htmlFor="co-blurb"
          hint="One or two lines, revealed when someone hovers them."
        >
          <Textarea
            id="co-blurb"
            rows={3}
            value={form.blurb}
            onChange={set("blurb")}
            placeholder="Post-run coffee, always on the house."
            maxLength={240}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Tier" htmlFor="co-tier">
            <Select id="co-tier" value={form.tier} onChange={set("tier")}>
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Website" htmlFor="co-web">
            <Input
              id="co-web"
              value={form.website}
              onChange={set("website")}
              placeholder="https://…"
              inputMode="url"
            />
          </Field>
        </div>

        {/* Logo */}
        <div>
          <span className="eyebrow mb-1.5 block text-ink-2">Logo</span>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-white/14 p-4 transition-colors hover:border-gold/45"
          >
            <span className="grid h-12 w-24 shrink-0 place-items-center rounded-lg border border-white/8 bg-surface-2/60">
              {preview ? (
                <img src={preview} alt="" className="max-h-10 max-w-20 object-contain" />
              ) : (
                <SparkIcon className="size-4 text-ink-3" />
              )}
            </span>
            <span className="text-[13px] text-ink-3">
              {logo ? `${logo.name} · click to change` : "Click to upload a logo (optional)"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 8 * 1024 * 1024) {
                  setError("Logo must be under 8MB.");
                  return;
                }
                setLogo(f ?? null);
              }}
            />
          </div>

          {!logo && (
            <div className="mt-3">
              <Input
                value={form.logo_url}
                onChange={set("logo_url")}
                placeholder="…or paste a logo URL"
                inputMode="url"
                aria-label="Logo URL"
              />
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-3">
            No logo is fine — a gold monogram of the name is used instead.
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
            Add collaborator
          </Button>
        </div>
      </form>
    </Modal>
  );
}
