import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, SESSION_EXPIRED_EVENT, MANAGEMENT_HOME_ROUTE, type SessionUser, type PlanType, type ManagementRole, type UserRole } from "./api";
import { registerPushUser } from "./push";

// Push notifications (lib/push.ts) are Management-only for now, same
// scope as lib/notifications.ts's notifyManagement() on the backend -
// a CPO or Owner (admin) session never registers for push.
const MANAGEMENT_ROLES: UserRole[] = ["manager", "finance", "human_resources", "operations"];

// How long the post-login auto-preview attempt below may take before
// giving up - a hung request here must never block the Owner from
// reaching the Master Console at all.
const AUTO_PREVIEW_TIMEOUT_MS = 8000;

// Per direct product direction ("I need it gone as soon as I am in the
// master console") - an Owner's very first landing on /owner should
// already be previewing the designated Test Company, not require a
// separate manual click or a visit to /quick-access first. Scoped to
// the login moment only (awaited, best-effort, failures swallowed) -
// NOT a reactive effect watching isPreviewing elsewhere in the app,
// which would otherwise silently re-enter Preview the moment the Owner
// deliberately clicks "Exit Preview" on their next page load, making
// that button pointless. A failed/timed-out attempt here just leaves
// the Owner on a plain, non-previewing /owner, exactly like before this
// feature existed - the Master Console's own manual Preview button
// remains the fallback either way.
async function attemptAutoPreviewOnLogin(): Promise<void> {
  const companies = await api.companies.list();
  const testCompany = companies.find((c) => c.isInternal);
  if (!testCompany) return;
  await Promise.race([
    api.auth.enterPreview(testCompany.id),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("auto-preview timed out")), AUTO_PREVIEW_TIMEOUT_MS);
    }),
  ]);
}

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
        if (MANAGEMENT_ROLES.includes(user.role)) void registerPushUser(user.id);
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
    if (user.role === "admin" && !user.isPreviewing) {
      await attemptAutoPreviewOnLogin().catch(() => {});
    }
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
