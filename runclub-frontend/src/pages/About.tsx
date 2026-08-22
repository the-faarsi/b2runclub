import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarIcon,
  InstagramIcon,
  PinIcon,
  RouteGraphic,
  SparkIcon,
  TicketIcon,
  UsersIcon,
  WhatsAppIcon,
} from "../components/icons";
import { Page, PageHeader } from "../components/layout";
import { PageScene } from "../components/scene3d";
import { Reveal } from "../components/motion";
import { Tilt, TiltLayer } from "../components/tilt";
import {
  Button,
  buttonClass,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fullDate } from "../lib/format";
import type { ClubInfo } from "../lib/types";
import { useFetch } from "../lib/useFetch";

/* Shown when an organiser hasn't written the copy yet, so the page is never
 * blank for visitors. Admins see a prompt to replace it. */
const PLACEHOLDER = {
  headline: "A running club that actually runs on time.",
  about:
    "Burn and Bond is a community running club. We meet for road runs, trail sessions and the occasional ride, and we finish with coffee. Everyone is welcome, whatever your pace.",
  mission: "Show up, run together, look after each other.",
};

/** What the club does, for the pillars strip. Static — it describes the app. */
const WHAT_WE_DO = [
  {
    Icon: CalendarIcon,
    title: "A calendar you can trust",
    body: "Sessions are published ahead of time with the route, the start and the entry fee. No guessing.",
  },
  {
    Icon: TicketIcon,
    title: "Register in two taps",
    body: "Sign the waiver once, pay in-app, and carry a QR ticket we scan at the start line.",
  },
  {
    Icon: UsersIcon,
    title: "Marshalled by members",
    body: "Volunteers run the junctions and the briefing — and their entry is comped for it.",
  },
];

export function About() {
  const { isAdmin } = useAuth();
  const load = useCallback(() => api.clubInfo(), []);
  const { data, loading, error, reload, setData } = useFetch(load);
  const [editing, setEditing] = useState(false);

  const info = data;
  const headline = info?.headline?.trim() || PLACEHOLDER.headline;
  const about = info?.about?.trim() || PLACEHOLDER.about;
  const mission = info?.mission?.trim() || PLACEHOLDER.mission;
  const usingPlaceholder = !info?.about?.trim();

  const facts = [
    info?.founded && { label: "Founded", value: info.founded, Icon: SparkIcon },
    info?.home_base && { label: "Home base", value: info.home_base, Icon: PinIcon },
    info?.contact_email && { label: "Contact", value: info.contact_email, Icon: UsersIcon },
  ].filter(Boolean) as { label: string; value: string; Icon: typeof SparkIcon }[];

  return (
    <Page>
      <PageScene variant="orb" opacity={0.38} />
      <PageHeader
        eyebrow="About the club"
        title="Who we are"
        description="What Burn and Bond is, how it runs, and how to find us."
        action={
          isAdmin ? (
            <Button onClick={() => setEditing(true)}>Edit club details</Button>
          ) : (
            <Link to="/calendar" className={buttonClass("outline", "md")}>
              See the calendar
            </Link>
          )
        }
      />

      {loading ? (
        <div className="space-y-5">
          <Card className="p-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-6">
                <Skeleton className="size-10 rounded-xl" />
                <Skeleton className="mt-4 h-4 w-1/2" />
                <Skeleton className="mt-2 h-3 w-full" />
              </Card>
            ))}
          </div>
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : (
        <>
          {/* Nudge only the admin — visitors just see the placeholder copy. */}
          {isAdmin && usingPlaceholder && (
            <p className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-gold/25 bg-gold/8 px-4 py-3 text-[13px] text-ink-2">
              <SparkIcon className="size-4 shrink-0 text-gold" />
              This page is showing placeholder copy. Add the club's own story so members and
              visitors see the real thing.
              <button
                onClick={() => setEditing(true)}
                className="font-semibold text-gold hover:underline"
              >
                Write it now →
              </button>
            </p>
          )}

          {/* Hero statement */}
          <Reveal>
            <Card className="speedlines grain relative overflow-hidden p-7 sm:p-10">
              <div
                className="pointer-events-none absolute -right-8 top-0 hidden h-full w-[38%] text-ink opacity-70 lg:block"
                aria-hidden
              >
                <RouteGraphic className="h-full w-full" />
              </div>
              <div className="relative max-w-2xl">
                <p className="eyebrow text-gold">Our story</p>
                <h2 className="display foil mt-3 text-[clamp(28px,4.6vw,46px)]">{headline}</h2>
                <p className="mt-5 whitespace-pre-wrap text-[15.5px] leading-relaxed text-ink-2">
                  {about}
                </p>
              </div>
            </Card>
          </Reveal>

          {/* Mission */}
          {mission && (
            <Reveal delay={0.05}>
              <Card className="mt-5 p-7 text-center sm:p-9">
                <p className="eyebrow">What we're about</p>
                <p className="display mx-auto mt-3 max-w-2xl text-[clamp(20px,2.8vw,30px)] leading-tight text-ink">
                  “{mission}”
                </p>
              </Card>
            </Reveal>
          )}

          {/* Facts */}
          {facts.length > 0 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {facts.map((f, i) => (
                <Reveal key={f.label} delay={i * 0.05}>
                  <Tilt max={7} lift={8}>
                    <Card hover className="edge-gold h-full p-6">
                      <TiltLayer depth={26}>
                        <span className="grid size-10 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold">
                          <f.Icon className="size-[18px]" />
                        </span>
                      </TiltLayer>
                      <p className="eyebrow mt-4">{f.label}</p>
                      <p className="mt-1.5 break-words text-[15px] font-medium text-ink">
                        {f.value}
                      </p>
                    </Card>
                  </Tilt>
                </Reveal>
              ))}
            </div>
          )}

          {/* How the club runs */}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {WHAT_WE_DO.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.06}>
                <Tilt max={8} lift={9}>
                  <Card hover className="edge-gold group h-full p-6">
                    <TiltLayer depth={30}>
                      <span className="grid size-10 place-items-center rounded-xl border border-gold/25 bg-gold/8 text-gold transition-transform duration-300 group-hover:scale-110">
                        <p.Icon className="size-[18px]" />
                      </span>
                    </TiltLayer>
                    <TiltLayer depth={16}>
                      <h3 className="mt-4 text-[15px] font-semibold text-ink">{p.title}</h3>
                      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{p.body}</p>
                    </TiltLayer>
                  </Card>
                </Tilt>
              </Reveal>
            ))}
          </div>

          {/* Find us */}
          {(info?.instagram || info?.strava_club || info?.whatsapp || info?.contact_email) && (
            <Reveal>
              <Card className="mt-5 p-7">
                <p className="eyebrow">Find us</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {/* Gold rather than outline: joining the community is the one
                      action on this card, the rest are just links. */}
                  {info?.whatsapp && (
                    <a
                      href={info.whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass("gold", "sm")}
                    >
                      <WhatsAppIcon className="size-4" />
                      Join the WhatsApp community
                    </a>
                  )}
                  {/* The backend normalises this to a bare handle, whether a URL or
                      an @handle was pasted, so only one shape needs handling. */}
                  {info?.instagram && (
                    <a
                      href={`https://instagram.com/${info.instagram}`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass("outline", "sm")}
                    >
                      <InstagramIcon className="size-4" />
                      Follow @{info.instagram}
                    </a>
                  )}
                  {info?.strava_club && (
                    <a
                      href={
                        info.strava_club.startsWith("http")
                          ? info.strava_club
                          : `https://www.strava.com/clubs/${info.strava_club}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass("outline", "sm")}
                    >
                      Strava club
                    </a>
                  )}
                  {info?.contact_email && (
                    <a href={`mailto:${info.contact_email}`} className={buttonClass("ghost", "sm")}>
                      {info.contact_email}
                    </a>
                  )}
                </div>
              </Card>
            </Reveal>
          )}

          {info?.updated_at && (
            <p className="mt-5 text-[11px] text-ink-3">
              Last updated {fullDate(info.updated_at)}.
            </p>
          )}
        </>
      )}

      {isAdmin && (
        <EditClubModal
          info={info}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={(club) => setData(() => club)}
        />
      )}
    </Page>
  );
}

/* ── Admin editor ─────────────────────────────────────────── */

function EditClubModal({
  info,
  open,
  onClose,
  onSaved,
}: {
  info: ClubInfo | null;
  open: boolean;
  onClose: () => void;
  onSaved: (club: ClubInfo) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    headline: "",
    about: "",
    mission: "",
    founded: "",
    home_base: "",
    contact_email: "",
    instagram: "",
    strava_club: "",
    whatsapp: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      headline: info?.headline ?? "",
      about: info?.about ?? "",
      mission: info?.mission ?? "",
      founded: info?.founded ?? "",
      home_base: info?.home_base ?? "",
      contact_email: info?.contact_email ?? "",
      instagram: info?.instagram ?? "",
      strava_club: info?.strava_club ?? "",
      whatsapp: info?.whatsapp ?? "",
    });
  }, [open, info]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.saveClubInfo(form);
      onSaved(res.club);
      toast(res.message, "ok");
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
      title="Club details"
      subtitle="Everything here is public — members and visitors see this page."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Headline" htmlFor="ci-headline" hint="One line, the club in a sentence.">
          <Input
            id="ci-headline"
            value={form.headline}
            onChange={set("headline")}
            placeholder="A running club that actually runs on time."
            maxLength={120}
          />
        </Field>

        <Field
          label="About"
          htmlFor="ci-about"
          hint={`${form.about.length} characters. Line breaks are kept.`}
        >
          <Textarea
            id="ci-about"
            rows={6}
            value={form.about}
            onChange={set("about")}
            placeholder="How the club started, who it's for, what a session looks like…"
          />
        </Field>

        <Field label="Mission" htmlFor="ci-mission" hint="Shown as a pull quote.">
          <Input
            id="ci-mission"
            value={form.mission}
            onChange={set("mission")}
            placeholder="Show up, run together, look after each other."
            maxLength={160}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Founded" htmlFor="ci-founded">
            <Input id="ci-founded" value={form.founded} onChange={set("founded")} placeholder="2021" />
          </Field>
          <Field label="Home base" htmlFor="ci-base">
            <Input
              id="ci-base"
              value={form.home_base}
              onChange={set("home_base")}
              placeholder="Madurai"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact email" htmlFor="ci-email">
            <Input
              id="ci-email"
              type="email"
              value={form.contact_email}
              onChange={set("contact_email")}
              placeholder="hello@bsquared.run"
            />
          </Field>
          <Field
            label="Instagram"
            htmlFor="ci-ig"
            hint="Handle or full profile URL — either is saved as the handle."
          >
            <Input
              id="ci-ig"
              value={form.instagram}
              onChange={set("instagram")}
              placeholder="@bsquaredrun"
            />
          </Field>
        </div>

        <Field label="Strava club" htmlFor="ci-strava" hint="Club id or full URL.">
          <Input
            id="ci-strava"
            value={form.strava_club}
            onChange={set("strava_club")}
            placeholder="1234567"
          />
        </Field>

        <Field
          label="WhatsApp community"
          htmlFor="ci-whatsapp"
          hint="The group's 'Invite via link'. Paste a new one here if you ever reset the link — the old one stops working."
        >
          <Input
            id="ci-whatsapp"
            value={form.whatsapp}
            onChange={set("whatsapp")}
            placeholder="https://chat.whatsapp.com/…"
            inputMode="url"
          />
        </Field>

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
            Save details
          </Button>
        </div>
      </form>
    </Modal>
  );
}
