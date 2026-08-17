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
  strava_id?: string | null;
  created_at?: string;
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
  has_emergency_contact: boolean;
  strava_linked: boolean;
  registration_count: number;
}

/** Roles an organiser may assign — ADMIN is deliberately not grantable. */
export type AssignableRole = "MEMBER" | "VOLUNTEER" | "VISITOR";

export interface FinancialOverview {
  total_revenue: number;
  paid_count: number;
  pending_count: number;
  failed_count: number;
  volunteer_free_count: number;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  name: string;
  strava_id: string | null;
  weekly_distance_km: number;
  runs_count: number;
  moving_time_mins: number;
  avg_pace: string;
}

export interface Leaderboard {
  club_name: string;
  leaderboard: LeaderboardRow[];
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
  strava_club: string | null;
  updated_at: string | null;
}

export type CollaboratorTier = "PARTNER" | "SPONSOR" | "COMMUNITY";

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
