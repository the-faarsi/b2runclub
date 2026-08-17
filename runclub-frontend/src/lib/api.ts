import type {
  AssignableRole,
  ClubEvent,
  ClubInfo,
  Collaborator,
  CollaboratorTier,
  Comment,
  EventRegistrationRow,
  EventStatus,
  FinancialOverview,
  Leaderboard,
  Member,
  Notification,
  Photo,
  Poll,
  PollAnalytics,
  Post,
  Registration,
  Role,
  RosterRow,
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
  }) =>
    request<{ message: string; event: ClubEvent }>("/api/events", {
      method: "POST",
      body: input,
    }),

  updateEvent: (id: string, input: Partial<Omit<ClubEvent, "id" | "admin_id">>) =>
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

  /* ── strava ─────────────────────────────────────────────── */

  leaderboard: () => request<Leaderboard>("/api/strava/leaderboard"),

  linkStrava: (stravaId: string) =>
    request<{ message: string; user: User }>("/api/strava/link", {
      method: "POST",
      body: { strava_id: stravaId },
    }),

  /* ── gallery / about / collaborators ────────────────────── */

  gallery: () => request<Photo[]>("/api/content/gallery"),

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
