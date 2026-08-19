import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, session, tokenExpired, UNAUTHORIZED_EVENT } from "./api";
import type { Role, User } from "./types";

interface AuthValue {
  user: User | null;
  /** "VISITOR" when signed out — matches the backend's role fallback. */
  role: Role;
  isAdmin: boolean;
  /** Can register for events: the backend allows MEMBER and VOLUNTEER only. */
  canRegister: boolean;
  /**
   * Signed in as part of the club (MEMBER, VOLUNTEER or ADMIN) — the set the
   * backend accepts for posting, commenting and voting. Gates the forum and
   * poll voting; VISITOR and signed-out users are excluded.
   */
  isClubMember: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (input: {
    email: string;
    password: string;
    name: string;
    role?: string;
    emergency_contact?: string;
  }) => Promise<User>;
  logout: () => void;
  patchUser: (patch: Partial<User>) => void;
  /** Re-reads the account from the server and replaces the cached copy. */
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Restore the session on boot, then revalidate against the server.
   *
   * Storage is read first so there is no signed-out flash on every reload, but the
   * stored copy is a snapshot from sign-in and drifts: an organiser promoting
   * someone to volunteer, or a detail edited on another device, would not show up
   * until the 24h token expired. The /me round-trip reconciles it.
   *
   * A failed refresh is deliberately non-fatal — with the backend down, the app
   * still runs on the cached user rather than logging everyone out. A genuinely
   * dead token comes back 401, which the listener below already handles.
   */
  useEffect(() => {
    const token = session.token();
    const stored = session.user();

    if (!token || tokenExpired(token)) {
      if (token) session.clear();
      setReady(true);
      return;
    }

    if (stored) setUser(stored);
    setReady(true);

    let cancelled = false;
    api
      .me()
      .then((res) => {
        if (cancelled) return;
        session.save(token, res.user);
        setUser(res.user);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);

  // A 401 anywhere means the token is dead; drop the session.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    session.save(res.token, res.user);
    setUser(res.user);
    return res.user;
  }, []);

  // Register does not return a token, so sign in straight after to get one.
  const signup = useCallback<AuthValue["signup"]>(
    async (input) => {
      await api.register(input);
      return login(input.email, input.password);
    },
    [login],
  );

  const patchUser = useCallback((patch: Partial<User>) => {
    session.patchUser(patch);
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const refreshUser = useCallback(async () => {
    const token = session.token();
    if (!token) return null;
    try {
      const res = await api.me();
      session.save(token, res.user);
      setUser(res.user);
      return res.user;
    } catch {
      // Leave the cached user in place; a dead token is handled by the 401 listener.
      return null;
    }
  }, []);

  const value = useMemo<AuthValue>(() => {
    const role: Role = user?.role ?? "VISITOR";
    return {
      user,
      role,
      isAdmin: role === "ADMIN",
      canRegister: role === "MEMBER" || role === "VOLUNTEER",
      isClubMember: role === "MEMBER" || role === "VOLUNTEER" || role === "ADMIN",
      ready,
      login,
      signup,
      logout,
      patchUser,
      refreshUser,
    };
  }, [user, ready, login, signup, logout, patchUser, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
