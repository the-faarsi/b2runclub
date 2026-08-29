import type { ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Footer, Navbar } from "./components/layout";
import { ScrollProgress } from "./components/motion";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import type { Role } from "./lib/types";

import { ForgotPassword, Login, ResetPassword, Signup } from "./pages/Auth";
import { AdminDashboard } from "./pages/admin/Dashboard";
import { ManageEvents } from "./pages/admin/ManageEvents";
import { ManageCollaborators } from "./pages/admin/ManageCollaborators";
import { ManageFounders } from "./pages/admin/ManageFounders";
import { DatabaseAdmin } from "./pages/admin/Database";
import { ManageMembers } from "./pages/admin/ManageMembers";
import { ManagePolls } from "./pages/admin/ManagePolls";
import { Calendar } from "./pages/Calendar";
import { About } from "./pages/About";
import { PrivacyPage, RefundPage, TermsPage, VolunteerTermsPage } from "./pages/Policy";
import { EventDetail } from "./pages/EventDetail";
import { Gallery } from "./pages/Gallery";
import { Events } from "./pages/Events";
import { Forum } from "./pages/Forum";
import { Landing } from "./pages/Landing";
import { Leaderboard } from "./pages/Leaderboard";
import { MyTickets } from "./pages/MyTickets";
import { NotFound } from "./pages/NotFound";
import { Polls } from "./pages/Polls";
import { Profile } from "./pages/Profile";
import { RaceDay } from "./pages/RaceDay";

/** Chrome-wrapped routes. */
function Shell() {
  return (
    /*
     * overflow-x-clip at the shell, not on individual sections.
     *
     * Several decorative layers deliberately bleed sideways — the hero's 3D
     * graphic, PageScene backdrops, the creators' glow — and any of them can
     * widen the document and produce a horizontal scrollbar. Clipping each
     * section was worse than the scrollbar: it cut the hero model off at the
     * 1280px container edge, which on a wide screen is nowhere near the edge of
     * the picture. Clipping here means nothing is trimmed until it actually
     * leaves the viewport.
     *
     * `clip` rather than `hidden` on purpose: `hidden` on one axis makes the
     * other axis a scroll container, which would break the sticky navbar.
     */
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <ScrollProgress />
      <Navbar />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

function Booting() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="size-6 text-ink-3" />
    </div>
  );
}

/** Gate a route on being signed in, and optionally on role. */
function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready, role } = useAuth();
  const location = useLocation();

  if (!ready) return <Booting />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(role)) return <Navigate to="/events" replace />;
  return <>{children}</>;
}

export default function App() {
  const { ready } = useAuth();
  if (!ready) return <Booting />;

  return (
    <Routes>
      {/* Bare pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      {/* Both are reachable while signed out — that is the whole point. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Chrome pages */}
      <Route element={<Shell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/polls" element={<Polls />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        {/* Gallery is view-only for members and visitors; posting is gated in the page. */}
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/about" element={<About />} />

        {/* Policies are public: someone deciding whether to join needs to read
            the terms and the refund rules before they have an account. */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refunds" element={<RefundPage />} />

        {/* Volunteer terms are for marshals. Admins can see it too — they are
            the ones who brief volunteers on it. */}
        <Route
          path="/volunteer-terms"
          element={
            <Guard roles={["VOLUNTEER", "ADMIN"]}>
              <VolunteerTermsPage />
            </Guard>
          }
        />

        {/* Forum is club-only: VISITOR and signed-out users are turned away. */}
        <Route
          path="/forum"
          element={
            <Guard roles={["MEMBER", "VOLUNTEER", "ADMIN"]}>
              <Forum />
            </Guard>
          }
        />

        <Route
          path="/tickets"
          element={
            <Guard roles={["MEMBER", "VOLUNTEER", "ADMIN"]}>
              <MyTickets />
            </Guard>
          }
        />
        <Route
          path="/profile"
          element={
            <Guard>
              <Profile />
            </Guard>
          }
        />

        {/* Event-day console. Volunteers are the ones actually scanning at the
            start line, so they get in alongside organisers. */}
        <Route
          path="/raceday/:id"
          element={
            <Guard roles={["ADMIN", "VOLUNTEER"]}>
              <RaceDay />
            </Guard>
          }
        />

        <Route
          path="/admin"
          element={
            <Guard roles={["ADMIN"]}>
              <AdminDashboard />
            </Guard>
          }
        />
        <Route
          path="/admin/events"
          element={
            <Guard roles={["ADMIN"]}>
              <ManageEvents />
            </Guard>
          }
        />
        <Route
          path="/admin/polls"
          element={
            <Guard roles={["ADMIN"]}>
              <ManagePolls />
            </Guard>
          }
        />
        <Route
          path="/admin/collaborators"
          element={
            <Guard roles={["ADMIN"]}>
              <ManageCollaborators />
            </Guard>
          }
        />
        <Route
          path="/admin/founders"
          element={
            <Guard roles={["ADMIN"]}>
              <ManageFounders />
            </Guard>
          }
        />
        <Route
          path="/admin/members"
          element={
            <Guard roles={["ADMIN"]}>
              <ManageMembers />
            </Guard>
          }
        />

        {/* Direct database access. Admin-only here and independently on the API. */}
        <Route
          path="/admin/database"
          element={
            <Guard roles={["ADMIN"]}>
              <DatabaseAdmin />
            </Guard>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
