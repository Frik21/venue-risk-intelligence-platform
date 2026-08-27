import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, SESSION_EXPIRED_EVENT, MANAGEMENT_HOME_ROUTE, type SessionUser, type PlanType, type ManagementRole } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    planType?: PlanType;
    companyName?: string;
    officeCity?: string;
    officeCountry?: string;
    role?: ManagementRole;
    name: string;
    email: string;
    password: string;
    additionalManagerSeats?: number;
    additionalOperationsSeats?: number;
    additionalFinanceSeats?: number;
    additionalHumanResourcesSeats?: number;
    additionalCpoSeats?: number;
    stripeSetupIntentId?: string;
  }) => Promise<void>;
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
    // infer from "/") since "/" always shows the public landing page
    // now, for authenticated sessions too (see require-auth.tsx) -
    // redirecting there after login would just show marketing copy
    // instead of the app.
    const home = user.role === "cpo" ? "/cpo" : user.role === "admin" ? "/owner" : MANAGEMENT_HOME_ROUTE[user.role] ?? "/admin";
    window.location.href = user.mustChangePassword ? "/change-password" : home;
  };

  const register = async (data: {
    planType?: PlanType;
    companyName?: string;
    officeCity?: string;
    officeCountry?: string;
    role?: ManagementRole;
    name: string;
    email: string;
    password: string;
    additionalManagerSeats?: number;
    additionalOperationsSeats?: number;
    additionalFinanceSeats?: number;
    additionalHumanResourcesSeats?: number;
    additionalCpoSeats?: number;
  }) => {
    const { user, loggedIn } = await api.auth.register(data);
    // loggedIn is false when this was the Owner running the real signup
    // form from inside /owner (see routes/auth.ts's POST /auth/register)
    // - the company/user were created for real, but the Owner's own
    // session was left untouched, so send them back to /owner rather
    // than the new account's own home, which would otherwise look
    // broken (a companyId: null Owner session has nothing to show
    // there - see require-auth.tsx). Otherwise land on the new
    // account's real home - /cpo for Solo Operator, the matching
    // scoped dashboard for a Finance/HR/Operations Position
    // (MANAGEMENT_HOME_ROUTE), /admin for everything else - rather
    // than always /admin and relying on require-auth.tsx's redirect
    // to correct it after the fact.
    window.location.href = !loggedIn
      ? "/owner"
      : user.planType === "solo_operator"
        ? "/cpo"
        : MANAGEMENT_HOME_ROUTE[user.role] ?? "/admin";
  };

  const logout = async () => {
    await api.auth.logout();
    window.location.href = "/";
  };

  return <AuthContext.Provider value={{ user, status, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
