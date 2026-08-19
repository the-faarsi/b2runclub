import type {
  AssignableRole,
  CheckInResult,
  Checkpoint,
  ClubEvent,
  ClubInfo,
  Collaborator,
  CollaboratorTier,
  Comment,
  EventRegistrationRow,
  EventResults,
  EventStatus,
  FeedbackSummary,
  FinancialOverview,
  HealthImportResult,
  HealthSummary,
  Leaderboard,
  MailerConfig,
  MailerStatus,
  Member,
  MyFeedback,
  MyResults,
  Notification,
  Photo,
  Poll,
  PollAnalytics,
  Post,
  RaceDayDashboard,
  Registration,
  ReminderSchedule,
  ResultStatus,
  Role,
  RosterRow,
  RouteGeometry,
  RouteSummary,
  Shift,
  StravaActivity,
  StravaConfig,
  StravaLink,
  StreakSummary,
  SweepResult,
  User,
} from "./types";

/** Empty in dev — Vite proxies /api and /health to the Express backend. */
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const TOKEN_KEY = "cadence.token";
const USER_KEY = "cadence.user";

/** Broadcast so AuthProvider can tear down the session on a rejected token. */
export const UNAUTHORIZED_EVENT = "cadence:unauthorized";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: (): User | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },
  save(token: string, user: User) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  patchUser(patch: Partial<User>) {
    const current = session.user();
    if (!current) return;
    localStorage.setItem(USER_KEY, JSON.stringify({ ...current, ...patch }));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

/** `exp` is seconds since epoch. Treated as expired if unreadable. */
export function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  /** Send the bearer token if we have one. Default true. */
  auth?: boolean;
  /** "json" | "text" — the ticket route returns HTML, roster export returns CSV. */
  as?: "json" | "text";
};

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true, as = "json" } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = session.token();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    // The backend rejects a bad token on every route, public ones included.
    session.clear();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (as === "text") return (await res.text()) as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Multipart sibling of `request`. Content-Type is deliberately not set — the
 * browser has to add it along with the multipart boundary.
 */
async function upload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: form });

  if (res.status === 401) {
    session.clear();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/* ── auth ─────────────────────────────────────────────────── */

export const api = {
  login: (email: string, password: string) =>
    request<{ message: string; token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),

  register: (input: {
    email: string;
    password: string;
    name: string;
    role?: string;
    emergency_contact?: string;
  }) =>
    request<{ message: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: input,
      auth: false,
    }),

  /* ── your own account ───────────────────────────────────── */

  /**
   * Authoritative read of the signed-in account. The JWT carries a snapshot from
   * sign-in, so it goes stale as soon as a detail changes or an organiser changes
   * your role — prefer this over `session.user()` on the profile page.
   */
  me: () => request<{ user: User }>("/api/auth/me"),

  /** Details with no security weight. Role is deliberately not accepted. */
  updateProfile: (input: { name?: string; emergency_contact?: string }) =>
    request<{ message: string; user: User }>("/api/auth/me", {
      method: "PATCH",
      body: input,
    }),

  /** Email is the login identity, so the current password is required. */
  changeEmail: (input: { email: string; current_password: string }) =>
    request<{ message: string; user: User; changed: boolean }>("/api/auth/me/email", {
      method: "PATCH",
      body: input,
    }),

  changePassword: (input: { current_password: string; password: string }) =>
    request<{ message: string }>("/api/auth/me/password", {
      method: "POST",
      body: input,
    }),

  /**
   * Start a password reset. The backend answers identically whether or not the
   * address exists, so the UI must not branch on the response — doing so would
   * hand an attacker an account-enumeration oracle.
   */
  forgotPassword: (email: string) =>
    request<{ message: string; reset_link?: string; simulated?: boolean }>(
      "/api/auth/forgot-password",
      { method: "POST", body: { email }, auth: false },
    ),

  /** Checks a reset token before showing the form, so a dead link says so. */
  checkResetToken: (token: string) =>
    request<{ valid: boolean; email?: string }>(
      `/api/auth/reset-password/${encodeURIComponent(token)}`,
      { auth: false },
    ),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: { token, password },
      auth: false,
    }),

  /* ── events ─────────────────────────────────────────────── */

  events: () => request<ClubEvent[]>("/api/events"),

  event: (id: string) => request<ClubEvent>(`/api/events/${id}`),

  createEvent: (input: {
    title: string;
    type: string;
    date_time: string;
    location: string;
    price: number;
    status: EventStatus;
    description?: string | null;
    /** Null or omitted means unlimited places. */
    capacity?: number | null;
    /** Hours-before offsets to email registrants at. */
    reminder_offsets?: number[];
  }) =>
    request<{ message: string; event: ClubEvent }>("/api/events", {
      method: "POST",
      body: input,
    }),

  updateEvent: (
    id: string,
    input: Partial<Omit<ClubEvent, "id" | "admin_id">> & { reminder_offsets?: number[] },
  ) =>
    request<{ message: string; event: ClubEvent }>(`/api/events/${id}`, {
      method: "PUT",
      body: input,
    }),

  deleteEvent: (id: string) =>
    request<{ message: string }>(`/api/events/${id}`, { method: "DELETE" }),

  registerForEvent: (id: string, input: { waiver_signed: boolean; emergency_contact?: string }) =>
    request<{
      message: string;
      registration: Registration;
      razorpay_key_id: string;
      amount: number;
    }>(`/api/events/${id}/register`, { method: "POST", body: input }),

  myRegistrations: () => request<Registration[]>("/api/events/me/registrations"),

  /**
   * Give up a spot. Members may cancel their own PENDING/FREE registrations;
   * a PAID entry needs an organiser because it implies a refund.
   */
  cancelRegistration: (registrationId: string) =>
    request<{ message: string; event_id: string; refund_due: boolean }>(
      `/api/events/registration/${registrationId}`,
      { method: "DELETE" },
    ),

  /** Whether real Checkout is available, or only the dev simulation. */
  paymentConfig: () =>
    request<{ mock_mode: boolean; key_id: string | null; simulation_available: boolean }>(
      "/api/payments/config",
    ),

  /**
   * Development-only settlement for a mock order. The backend refuses this
   * outright once real Razorpay keys are configured, and in production.
   */
  simulatePayment: (registrationId: string) =>
    request<{ message: string; registration: Registration; simulated?: boolean }>(
      "/api/payments/simulate",
      { method: "POST", body: { registration_id: registrationId } },
    ),

  /**
   * Mint a fresh Razorpay order for a PENDING registration whose existing order
   * can't be paid — typically an `order_mock_…` id created before real Razorpay
   * keys were configured. Preserves the registration rather than redoing it.
   */
  refreshPaymentOrder: (registrationId: string) =>
    request<{
      message: string;
      registration: Registration;
      razorpay_order_id: string;
      previous_order_id: string | null;
      razorpay_key_id: string;
      amount: number;
    }>(`/api/payments/order/${registrationId}/refresh`, { method: "POST" }),

  /** Hands a Checkout callback to the backend, which verifies the signature. */
  verifyPayment: (input: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    request<{ message: string; registration: Registration }>("/api/payments/verify", {
      method: "POST",
      body: input,
    }),

  /** Returns a full HTML document; rendered into a sandboxed iframe. */
  ticketHtml: (registrationId: string) =>
    request<string>(`/api/events/registration/${registrationId}/ticket`, { as: "text" }),

  /* ── forum ──────────────────────────────────────────────── */

  posts: () => request<Post[]>("/api/forum/posts"),

  createPost: (input: { title: string; content: string; is_announcement?: boolean }) =>
    request<{ message: string; post: Post }>("/api/forum/posts", {
      method: "POST",
      body: input,
    }),

  addComment: (postId: string, content: string) =>
    request<{ message: string; comment: Comment }>(`/api/forum/posts/${postId}/comments`, {
      method: "POST",
      body: { content },
    }),

  /** Authors may remove their own; admins may remove anyone's. */
  deletePost: (id: string) =>
    request<{ message: string }>(`/api/forum/posts/${id}`, { method: "DELETE" }),

  deleteComment: (id: string) =>
    request<{ message: string }>(`/api/forum/comments/${id}`, { method: "DELETE" }),

  notifications: () => request<Notification[]>("/api/forum/notifications"),

  markNotificationRead: (id: string) =>
    request<{ message: string; notification: Notification }>(
      `/api/forum/notifications/${id}/read`,
      { method: "PUT" },
    ),

  /* ── polls ──────────────────────────────────────────────── */

  polls: () => request<Poll[]>("/api/polls"),

  createPoll: (input: { title: string; options: string[] }) =>
    request<{ message: string }>("/api/polls", { method: "POST", body: input }),

  vote: (pollId: string, optionId: string) =>
    request<{ message: string }>(`/api/polls/${pollId}/vote`, {
      method: "POST",
      body: { option_id: optionId },
    }),

  /** Close a poll to freeze the result, or reopen it. Admin only. */
  setPollActive: (pollId: string, active: boolean) =>
    request<{ message: string; poll: Poll; changed: boolean }>(`/api/polls/${pollId}/active`, {
      method: "PUT",
      body: { active },
    }),

  /* ── strava ─────────────────────────────────────────────── */

  leaderboard: () => request<Leaderboard>("/api/strava/leaderboard"),

  /** Whether OAuth is available on this server. */
  stravaConfig: () => request<StravaConfig>("/api/strava/config"),

  /** The signed-in member's Strava connection, if any. */
  stravaLink: () => request<StravaLink>("/api/strava/me"),

  /**
   * Returns the Strava consent URL for the caller to navigate to. Deliberately not
   * a redirect — a 302 answered to `fetch` would be followed by fetch, and the
   * browser would never leave the page.
   */
  stravaAuthorizeUrl: () => request<{ url: string }>("/api/strava/authorize"),

  stravaActivities: (perPage = 15) =>
    request<{ count: number; activities: StravaActivity[] }>(
      `/api/strava/activities?per_page=${perPage}`,
    ),

  disconnectStrava: () =>
    request<{ message: string; changed: boolean }>("/api/strava/me", { method: "DELETE" }),

  /* ── gallery / about / collaborators ────────────────────── */

  /** Optionally narrowed to one event, for the photo strip on an event page. */
  gallery: (eventId?: string) =>
    request<Photo[]>(
      eventId ? `/api/content/gallery?event_id=${encodeURIComponent(eventId)}` : "/api/content/gallery",
    ),

  /**
   * Upload a photo. Takes a File (multipart) or an external URL.
   * Admins and volunteers only — the backend enforces it.
   */
  addPhoto: (input: { file?: File; url?: string; caption?: string; event_id?: string }) => {
    const form = new FormData();
    if (input.file) form.append("image", input.file);
    if (input.url) form.append("url", input.url);
    if (input.caption) form.append("caption", input.caption);
    if (input.event_id) form.append("event_id", input.event_id);
    return upload<{ message: string; photo: Photo }>("/api/content/gallery", form);
  },

  deletePhoto: (id: string) =>
    request<{ message: string }>(`/api/content/gallery/${id}`, { method: "DELETE" }),

  clubInfo: () => request<ClubInfo>("/api/content/club"),

  saveClubInfo: (input: Partial<Omit<ClubInfo, "id" | "updated_at">>) =>
    request<{ message: string; club: ClubInfo }>("/api/content/club", {
      method: "PUT",
      body: input,
    }),

  collaborators: () => request<Collaborator[]>("/api/content/collaborators"),

  addCollaborator: (input: {
    name: string;
    blurb?: string;
    website?: string;
    tier?: CollaboratorTier;
    sort_order?: number;
    logoFile?: File;
    logo_url?: string;
  }) => {
    const form = new FormData();
    form.append("name", input.name);
    if (input.blurb) form.append("blurb", input.blurb);
    if (input.website) form.append("website", input.website);
    if (input.tier) form.append("tier", input.tier);
    if (input.sort_order !== undefined) form.append("sort_order", String(input.sort_order));
    if (input.logoFile) form.append("logo", input.logoFile);
    if (input.logo_url) form.append("logo_url", input.logo_url);
    return upload<{ message: string; collaborator: Collaborator }>(
      "/api/content/collaborators",
      form,
    );
  },

  deleteCollaborator: (id: string) =>
    request<{ message: string }>(`/api/content/collaborators/${id}`, { method: "DELETE" }),

  /* ── admin ──────────────────────────────────────────────── */

  financialOverview: () => request<FinancialOverview>("/api/admin/financial-overview"),

  members: () => request<Member[]>("/api/admin/members"),

  /** Reminder schedule + delivery status for one event (admin). */
  eventReminders: (eventId: string) =>
    request<ReminderSchedule>(`/api/admin/events/${eventId}/reminders`),

  /** Runs the sweep now. Idempotent — already-sent reminders are skipped. */
  runReminders: (eventId: string) =>
    request<SweepResult>(`/api/admin/events/${eventId}/reminders/run`, { method: "POST" }),

  /** Whether SMTP is configured and reachable, plus which settings are present. */
  mailerStatus: () => request<MailerStatus>("/api/admin/mailer"),

  /**
   * Sends a real test email to the signed-in organiser's own address.
   * `mailerStatus` only proves the connection authenticates; this proves a message
   * is actually accepted by the relay.
   */
  sendTestEmail: () =>
    request<{
      message: string;
      sent: boolean;
      to: string;
      took_ms: number;
      config: MailerConfig;
    }>("/api/admin/mailer/test", { method: "POST" }),

  /** Interactive roster for one event (admin). The CSV export is for accounting. */
  eventRegistrations: (eventId: string) =>
    request<EventRegistrationRow[]>(`/api/admin/events/${eventId}/registrations`),

  /** Bar or readmit someone. Leaves their payment status untouched. */
  setRegistrationBlocked: (registrationId: string, blocked: boolean) =>
    request<{ message: string; changed: boolean }>(
      `/api/admin/registrations/${registrationId}/block`,
      { method: "PUT", body: { blocked } },
    ),

  /** Promote/demote a member. The backend refuses ADMIN and self-changes. */
  setMemberRole: (id: string, role: AssignableRole) =>
    request<{
      message: string;
      user: User;
      previous_role?: Role;
      changed: boolean;
    }>(`/api/admin/members/${id}/role`, { method: "PUT", body: { role } }),

  pollAnalytics: (pollId: string) =>
    request<PollAnalytics>(`/api/admin/polls/${pollId}/analytics`),

  /** The backend only exposes the roster as CSV, so parse it here. */
  async roster(eventId: string): Promise<RosterRow[]> {
    const csv = await request<string>(`/api/admin/events/${eventId}/roster/export`, {
      as: "text",
    });
    return parseRosterCsv(csv);
  },

  rosterCsv: (eventId: string) =>
    request<string>(`/api/admin/events/${eventId}/roster/export`, { as: "text" }),

  /**
   * Refund a paid entry (admin). The registration is kept with `refunded_at` set
   * rather than deleted, so the money movement stays auditable.
   * Omit `amount` for a full refund of the entry fee.
   */
  refundRegistration: (registrationId: string, amount?: number) =>
    request<{
      message: string;
      refund_id: string;
      amount: number;
      simulated: boolean;
      registration: Registration;
    }>(`/api/payments/refund/${registrationId}`, {
      method: "POST",
      body: amount === undefined ? {} : { amount },
    }),

  /* ── results ────────────────────────────────────────────── */

  /** Public results sheet. Positions are derived from finish times. */
  eventResults: (eventId: string) => request<EventResults>(`/api/results/events/${eventId}`),

  /** Record or amend one runner's result (admin). Upserts on (event, user). */
  saveResult: (
    eventId: string,
    input: {
      user_id: string;
      finish_secs?: number | null;
      distance_km?: number | null;
      status?: ResultStatus;
      notes?: string;
    },
  ) =>
    request<{ message: string }>(`/api/results/events/${eventId}`, {
      method: "PUT",
      body: input,
    }),

  deleteResult: (resultId: string) =>
    request<{ message: string }>(`/api/results/${resultId}`, { method: "DELETE" }),

  myResults: () => request<MyResults>("/api/results/me"),

  /* ── post-event feedback ────────────────────────────────── */

  submitFeedback: (eventId: string, input: { rating: number; comment?: string }) =>
    request<{ message: string }>(`/api/results/feedback/${eventId}`, {
      method: "POST",
      body: input,
    }),

  myFeedback: (eventId: string) => request<MyFeedback>(`/api/results/feedback/me/${eventId}`),

  /** Aggregate ratings and comments for one event (admin). */
  feedbackSummary: (eventId: string) =>
    request<FeedbackSummary>(`/api/results/feedback/${eventId}`),

  /* ── streaks & badges ───────────────────────────────────── */

  myStreak: () => request<StreakSummary>("/api/results/streaks/me"),

  /* ── race day ───────────────────────────────────────────── */

  /**
   * Scan a ticket. Pass the decoded QR text as `qr_payload`, or a bare id as
   * `registration_id`. Send `event_id` so a ticket for another session is caught.
   */
  checkIn: (input: { registration_id?: string; qr_payload?: string; event_id?: string }) =>
    request<CheckInResult>("/api/raceday/check-in", { method: "POST", body: input }),

  undoCheckIn: (registrationId: string) =>
    request<{ message: string }>(`/api/raceday/check-in/${registrationId}/undo`, {
      method: "POST",
    }),

  /** Everything the event-day screen needs, in one pollable request. */
  raceDayDashboard: (eventId: string) =>
    request<RaceDayDashboard>(`/api/raceday/events/${eventId}/dashboard`),

  shifts: (eventId: string) => request<Shift[]>(`/api/raceday/events/${eventId}/shifts`),

  createShift: (
    eventId: string,
    input: { title: string; location_note?: string; capacity?: number; sort_order?: number },
  ) =>
    request<{ message: string; shift: Shift }>(`/api/raceday/events/${eventId}/shifts`, {
      method: "POST",
      body: input,
    }),

  deleteShift: (shiftId: string) =>
    request<{ message: string }>(`/api/raceday/shifts/${shiftId}`, { method: "DELETE" }),

  /** Omit `userId` to take the shift yourself; admins may pass anyone's id. */
  claimShift: (shiftId: string, userId?: string) =>
    request<{ message: string; changed: boolean }>(`/api/raceday/shifts/${shiftId}/claim`, {
      method: "POST",
      body: userId ? { user_id: userId } : {},
    }),

  releaseShift: (shiftId: string, userId?: string) =>
    request<{ message: string; changed: boolean }>(`/api/raceday/shifts/${shiftId}/release`, {
      method: "POST",
      body: userId ? { user_id: userId } : {},
    }),

  checkpoints: (eventId: string) =>
    request<Checkpoint[]>(`/api/raceday/events/${eventId}/checkpoints`),

  createCheckpoint: (
    eventId: string,
    input: { name: string; distance_km?: number | null; sort_order?: number },
  ) =>
    request<{ message: string; checkpoint: Checkpoint }>(
      `/api/raceday/events/${eventId}/checkpoints`,
      { method: "POST", body: input },
    ),

  deleteCheckpoint: (id: string) =>
    request<{ message: string }>(`/api/raceday/checkpoints/${id}`, { method: "DELETE" }),

  /** Tap a runner through. Idempotent per (checkpoint, runner). */
  passCheckpoint: (checkpointId: string, userId: string) =>
    request<{ message: string; changed: boolean }>(
      `/api/raceday/checkpoints/${checkpointId}/pass`,
      { method: "POST", body: { user_id: userId } },
    ),

  /* ── route map ──────────────────────────────────────────── */

  /** Normalised track geometry for the SVG renderer. 404s when none attached. */
  eventRoute: (eventId: string) =>
    request<RouteGeometry>(`/api/content/events/${eventId}/route`),

  uploadRoute: (eventId: string, file: File) => {
    const form = new FormData();
    form.append("gpx", file);
    return upload<RouteSummary>(`/api/content/events/${eventId}/route`, form);
  },

  /* ── health app sync ────────────────────────────────────── */

  /**
   * Import workouts from an Apple Health `export.xml` or a single `.gpx`.
   *
   * A file import rather than a background sync because HealthKit and Health
   * Connect are both on-device APIs with no server endpoint — see the backend
   * router for the full reasoning.
   */
  importHealth: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<HealthImportResult>("/api/health/import", form);
  },

  myHealth: () => request<HealthSummary>("/api/health/me"),

  deleteWorkout: (id: string) =>
    request<{ message: string }>(`/api/health/${id}`, { method: "DELETE" }),

  /** Wipes every workout this member has imported. */
  clearHealth: () =>
    request<{ message: string; count: number }>("/api/health", { method: "DELETE" }),
};

/** Minimal RFC-4180 field splitter — the roster export quotes name/email. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export function parseRosterCsv(csv: string): RosterRow[] {
  const lines = csv.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(1).map((line) => {
    const c = splitCsvLine(line);
    return {
      registration_id: c[0] ?? "",
      name: c[1] ?? "",
      email: c[2] ?? "",
      role_at_event: c[3] ?? "",
      waiver_signed: c[4] ?? "",
      status: (c[5] ?? "PENDING") as RosterRow["status"],
      payment_id: c[6] ?? "N/A",
    };
  });
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
