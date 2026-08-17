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
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // Restore the session once on boot. There is no /me endpoint, so the user
  // object is rehydrated from storage and the token checked for expiry.
  useEffect(() => {
    const token = session.token();
    const stored = session.user();
    if (token && stored && !tokenExpired(token)) {
      setUser(stored);
    } else if (token) {
      session.clear();
    }
    setReady(true);
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
    };
  }, [user, ready, login, signup, logout, patchUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
