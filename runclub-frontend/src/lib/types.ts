/** Mirrors runclub-backend/prisma/schema.prisma. The backend uses string
 *  literals rather than enums, so these are string unions. */

export type Role = "ADMIN" | "MEMBER" | "VOLUNTEER" | "VISITOR";
export type EventStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "FREE";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  emergency_contact?: string | null;
  created_at?: string;
  /**
   * The member's own number, E.164. Not the emergency contact.
   *
   * Collected and required at signup, but never verified — the club has no way
   * to send a code to it. Nothing in the app claims otherwise.
   */
  phone?: string | null;
  email_verified?: boolean;
  /**
   * Whether the registration gate will actually refuse this member.
   *
   * Not simply `!email_verified`: with no mailer configured nothing is
   * withheld, because the member could never receive the code. Computed
   * server-side so the client cannot refuse somebody the server would allow.
   */
  verification_required?: boolean;
}

/** Reply from /api/auth/verify/status. */
export interface VerificationStatus {
  email: string;
  email_verified: boolean;
  pending: boolean;
  code_length: number;
  expires_in_minutes: number;
  /** A code already in flight, so a reload shows the box rather than the button. */
  outstanding: OutstandingCode | null;
  /** Whether the club has mail credentials at all. */
  delivery: { email: boolean };
}

export interface OutstandingCode {
  /** Masked, e.g. "+91 ••••• 43219". */
  sent_to: string;
  expires_at: string;
  attempts_left: number;
}

export interface ClubEvent {
  id: string;
  title: string;
  type: string;
  date_time: string;
  location: string;
  price: number;
  status: EventStatus;
  admin_id: string;
  /** Organiser's brief for the event. Null when none was written. */
  description?: string | null;
  /** Maximum participants. Null means no limit. */
  capacity?: number | null;
  /** Cover image used as the event's backdrop. Null when none was set. */
  cover_url?: string | null;
  /**
   * Participant places used. Null on an uncapped event.
   *
   * Counts *people*, not bookings — a party of three uses three. A volunteer's
   * own place is exempt; the people they bring are not.
   */
  taken?: number | null;
  spots_left?: number | null;
  full?: boolean;
  /** Whether children may be brought to this session. */
  kids_allowed?: boolean;
  /** Entry per child. Null means the organiser has not set one. */
  kid_price?: number | null;
  /**
   * Most people one booking may cover, the member included.
   *
   * Comes from the server rather than a constant here, so the form and the rule
   * that enforces it cannot hold different numbers.
   */
  max_party_size?: number;
  /**
   * Rupees off a booking that covers more than one person, set per event by an
   * organiser. Taken off the whole total once — not per head. Null or 0 means
   * no group discount on this session.
   */
  party_discount?: number | null;
  /** Smallest party that earns the discount. From the server, for the reason above. */
  discount_min_party?: number;
}

export interface Registration {
  id: string;
  event_id: string;
  user_id: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  status: PaymentStatus;
  role_at_event: string;
  waiver_signed: boolean;
  /** Set when an organiser has barred this person from the event. */
  blocked_at?: string | null;
  event?: ClubEvent;
  /** What this booking was charged, in paise. Never recomputed from the event. */
  amount_due_paise?: number;
  /** Everyone the booking covers, the member included. */
  guests?: RegistrationGuest[];
}

/** One named person on a booking. */
export interface RegistrationGuest {
  id: string;
  registration_id: string;
  name: string;
  kind: "ADULT" | "KID";
  /** The member who made the booking. Cannot be removed from their own party. */
  is_booker: boolean;
  /** Set once they have been admitted at the start line. */
  admitted_at?: string | null;
  admitted_by?: string | null;
}

/** A guest as the client sends it — the booker is added by the server. */
export interface GuestDraft {
  name: string;
  kind: "ADULT" | "KID";
}

/** A row of the admin JSON roster for one event. */
export interface EventRegistrationRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  club_role: Role;
  role_at_event: string;
  status: PaymentStatus;
  waiver_signed: boolean;
  payment_id: string | null;
  blocked_at: string | null;
  /** Set when the ticket was scanned at the start line. */
  attended_at: string | null;
  refund_id: string | null;
  refunded_at: string | null;
  refund_amount: number | null;
  /**
   * Everyone this one booking covers, booker first. A member booking for their
   * family is a single row here, so the party is what says how many places it
   * holds and who has been admitted.
   */
  guests?: PartyMember[];
  party_size?: number;
  /** What was actually charged for the whole party, in paise. */
  amount_due_paise?: number;
}

export interface Author {
  id: string;
  name: string;
  role: Role;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: Author;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  is_announcement: boolean;
  created_at: string;
  author_id: string;
  author: Author;
  comments: Comment[];
}

export interface PollOption {
  id: string;
  option_text: string;
  vote_count: number;
}

/** Shape returned by GET /api/polls (already flattened by the backend). */
export interface Poll {
  id: string;
  title: string;
  active: boolean;
  has_voted: boolean;
  user_voted_option_id: string | null;
  options: PollOption[];
}

export interface PollAnalytics {
  poll_id: string;
  title: string;
  active: boolean;
  total_votes: number;
  options_analytics: {
    option_id: string;
    option_text: string;
    vote_count: number;
    percentage: number;
  }[];
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

/** A row of the admin member directory. Never carries a password hash. */
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
  /** The actual number — organisers need it on event day. Admin-only route. */
  emergency_contact: string | null;
  has_emergency_contact: boolean;
  registration_count: number;
  /** Full history for the directory's detail view. */
  activity: MemberActivity;
}

/**
 * A person's history with the club, as an organiser needs to see it.
 *
 * Deliberately excludes imported health workouts — members are told organisers
 * never see those.
 */
export interface MemberActivity {
  registrations: number;
  attended: number;
  /** Ticket-ready entries they didn't turn up for. */
  no_shows: number;
  /** Percentage, or null when they've never had an attendable entry. */
  attendance_rate: number | null;
  paid_count: number;
  pending_count: number;
  comped_count: number;
  refunded_count: number;
  blocked_count: number;
  /** Registrations taken as a volunteer. */
  marshalled_count: number;
  /** Marshal posts claimed on the race-day console. */
  shifts_claimed: number;
  results_finished: number;
  total_paid: number;
  total_refunded: number;
  last_event: { title: string; date_time: string; attended: boolean } | null;
}

/** Roles an organiser may assign — ADMIN is deliberately not grantable. */
export type AssignableRole = "MEMBER" | "VOLUNTEER" | "VISITOR";

export interface FinancialOverview {
  total_revenue: number;
  paid_count: number;
  pending_count: number;
  failed_count: number;
  volunteer_free_count: number;
  /**
   * People, not bookings. One registration admits up to six of them, so this
   * is the figure the club plans around and it can be far higher than
   * `paid_count + volunteer_free_count`. Excludes blocked bookings.
   */
  people_count: number;
  /** Of those, how many can be scanned at the start line today. */
  people_ticket_ready: number;
}

/** One row of the admin CSV roster export, parsed client-side. */
export interface RosterRow {
  registration_id: string;
  name: string;
  email: string;
  role_at_event: string;
  waiver_signed: string;
  status: PaymentStatus;
  payment_id: string;
}

/* ── Gallery, About and Collaborators ───────────────────────── */

export interface Photo {
  id: string;
  /** Either a served /uploads/... path or an external URL. */
  url: string;
  caption: string | null;
  event_id: string | null;
  /** Title of the tagged event, so the gallery filter can label itself. */
  event_title: string | null;
  created_at: string;
  uploader: Author;
}

export interface ClubInfo {
  id: string;
  headline: string;
  about: string;
  mission: string;
  founded: string | null;
  home_base: string | null;
  contact_email: string | null;
  instagram: string | null;
  /** The club's Strava link, shown in the contact section. A full URL. */
  strava_url: string | null;
  /** Invite URL for the club's WhatsApp community, or null if not set. */
  whatsapp: string | null;
  /** Looping hero video for the home page. Null falls back to the 3D scene. */
  hero_video_url: string | null;
  updated_at: string | null;
}

/**
 * FEATURED is a placement rather than a rank: those rows are lifted out of the
 * home page scroller into their own block. See FeaturedPartners.
 */
export type CollaboratorTier = "PARTNER" | "SPONSOR" | "COMMUNITY" | "FEATURED";

/** A club founder, shown on the home page and editable by admins. */
export interface Founder {
  id: string;
  name: string;
  /** Free-text title, e.g. "Founder & Head Coach". Empty when unset. */
  role: string;
  bio: string;
  photo_url: string | null;
  /** Bare handle, no leading @ — the client builds the URL. */
  instagram: string | null;
  /** Full profile or share URL, or a bare athlete id. */
  strava: string | null;
  sort_order: number;
  created_at: string;
}

export interface Collaborator {
  id: string;
  name: string;
  /** The shout-out revealed on hover in the home page scroller. */
  blurb: string;
  logo_url: string | null;
  website: string | null;
  tier: CollaboratorTier;
  sort_order: number;
  created_at: string;
}

/* ── Event email reminders ──────────────────────────────────── */

/** Offsets an organiser may pick, in hours before the start. */
export const REMINDER_OFFSETS = [168, 72, 48, 24, 12, 4, 2, 1] as const;

export interface EventReminder {
  id: string;
  hours_before: number;
  due_at: string;
  /** "scheduled" = not yet due · "due" = window open · "sent" = already emailed. */
  state: "scheduled" | "due" | "sent";
  sent_count: number;
  failed_count: number;
}

export interface ReminderSchedule {
  allowed_offsets: number[];
  /** False when SMTP is unset — reminders are logged, not emailed. */
  mailer_configured: boolean;
  reminders: EventReminder[];
}

/* ── Email configuration ────────────────────────────────────── */

/**
 * Which mail settings the backend can see. Values are never sent for the
 * credentials — only whether they're present — so this is safe to display.
 */
export interface MailerConfig {
  configured: boolean;
  host: string | null;
  port: number;
  /** Implicit TLS on 465, STARTTLS otherwise. */
  secure: boolean;
  user_set: boolean;
  pass_set: boolean;
  from: string;
  app_url: string;
  /** Env var names that still need setting. */
  missing: string[];
}

export interface MailerStatus {
  configured: boolean;
  /** The SMTP handshake and login succeeded. */
  ok: boolean;
  /** True when there's no transport, so mail is logged instead of sent. */
  simulated: boolean;
  error: string | null;
  config: MailerConfig;
}

export interface SweepResult {
  message: string;
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
  simulated: boolean;
}

/* ── Results ────────────────────────────────────────────────── */

export type ResultStatus = "FINISHED" | "DNF" | "DNS";

export const RESULT_STATUSES: ResultStatus[] = ["FINISHED", "DNF", "DNS"];

/** One line of a published results sheet. `position` is null for DNF/DNS. */
export interface ResultRow {
  id: string;
  position: number | null;
  user_id: string;
  name: string;
  finish_secs: number | null;
  finish_time: string | null;
  distance_km: number | null;
  pace: string | null;
  /** Gap to the winner in seconds; 0 for the winner, null for non-finishers. */
  behind_secs: number | null;
  status: ResultStatus;
  notes: string | null;
}

export interface EventResults {
  event: { id: string; title: string; date_time: string };
  finisher_count: number;
  results: ResultRow[];
}

export interface MyResultRow {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  finish_secs: number | null;
  finish_time: string | null;
  distance_km: number | null;
  pace: string | null;
  status: ResultStatus;
}

export interface MyResults {
  results: MyResultRow[];
  totals: { events_finished: number; total_distance_km: number; total_secs: number };
}

/* ── Post-event feedback ────────────────────────────────────── */

export interface MyFeedback {
  submitted: boolean;
  rating: number | null;
  comment: string | null;
}

export interface FeedbackSummary {
  count: number;
  average: number | null;
  distribution: { score: number; count: number }[];
  responses: {
    id: string;
    name: string;
    rating: number;
    comment: string | null;
    created_at: string;
  }[];
}

/* ── Attendance streaks & badges ────────────────────────────── */

export interface StreakBadge {
  key: string;
  label: string;
  detail: string;
  earned: boolean;
}

export interface StreakSummary {
  attended_count: number;
  volunteered_count: number;
  current_streak_weeks: number;
  best_streak_weeks: number;
  last_attended: { at: string; title: string } | null;
  badges: StreakBadge[];
  earned_count: number;
}

/* ── Race day: check-in, shifts, checkpoints ────────────────── */

/**
 * A scan outcome. The backend answers 200 for an already-scanned ticket rather
 * than an error, so `already_checked_in` is the flag the scanner UI branches on.
 */
/** One person on a scanned booking, as the crew screens see them. */
export interface PartyMember {
  id: string;
  name: string;
  kind: "ADULT" | "KID";
  is_booker: boolean;
  admitted_at?: string | null;
}

export interface CheckInResult {
  message: string;
  already_checked_in: boolean;
  name: string;
  role_at_event?: string;
  attended_at: string;
  event_title: string;
  /**
   * Everyone the scanned QR admits, booker first.
   *
   * A party of one is admitted by the scan itself (`auto_admitted`), because
   * there is nothing to choose. A larger party admits nobody: the crew tick
   * people off as they arrive, so "booked for three, two turned up" stays a
   * fact about each person rather than about the booking.
   */
  party?: PartyMember[];
  admitted_count?: number;
  party_size?: number;
  auto_admitted?: boolean;
  registration_id?: string;
}

/** What the per-person admit/unadmit calls answer with. */
export interface PartyUpdateResult {
  message: string;
  registration_id: string;
  party: PartyMember[];
  admitted_count: number;
  party_size: number;
  already_admitted?: boolean;
}

export interface Shift {
  id: string;
  title: string;
  location_note: string | null;
  capacity: number;
  sort_order: number;
  assigned: { user_id: string; name: string; role?: Role }[];
  open_slots: number;
  /** True when the signed-in crew member is on this shift. */
  mine: boolean;
}

export interface Checkpoint {
  id: string;
  name: string;
  distance_km: number | null;
  sort_order: number;
  passed: number;
  splits: { user_id: string; name: string; recorded_at: string }[];
}

export interface RaceDayDashboard {
  event: {
    id: string;
    title: string;
    date_time: string;
    location: string;
    status: EventStatus;
  };
  /** Counted in people, not bookings — one QR can cover up to six of them. */
  turnout: {
    registered: number;
    expected: number;
    checked_in: number;
    awaiting_payment: number;
    blocked: number;
    no_show: number;
    /** How many bookings those people arrived on, i.e. how many QRs. */
    bookings: number;
    /** How many of those bookings cover more than one person. */
    parties: number;
  };
  recent_check_ins: {
    /** Null only for a booking made before parties existed. */
    guest_id: string | null;
    registration_id: string;
    /**
     * Checkpoint splits key on the user, so this is what a tap-through sends.
     * Null for a guest, who has no club account and so cannot hold a split.
     */
    user_id: string | null;
    name: string;
    kind: "ADULT" | "KID";
    is_booker: boolean;
    /** The member whose booking this person is on. */
    booked_by: string;
    role_at_event: string;
    attended_at: string;
  }[];
  not_yet_in: {
    guest_id: string | null;
    registration_id: string;
    user_id: string | null;
    name: string;
    kind: "ADULT" | "KID";
    is_booker: boolean;
    booked_by: string;
  }[];
  shifts: {
    id: string;
    title: string;
    location_note: string | null;
    capacity: number;
    assigned: { user_id: string; name: string }[];
    open_slots: number;
  }[];
  checkpoints: {
    id: string;
    name: string;
    distance_km: number | null;
    passed: number;
    last_at: string | null;
  }[];
}

/* ── Route map ──────────────────────────────────────────────── */

/**
 * Track geometry already normalised to a 0–1 box by the backend, so the client
 * draws an SVG path with no mapping library and no API key. Aspect ratio is
 * preserved, which is why x and y do not both span the full 0–1.
 */
export interface RouteGeometry {
  distance_km: number | null;
  elevation_m: number | null;
  point_count: number;
  points: { x: number; y: number }[];
  elevation_profile: {
    min: number;
    max: number;
    points: (number | null)[];
  } | null;
}

export interface RouteSummary {
  message: string;
  event: ClubEvent;
  summary: { distance_km: number; elevation_m: number; point_count: number };
}

/* ── Health app sync ────────────────────────────────────────── */

export interface HealthWorkout {
  id: string;
  /** "apple_health" or "gpx". */
  source: string;
  activity_type: string;
  started_at: string;
  duration_secs: number;
  distance_km: number | null;
  energy_kcal: number | null;
  device: string | null;
}

export interface HealthTotals {
  workouts: number;
  distance_km: number;
  moving_secs: number;
}

export interface HealthSummary {
  workouts: HealthWorkout[];
  total_count: number;
  last_7_days: HealthTotals;
  last_30_days: HealthTotals;
  all_time: HealthTotals;
  by_type: { activity_type: string; count: number; distance_km: number }[];
  last_synced: string | null;
}

export interface HealthImportResult {
  message: string;
  added: number;
  updated: number;
  parsed: number;
  seen: number;
  /** True when the export was larger than the parser's cap. */
  truncated: boolean;
  source: string;
}

/* ── Database browser (admin) ───────────────────────────────── */

export interface DbTableSummary {
  name: string;
  rows: number;
  columns: number;
  /** True when the table holds a credential column, redacted on read. */
  has_secrets: boolean;
}

export interface DbColumn {
  name: string;
  /** SQLite type: TEXT / INTEGER / REAL / BOOLEAN / DATETIME. */
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt: string | null;
  /** Never readable or writable through the panel. */
  secret: boolean;
}

export interface DbTablePage {
  table: string;
  primary_key: string | null;
  columns: DbColumn[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  dir: "asc" | "desc";
  rows: Record<string, unknown>[];
}
