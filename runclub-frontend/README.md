# B Squared — Run Club frontend

A React + TypeScript frontend for the `runclub-backend` Express API. Dark-first
black-and-gold design system: near-black surfaces, a gold accent, glass cards,
and role-aware navigation for visitors, members, volunteers and organisers.

## Running it

The backend must be up first (it serves on `:3000`):

```bash
cd ../runclub-backend && npm run dev
```

Then:

```bash
npm install
npm run dev          # http://localhost:5173
```

Vite proxies `/api` and `/health` to `http://localhost:3000`, so the browser
sees one origin and no CORS preflight is involved. Point at a different backend
with `BACKEND_URL=http://host:port npm run dev`, or build against another origin
entirely with `VITE_API_BASE_URL`.

```bash
npm run build        # tsc -b && vite build
npm run typecheck
```

### Demo accounts

Seeded by `npm run test:api` in the backend. The login screen shows one-click
buttons for these **in dev builds only**.

| Role | Email | Password |
|---|---|---|
| Organiser | `admin@runclub.com` | `adminpassword` |
| Member | `member@runclub.com` | `memberpassword` |
| Volunteer | `volunteer@runclub.com` | `volunteerpassword` |

## What each role sees

| | Visitor | Member | Volunteer | Organiser |
|---|---|---|---|---|
| Calendar, events, polls, leaderboard | ✓ | ✓ | ✓ | ✓ |
| Gallery (view) · About page | ✓ | ✓ | ✓ | ✓ |
| Forum | — | ✓ | ✓ | ✓ |
| Post to the gallery | — | — | ✓ | ✓ |
| Edit About · manage collaborators | — | — | — | ✓ |
| Register for events | — | ✓ (pays) | ✓ (comped) | — |
| QR tickets | — | ✓ | ✓ | — |
| Post / comment | — | ✓ | ✓ | ✓ |
| Vote in polls | — | ✓ | ✓ | ✓ |
| Announcements, drafts, rosters, revenue | — | — | — | ✓ |

Organisers can't register for events — the backend restricts
`POST /events/:id/register` to `MEMBER` and `VOLUNTEER`, and the UI reflects
that rather than offering a button that would 403.

### Member conveniences

- **Add to calendar** — generates an RFC-5545 `.ics` with a 1-hour reminder. The
  schema has no duration, so a 2-hour block is assumed.
- **Share** — native share sheet on touch devices, clipboard copy on desktop.
- **Save QR** — pulls the inlined QR out of the ticket document as a PNG.
- **Live countdown** — ticks every second on the event page.
- **Mark all read** — the API only marks one notification at a time, so this
  fans out and reconciles locally, falling back to a refetch if any call fails.

### Cancelling a registration

A **Cancel** action appears wherever a registration does — My tickets, the event
page and the calendar — all driven by one `CancelRegistrationDialog` so the rules
and wording can't diverge.

Who may cancel what, enforced in `DELETE /api/events/registration/:id`:

| Case | Result |
|---|---|
| Own `PENDING` or `FREE` entry | cancelled, spot released |
| Own `PAID` entry | refused — implies a refund, so an organiser must do it |
| Someone else's, as a member | 403 |
| Any entry, as an organiser | cancelled; response carries `refund_due` |
| Event already started | refused, so attendance history isn't rewritten |

Cancelling **deletes** the row rather than flagging it, so the person is free to
register again later if there's still room.

### Blocking someone from an event

The event page carries a **Who's registered** panel for organisers (JSON roster,
searchable) with **Block** / **Readmit** per person.

Blocking is stored in its own nullable `blocked_at` column, deliberately *not* by
overloading `status`. That keeps it orthogonal to payment: a block never destroys
the payment state, so readmitting restores the registration exactly as it was —
important when a block was a mistake. A blocked person:

- loses their QR ticket (`403` from the ticket route — the block is checked
  separately, since the registration keeps its `PAID`/`FREE` status),
- **cannot re-register**, because the existing-registration check catches the row
  and returns a block-specific message rather than "already registered",
- cannot self-cancel their way out of it,
- sees *Removed by organiser* on their ticket, the event page and the calendar,
- gets a notification, and another if readmitted.

To take someone off the roster entirely, cancel the registration instead — the
block dialog says so.

`blocked_at` was added with a plain additive `ALTER TABLE` plus a `schema.prisma`
field and `prisma generate`, rather than `prisma db push`, so there was no chance
of a reset against an existing dev database. The CSV roster export gained a
matching `Blocked` column.

### Gallery

`/gallery` is a masonry grid with a lightbox. **Admins and volunteers can post;
members and visitors get a view-only page** — the upload button simply is not
rendered for them, and `POST /api/content/gallery` is `requireRole(["ADMIN",
"VOLUNTEER"])`, so it is a real boundary. A volunteer may delete only their own
photos; an admin may delete any.

Images are uploaded via multer to a local `uploads/` directory served by
`express.static`. Filenames are generated server-side (never taken from the
client), MIME is allow-listed to JPEG/PNG/WebP/GIF/AVIF, and the cap is 8MB.
Deleting a photo removes the row first, then the file — a stale file is harmless,
a dangling row is not. An external image URL is accepted as an alternative.

> For anything beyond a single machine this should move to object storage
> (S3/R2). The stored value is just a URL, so only the upload destination
> changes — no schema change needed.

### About page

`/about` is public. Admins get an **Edit club details** dialog covering headline,
about copy, mission, founded, home base, contact email, Instagram and Strava
club. It is stored as a single-row `ClubInfo` table and read with an upsert, so
the row does not need to exist first. If the copy is empty the page shows
placeholder text rather than a blank — and only the admin sees a prompt to
replace it.

### Collaborators scroller

The home page carries a continuous marquee of collaborators. Hovering one dims
the rest and raises a **shout-out card** with the blurb, tier and link; the whole
strip pauses while the pointer is over it.

The marquee is a **CSS keyframe animation, not framer-motion** — that is
deliberate, because `animation-play-state: paused` is what makes hover-to-pause
work, and a JS-driven transform cannot be paused that way. The row is rendered
twice and translated -50% for a seamless loop, with the duplicate `aria-hidden`
so it is announced once. Under reduced motion the animation is dropped, the
duplicate hidden, and the strip becomes a normal horizontal scroller.

Managed at `/admin/collaborators` (admin only): name, shout-out, tier, website,
and an uploaded or linked logo. No logo falls back to a gold monogram.

### Roles & promotion

`/admin/members` is the club directory. An organiser can move anyone between
**member**, **volunteer** and **visitor**; promoting to volunteer is the one that
matters, because the backend comps a volunteer's entry on every registration.

Guard rails, all enforced server-side in `PUT /api/admin/members/:id/role`:

- **ADMIN is not assignable.** A member-management screen that can mint
  organisers makes privilege escalation one click; promote an organiser directly
  in the database instead.
- **An admin cannot change their own role**, which would otherwise be a way to
  lock the club out of its own tools.
- **Another organiser's role cannot be changed here** either.
- Repeat calls are idempotent and report `changed: false`.

A role change is **not retroactive**: existing registrations keep their payment
status and their `role_at_event`, so history stays accurate and no money record
is silently rewritten. The confirmation dialog says so explicitly when the person
already has registrations. Only registrations made afterwards are comped.

The person gets a notification explaining what changed and what it means.

### The volunteer perk

This was already in the backend — `POST /events/:id/register` sets
`status: "FREE"`, `role_at_event: "VOLUNTEER"` and creates no Razorpay order for
a volunteer, regardless of the event price. What was missing was making it
visible, so now: the event page strikes through the sticker price and shows
*Free* with a "comped as a club volunteer" note, the profile carries a perk card
(and members get a nudge explaining how to ask for it), and the directory badges
every volunteer with *Comped entry*.

### Organiser tools

- **Turnout per event** — no aggregate endpoint exists, so this reads each
  event's roster export and counts it. Fine at club scale; it would need a real
  endpoint for hundreds of events.
- **Ticket-ready rate** — share of registrations that can actually be scanned.
- **Export all rosters** — one CSV across every event, for accounting.
- **Search** on manage-events by title, place or discipline.

Access is derived from one helper, `isClubMember` in `lib/auth.tsx` (MEMBER,
VOLUNTEER or ADMIN — the same set the backend accepts for posting and voting).
It gates the forum route, hides the forum nav link, and disables poll voting, so
the three rules can't drift apart.

**The forum is club-only.** `/forum` is wrapped in a role guard: a VISITOR or a
signed-out user is redirected rather than shown the page, and the nav link is not
rendered for them. Note the backend's `GET /api/forum/posts` is still public — the
restriction is enforced in the client, so it is a UX boundary, not a security one.
Add `requireRole` to that route if it needs to be enforced server-side.

**Visitors can read polls but not vote.** Results stay visible; the vote buttons
are replaced with a locked, read-only note. The backend independently rejects the
vote, so this one is enforced on both sides.

## Calendar

`/calendar` is a Monday-first month grid built from a fixed 42-cell window, so it
never reflows between months.

**Organisers can schedule from the grid.** Picking a date and pressing *New
event* / *Create event here* opens the shared `EventFormModal` with that date
prefilled (defaulting to a 06:30 start), and a dashed *Add another session on
this date* row appears under a day that already has one. On save the grid updates
in place and jumps to the created event's day — even if the date was changed
inside the form. None of these controls render for other roles, and
`POST /api/events` is `requireRole(["ADMIN"])` server-side, so this is a real
boundary rather than a hidden button.

The form itself lives in `components/eventForm.tsx`, shared with
`/admin/events` — it was previously private to that page, and was extracted
rather than duplicated. Days carrying sessions are marked with gold pips
(capped at three, then `+n`); past sessions grey out; a green dot marks a day you
are registered for. Selecting a day opens a side rail listing that day's sessions
with the action that actually applies — *Take this spot*, *View QR ticket*, a
payment-status note, or a sign-in prompt. It opens on the next upcoming session
rather than an empty "today", and organisers additionally see unpublished drafts
in the grid.

## Layout

```
src/
  lib/
    api.ts       typed client for every endpoint + CSV parsing, 401 handling
    auth.tsx     AuthProvider: session restore, JWT expiry, role helpers
    types.ts     mirrors prisma/schema.prisma
    format.ts    currency/date/status formatting, the status palette map
    motion.ts    easing/duration tokens, variants, count-up + countdown hooks
    razorpay.ts  Checkout loader, mock detection, typed result
    share.ts     .ics generation, share sheet / clipboard, QR extraction
    useFetch.ts  fetch-on-mount with loading/error/reload
  components/
    ui.tsx       Button, Card, Field, Modal, Toasts, Tabs, Avatar, states
    charts.tsx   StatTile, HeroFigure, BarList, StatusBar, DataTable
    motion.tsx   Reveal, Stagger, Spotlight, AnimatedNumber, ProgressRing,
                 ScrollProgress, Confetti
    icons.tsx    discipline + UI line icons, medals, route/track graphics
    layout.tsx   Navbar, notification bell, user menu, Page furniture
    events.tsx   EventCard, RegisterDialog (waiver + pay), TicketModal
  pages/         Landing, Auth, Calendar, Events, EventDetail, MyTickets,
                 Forum, Polls, Leaderboard, Profile, NotFound, admin/*
```

### 3D

Two layers, deliberately separate.

**WebGL scenes — one per page.** Six procedural variants, mapped so each area of
the app has its own character:

| Variant | Where | What it is |
|---|---|---|
| `ribbon` | Landing hero | Gold tube swept along a curve, with a pace marker running the loop |
| `lattice` | Events, calendar, tickets | Grid of floating tiles, a few lit like booked days |
| `towers` | Leaderboard, polls, dashboard | Extruded bars that grow in and breathe |
| `orb` | About, profile, members | Faceted solid inside a counter-rotating wireframe |
| `frames` | Gallery, collaborators | Carousel of drifting photo plates with gold edges |
| `knot` | Forum, event detail, 404 | Interlinked torus knot |

All **procedural** — there are no `.glb`/`.gltf` assets, so the payload is the
three.js runtime and nothing else.

Every scene lives in one module (`components/scene3d/scenes.tsx`) imported from
exactly one place, so:

| Guard | Verified effect |
|---|---|
| Single `React.lazy` boundary | **one** 224KB chunk for the whole app; main bundle stays ~149KB |
| Shared across routes | 1 network fetch across 7 SPA navigations, then cached |
| `matchMedia("(min-width: 1024px)")` in JS | phones download **0 bytes** of three.js and mount no canvas |
| Skipped entirely under `prefers-reduced-motion` | no canvas at all — a stronger guarantee than pausing, and no GPU cost |
| `requestIdleCallback` before mount | page content paints first |
| `frameloop="demand"` when tab hidden | render loop stops in the background |
| WebGL probe + error boundary | falls back to the flat SVG graphic |
| `webglcontextlost` → `preventDefault()` | browsers cap concurrent contexts and fast navigation drops one; without this the canvas stays blank permanently. Verified it recovers and keeps drawing after 20 rapid navigations |

Backdrops are placed in the **top-right and radially masked**, not stretched
behind the content: cards are translucent (`bg-surface/80` + blur), so a
full-bleed scene reads as bleed-through under text rather than as depth. Opacity
is 0.20–0.30 on dense pages (admin, tables) and higher on sparse ones.

`npm run build` should show `scenes-*.js` as a separate chunk and **exactly one**
file containing three.js. If it lands in `index-*.js`, something imported it
eagerly.

**CSS 3D (everywhere, no dependency).** `components/tilt.tsx` provides
`Tilt`/`TiltLayer` for cursor-driven perspective with real `translateZ` parallax,
and `FlipCard` for the QR ticket. Plus a 3D podium on the leaderboard and a
`press-3d` push on every button. `Tilt` writes rotation to CSS custom properties
inside a `requestAnimationFrame`, so a pointer move never triggers a React render
and the transform stays on the compositor. Text inputs are left untilted.

### Motion

Animation is a system, not per-component guesswork. `lib/motion.ts` owns one
easing curve (`cubic-bezier(0.16, 1, 0.3, 1)`) and four durations; everything
else composes those. Reusable pieces live in `components/motion.tsx`:

| Piece | Where it's used |
|---|---|
| `Reveal` / `Stagger` | sections and lists rising in on scroll, once each |
| `Spotlight` | cursor-tracking sheen on cards — writes CSS vars, never re-renders |
| `AnimatedNumber` | stat tiles and the revenue hero counting up |
| `ProgressRing` | ticket-ready rate on the dashboard |
| `ScrollProgress` | hairline gold bar under the navbar |
| `Confetti` | one short burst when a spot is secured |

**Reduced motion is honoured twice**: CSS neutralises transitions/animations
globally, and the JS hooks check `useReducedMotion()` so counters jump straight
to their value and confetti never mounts. Pointer-driven effects short-circuit
too.

### Graphics

Text glyphs (`▲ ◆ ✦`) were replaced with a real line-icon set on a 24px grid at
1.7 stroke, so icons sit at the same optical weight as the type: seven
discipline icons plus UI icons, gold/silver/bronze medals for the top three, a
self-drawing route trace on the hero, and a track illustration for empty states.

### Data visualisation

Charts follow a validated colour system rather than an eyeballed one:

- **Single-series magnitude** (poll results, weekly distance) uses one hue,
  `--color-mark` `#b38a22`, which passes the lightness band, chroma floor and
  3:1 contrast against the chart surface `#14161A`. No legend box — the title
  names the series.
- **Payment state** uses the fixed status palette (`#0ca30c` paid, `#3987e5`
  comped, `#fab219` awaiting, `#d03b3b` failed). Every state ships an **icon and
  a label**, so state never reads by colour alone.
- Brand gold `#e9b949` is UI chrome only — buttons, focus rings, links (10.9:1 on
  black). It is never a data mark: at L 0.90 it sits well outside the
  dark-surface mark band, so marks use the darker banded step instead.
- Bars cap at 24px with a 4px rounded data-end square at the baseline; stacked
  segments are separated by a 2px surface gap; every chart has a hover layer and
  a **table view** toggle.

## Payments

Registration and payment are two steps. `POST /events/:id/register` holds the
spot and creates a Razorpay order; the browser then settles that order.

1. Register → the spot is held at `PENDING` with a `razorpay_order_id`.
2. `lib/razorpay.ts` loads Razorpay **Checkout** and opens it over the page.
   Checkout is an overlay served from Razorpay's CDN — it is *not* a redirect, so
   the browser never leaves this origin.
3. On success Checkout hands back `{ order_id, payment_id, signature }`, which
   goes to `POST /api/payments/verify`. The backend recomputes the HMAC and flips
   the registration to `PAID`, then writes the ticket notification.
4. Closing the overlay is not a failure — the spot stays held, and **Pay** on
   *My tickets* resumes the same order.

### Turning real payments on

Out of the box `runclub-backend/.env` still has the placeholder
`RAZORPAY_KEY_ID="rzp_test_YourTestKeyId"`. The backend treats that as mock mode:
it fabricates `order_mock_*` ids instead of calling Razorpay, and returns
`razorpay_key_id: "mock_key_id"`. Checkout would reject such an order, so the UI
detects this and says so rather than opening a window that cannot work.

To enable it, take test keys from the Razorpay dashboard and set:

```bash
# runclub-backend/.env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_test_secret

# runclub-frontend/.env  — only needed for the "Pay" resume button
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
```

Then restart the backend (`tsx` runs without a watcher, so edits need a restart).
Use Razorpay's test card `4111 1111 1111 1111`, any future expiry, any CVV.

The webhook at `POST /api/payments/webhook` remains the authoritative path for
production, and it needs a publicly reachable URL plus
`RAZORPAY_WEBHOOK_SECRET`. `/verify` exists because the webhook can never reach
`localhost`; both are idempotent, so whichever lands first wins and the other
no-ops.

> Note: while the placeholder secret is in `.env`, anyone who knows it can forge
> a `/verify` signature and mark a registration paid. That is fine for local
> development — and it is how the `PENDING → PAID` path is testable without real
> keys — but replace both Razorpay values before this is exposed to anyone.

## Notes on backend behaviour
- **Tickets need the bearer token.** `GET /events/registration/:id/ticket`
  returns a full HTML document and reads `req.user`, so it can't just be opened
  in a new tab. It's fetched with the auth header and rendered into a sandboxed
  iframe.
- **Rosters are CSV-only.** There is no JSON roster endpoint, so the admin
  roster view fetches the CSV export and parses it client-side.
- **No `/auth/me`.** The session is rehydrated from `localStorage` and the JWT's
  `exp` claim is checked on boot. Any 401 clears the session.
- **Register returns no token**, so signup calls login immediately after.

### Backend additions

All additive; no existing behaviour changed.

0. `POST /api/payments/verify` (`src/routes/payments.router.ts`) — verifies a
   Razorpay Checkout callback signature and completes the registration. The
   existing webhook cannot reach `localhost`, so without this a paid
   registration can never leave `PENDING` in development.

1. `GET /api/events/me/registrations` (`src/routes/events.router.ts`) — returns
   the caller's own registrations with their events. Without it there is no way
   to list your tickets: the ticket route needs a registration id you'd have no
   way to discover, and the roster export is admin-only.
2. `POST /api/auth/login` now also returns `emergency_contact`, `strava_id` and
   `created_at` (`src/routes/auth.router.ts`). Without these the client can't
   tell whether Strava is linked, can't prefill the emergency contact on the
   registration form, and shows a "Link Strava" CTA to already-linked members.
3. The Strava leaderboard's hardcoded `club_name` is now `"B Squared Run Club"`
   (`src/routes/strava.router.ts`) — it was `"Run With Cadence Local Guild"`, and
   the frontend renders it verbatim as the leaderboard eyebrow.
4. `GET /api/admin/members` (`src/routes/admin.router.ts`) — the club directory.
   No endpoint listed users at all, so an organiser had no way to find someone.
   Selects explicit fields; `password_hash` is never returned.
5. `PUT /api/admin/members/:id/role` (`src/routes/admin.router.ts`) — the
   promotion itself. Nothing could change a role before this. See
   *Roles & promotion* above for the guard rails.

## Accessibility

Semantic landmarks and headings, labelled form fields, `aria-live` toasts,
`aria-checked` waiver control, focus-visible gold outlines, keyboard-dismissable
modals, a table view for every chart, and `prefers-reduced-motion` honoured
globally.
