import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { REMINDER_OFFSETS } from "../lib/types";
import type { ClubEvent, EventStatus } from "../lib/types";
import { cn } from "../lib/format";
import { Button, Field, Input, Modal, Select } from "./ui";

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
  status: "DRAFT" as EventStatus,
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
        status: event.status,
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
    >
      <form onSubmit={submit} className="space-y-5">
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

          <Field label="Status" htmlFor="ev-status">
            <Select id="ev-status" value={form.status} onChange={set("status")}>
              <option value="DRAFT">Draft — hidden from members</option>
              <option value="PUBLISHED">Published — open for registration</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
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

        <div className="flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={busy} className="flex-1">
            {editing ? "Save changes" : "Create event"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
