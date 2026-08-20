import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, SESSION_EXPIRED_EVENT, type SessionUser } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    api.auth
      .me()
      .then(({ user }) => {
        setUser(user);
        setStatus("authenticated");
      })
      .catch(() => setStatus("unauthenticated"));
  }, []);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      setStatus("unauthenticated");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const login = async (email: string, password: string) => {
    const { user } = await api.auth.login(email, password);
    // Full reload rather than just setting state - no react-query cache
    // in this app is keyed by user/company today, so a same-session
    // login-as-someone-else could otherwise serve stale, wrong-tenant
    // data from an in-memory cache built under the previous session.
    // Destination is decided right here (not left to RequireAuth to
    // infer from "/") so "/" itself stays a reachable manual nav aid
    // afterward instead of becoming an unreachable redirect trap.
    const home = user.role === "cpo" ? "/cpo" : user.role === "admin" ? "/owner" : "/admin";
    window.location.href = user.mustChangePassword ? "/change-password" : home;
  };

  const logout = async () => {
    await api.auth.logout();
    window.location.href = "/";
  };

  return <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
