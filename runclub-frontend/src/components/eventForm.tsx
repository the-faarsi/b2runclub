import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { REMINDER_OFFSETS } from "../lib/types";
import type { ClubEvent, EventStatus } from "../lib/types";
import { cn } from "../lib/format";
import { SparkIcon } from "./icons";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from "./ui";

export const EVENT_TYPES = ["Run", "Cycle", "Swim", "Race", "Training", "Social", "Party"];

/** Default start time for a session created from a calendar day. */
const DEFAULT_START_HOUR = 6;
const DEFAULT_START_MINUTE = 30;

const pad = (n: number) => n.toString().padStart(2, "0");

/** <input type="datetime-local"> needs a local `YYYY-MM-DDTHH:mm` string. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * Builds a datetime-local value from a `YYYY-MM-DD` day key, defaulting to an
 * early start so a calendar-created session lands at a plausible hour.
 */
export function dayKeyToLocalInput(dayKey: string) {
  return `${dayKey}T${pad(DEFAULT_START_HOUR)}:${pad(DEFAULT_START_MINUTE)}`;
}

/** Human labels for the offsets an organiser can pick. */
const OFFSET_LABEL: Record<number, string> = {
  168: "1 week",
  72: "3 days",
  48: "2 days",
  24: "1 day",
  12: "12 hours",
  4: "4 hours",
  2: "2 hours",
  1: "1 hour",
};

const BLANK = {
  title: "",
  type: "Run",
  date_time: "",
  location: "",
  price: "0",
  kids_allowed: false,
  kid_price: "0",
  status: "DRAFT" as EventStatus,
  description: "",
  /** Empty string means unlimited — the backend reads a blank as null. */
  capacity: "",
  /** Stored URL of the cover image. Empty means no cover. */
  cover_url: "",
};

/**
 * Create/edit form for an event. Shared by the admin event manager and the
 * calendar, which passes `defaultDate` so the picked day is prefilled.
 */
export function EventFormModal({
  event,
  defaultDate,
  open,
  onClose,
  onSaved,
}: {
  /** Present when editing; absent when creating. */
  event?: ClubEvent;
  /** `YYYY-MM-DD` to prefill when creating. Ignored while editing. */
  defaultDate?: string;
  open: boolean;
  onClose: () => void;
  onSaved: (event: ClubEvent) => void;
}) {
  const editing = Boolean(event);
  const [form, setForm] = useState(BLANK);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  /** Object URL for the file just chosen, so the preview appears before upload. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  // Prefer the local object URL while uploading, then the stored URL.
  const coverPreview = localPreview ?? (form.cover_url || null);

  useEffect(() => {
    if (!open) setLocalPreview(null);
  }, [open]);

  /**
   * Uploads immediately and keeps only the returned URL in form state.
   *
   * Deliberately not deferred to submit: the create endpoint is JSON, and an
   * abandoned dialog leaving a stray file is a smaller problem than making both
   * event routes multipart.
   */
  const pickCover = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setError("Cover image must be under 8MB.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setCoverBusy(true);
    setError(null);
    try {
      const { url } = await api.uploadImage(file);
      setForm((f) => ({ ...f, cover_url: url }));
    } catch (err) {
      setLocalPreview(null);
      setError(err instanceof Error ? err.message : "Could not upload the cover");
    } finally {
      URL.revokeObjectURL(preview);
      setCoverBusy(false);
    }
  };

  // Existing reminders come from the admin schedule endpoint, not the event
  // record, so they are fetched when the dialog opens on an existing event.
  useEffect(() => {
    if (!open) {
      setOffsets([]);
      return;
    }
    if (!event) return;
    let cancelled = false;
    api
      .eventReminders(event.id)
      .then((s) => {
        if (!cancelled) setOffsets(s.reminders.map((r) => r.hours_before));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, event]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (event) {
      setForm({
        title: event.title,
        type: event.type,
        date_time: toLocalInput(event.date_time),
        location: event.location,
        price: String(event.price),
        kids_allowed: Boolean(event.kids_allowed),
        kid_price: event.kid_price != null ? String(event.kid_price) : "0",
        status: event.status,
        description: event.description ?? "",
        capacity: event.capacity != null ? String(event.capacity) : "",
        cover_url: event.cover_url ?? "",
      });
    } else {
      setForm({
        ...BLANK,
        date_time: defaultDate ? dayKeyToLocalInput(defaultDate) : "",
      });
    }
  }, [open, event, defaultDate]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const price = Number.parseFloat(form.price);
    if (!form.title.trim() || !form.location.trim() || !form.date_time) {
      setError("Title, date/time and location are all required.");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setError("Price must be zero or more.");
      return;
    }

    // Blank is a valid answer meaning unlimited; anything else must be a whole
    // number of at least one.
    /* Only validated when the toggle is on. A stale figure behind a disabled
       toggle should not block a save — the server clears it either way. */
    let kidPrice: number | null = null;
    if (form.kids_allowed) {
      kidPrice = Number.parseFloat(form.kid_price);
      if (Number.isNaN(kidPrice) || kidPrice < 0) {
        setError("Set an entry price for children of 0 or more.");
        return;
      }
    }

    const capacityText = form.capacity.trim();
    let capacity: number | null = null;
    if (capacityText !== "") {
      const n = Number(capacityText);
      if (!Number.isInteger(n) || n < 1) {
        setError("Capacity must be a whole number of 1 or more, or blank for no limit.");
        return;
      }
      capacity = n;
    }

    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        // Local input → ISO, so the backend stores the intended instant.
        date_time: new Date(form.date_time).toISOString(),
        location: form.location.trim(),
        price,
        status: form.status,
        description: form.description.trim() || null,
        capacity,
        /* Always sent, so turning children off on an edit actually clears the
           price — the backend keys the whole pair on kids_allowed. */
        kids_allowed: form.kids_allowed,
        kid_price: kidPrice,
        // Always sent, including as an empty string, so clearing the cover on an
        // edit actually clears it — the backend keys on `undefined`, not falsy.
        cover_url: form.cover_url.trim() || null,
        reminder_offsets: offsets,
      };

      const res = event
        ? await api.updateEvent(event.id, payload)
        : await api.createEvent(payload);

      onSaved(res.event);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit event" : "New event"}
      subtitle={
        editing
          ? "Changes are live for members as soon as you save."
          : "Save as a draft, then publish when you're ready."
      }
      size="lg"
      footer={
        <div className="flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={busy} className="flex-1">
            {editing ? "Save changes" : "Create event"}
          </Button>
        </div>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-5">
        <Field label="Title" htmlFor="ev-title">
          <Input
            id="ev-title"
            value={form.title}
            onChange={set("title")}
            placeholder="Sunday long run — river loop"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Discipline" htmlFor="ev-type">
            <Select id="ev-type" value={form.type} onChange={set("type")}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date & start time" htmlFor="ev-date">
            <Input
              id="ev-date"
              type="datetime-local"
              value={form.date_time}
              onChange={set("date_time")}
            />
          </Field>
        </div>

        <Field label="Location" htmlFor="ev-loc">
          <Input
            id="ev-loc"
            value={form.location}
            onChange={set("location")}
            placeholder="Cubbon Park, Bengaluru"
          />
        </Field>

        <Field
          label="Description"
          htmlFor="ev-desc"
          hint="Optional. The brief members read on the event page — route, pace groups, what to bring."
        >
          <Textarea
            id="ev-desc"
            rows={4}
            value={form.description}
            onChange={set("description")}
            placeholder={
              "Six by 800m up the west face, jog back down between reps.\n" +
              "Meet at the gate. Bring water — there's no tap on the climb."
            }
          />
        </Field>

        {/* Cover image. Uploaded immediately rather than on submit, so the form
            only ever carries a URL — that keeps the create/update endpoints as
            plain JSON and lets a cover be chosen before the event exists. */}
        <div>
          <span className="eyebrow mb-1.5 block text-ink-2">Cover image</span>
          <div
            onClick={() => coverRef.current?.click()}
            className="group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-xl border border-dashed border-white/14 p-4 transition-colors hover:border-gold/45"
          >
            <span className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/8 bg-surface-2/60">
              {coverPreview ? (
                <img src={coverPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <SparkIcon className="size-4 text-ink-3" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-3">
              {coverBusy
                ? "Uploading…"
                : coverPreview
                  ? "Click to replace. Shown behind the event's title."
                  : "Click to upload a cover (optional). Landscape works best — it sits behind the event title."}
            </span>
            <input
              ref={coverRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Reset so picking the same file twice still fires onChange.
                e.target.value = "";
                if (f) void pickCover(f);
              }}
            />
          </div>
          {coverPreview && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, cover_url: "" }))}
              className="mt-2 text-[12px] text-ink-3 transition-colors hover:text-[color:var(--color-failed)]"
            >
              Remove cover
            </button>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Entry price (INR)" htmlFor="ev-price" hint="Zero makes it free to enter.">
            <Input
              id="ev-price"
              type="number"
              min="0"
              step="1"
              value={form.price}
              onChange={set("price")}
            />
          </Field>

          <Field
            label="Places"
            htmlFor="ev-capacity"
            hint="Leave blank for no limit. Children use a place; a volunteer's own does not."
          >
            <Input
              id="ev-capacity"
              type="number"
              min="1"
              step="1"
              value={form.capacity}
              onChange={set("capacity")}
              placeholder="Unlimited"
            />
          </Field>
        </div>

        {/* Children. The price only appears once they are allowed — a price
            behind a disabled toggle is a number nobody can act on, and it is
            what gets switched back on months later and surprises somebody. */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <Checkbox
            checked={form.kids_allowed}
            onChange={(v) => setForm((f) => ({ ...f, kids_allowed: v }))}
            label="Children welcome at this session"
            description="Members can then add children to their booking, priced separately from adults."
          />
          {form.kids_allowed && (
            <Field
              label="Entry per child (INR)"
              htmlFor="ev-kid-price"
              hint="Zero lets children in free. Charged per child on top of the adult entries."
              className="mt-4 max-w-xs"
            >
              <Input
                id="ev-kid-price"
                type="number"
                min="0"
                step="1"
                value={form.kid_price}
                onChange={set("kid_price")}
              />
            </Field>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Status" htmlFor="ev-status">
            <Select id="ev-status" value={form.status} onChange={set("status")}>
              <option value="DRAFT">Draft — hidden from members</option>
              <option value="PUBLISHED">Published — open for registration</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>

          {/* Editing an event that already has signups: show how full it is, so
              the organiser knows what they can safely lower the cap to. */}
          {editing && event?.capacity != null && (
            <div className="rounded-xl border border-white/8 bg-surface-2/40 px-3.5 py-3">
              <p className="eyebrow">Currently</p>
              <p className="mt-1.5 text-[13.5px] text-ink-2">
                <span className="tnum font-semibold text-ink">{event.taken ?? 0}</span> of{" "}
                <span className="tnum">{event.capacity}</span> places taken
                {event.full && <span className="ml-1.5 text-[color:var(--color-pending)]">· full</span>}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
                The cap can't go below what's already taken.
              </p>
            </div>
          )}
        </div>

        {/* Email reminders */}
        <div className="rounded-xl border border-white/8 bg-surface-2/40 p-4">
          <p className="eyebrow text-ink-2">Email reminders</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
            Registrants get one email per box you tick. Each is sent once, and only for
            published events that haven't started.
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {REMINDER_OFFSETS.map((h) => {
              const on = offsets.includes(h);
              return (
                <button
                  key={h}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setOffsets((prev) =>
                      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
                    )
                  }
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-all duration-200",
                    on
                      ? "border-gold bg-gold/14 text-gold"
                      : "border-white/12 text-ink-3 hover:border-white/25 hover:text-ink-2",
                  )}
                >
                  {OFFSET_LABEL[h] ?? `${h}h`}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-ink-3">
            {offsets.length === 0
              ? "No reminders — nobody will be emailed about this event."
              : `${offsets.length} reminder${offsets.length === 1 ? "" : "s"} per registrant.`}
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

      </form>
    </Modal>
  );
}
