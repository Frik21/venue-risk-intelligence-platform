import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { MANAGEMENT_HOME_ROUTE } from "@/lib/api";
import { ShieldAlert } from "lucide-react";
import LandingPage from "@/pages/landing";

// Wraps App.tsx's whole <Switch> (outside <Layout>, so /login itself
// renders full-bleed with no sidebar chrome). Redirects to /login when
// unauthenticated, to /change-password when the session must set a
// real password first, and gates /owner to the admin (Owner) role only
// - matching the backend's requireRole("admin") on /api/companies/*.
// The Preview-mode banner itself lives inside Layout's own header
// (components/layout.tsx), not here - it needs to render as normal
// in-flow content, not a separate sticky/fixed sibling stacked on top
// of Layout's own sticky sidebar/header, which caused rendering
// glitches (see that file's history for what went wrong).
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const [location] = useLocation();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <ShieldAlert className="w-8 h-8 text-blue-400 animate-pulse" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    // "/" is the one page a logged-out visitor actually sees - the
    // public marketing page (pages/landing.tsx). /login and /register
    // are the two real entry points from there. Everything else still
    // bounces straight to /login.
    if (location === "/login" || location === "/register") return <>{children}</>;
    if (location === "/") return <LandingPage />;
    return <Redirect to="/login" />;
  }

  // Where a logged-in session actually belongs - cpo -> its own
  // Operational Canvas, admin (Owner) -> the Master Console,
  // Finance/HR/Operations -> their own scoped dashboards
  // (MANAGEMENT_HOME_ROUTE), everyone else -> the general Management
  // Dashboard.
  const homeRoute =
    user?.role === "cpo" ? "/cpo" : user?.role === "admin" ? "/owner" : (user?.role && MANAGEMENT_HOME_ROUTE[user.role]) || "/admin";

  if (location === "/login") {
    return <Redirect to={user?.mustChangePassword ? "/change-password" : homeRoute} />;
  }

  // /register stays reachable for an already-authenticated Owner (see
  // routes/auth.ts's own comment on POST /auth/register) - lets them
  // run through the real signup form from inside /owner without it
  // logging them out of their own session. Every other already-
  // authenticated role gets the same "you don't need this page"
  // redirect /login gets.
  if (location === "/register" && user?.role !== "admin") {
    return <Redirect to={user?.mustChangePassword ? "/change-password" : homeRoute} />;
  }

  if (user?.mustChangePassword && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  // A Solo Operator plan session (see lib/api.ts's PlanType) is
  // Operators Note only, per direct product direction - server-side
  // enforced too (blockSoloOperatorFromManagement), this is just what
  // keeps the UI itself from ever showing a dead Management page.
  if (
    user?.planType === "solo_operator" &&
    location !== "/cpo" &&
    !location.startsWith("/cpo/") &&
    location !== "/change-password"
  ) {
    return <Redirect to="/cpo" />;
  }

  if ((location === "/owner" || location === "/owner/subscriptions" || location === "/owner/it") && user?.role !== "admin") {
    return <Redirect to={homeRoute} />;
  }

  // "/" shows the same public landing page a logged-out visitor sees,
  // even for an already-authenticated session - being logged in
  // shouldn't change what the homepage itself shows, same as any real
  // marketing site (visiting google.com doesn't skip you into Gmail
  // just because you're signed in). Getting into the actual app is
  // still one click away via the page's own "Log In" button.
  if (location === "/") {
    return <LandingPage />;
  }

  if (location === "/quick-access" && user?.role !== "admin") {
    return <Redirect to={homeRoute} />;
  }

  // A plain Owner session (role: "admin", companyId: null, not
  // previewing) has nothing to do on the Management/CPO pages - every
  // API call there 400s (see requireCompanyId's comment in
  // lib/resolve-company.ts). Send them to /owner instead of a broken
  // empty-looking UI. Once they've entered Preview (pages/owner/
  // dashboard.tsx's "Preview" button), companyId is set and these
  // routes work normally, so this only applies pre-preview. /quick-
  // access, /register, /owner/subscriptions, and /owner/it are exempt
  // the same way /owner is - none makes any tenant-scoped API call of
  // its own (Subscriptions is platform-wide pricing, IT is the
  // Owner's own status/ticket inbox - neither is per-company data).
  if (
    user?.role === "admin" &&
    !user.isPreviewing &&
    location !== "/owner" &&
    location !== "/owner/subscriptions" &&
    location !== "/owner/it" &&
    location !== "/quick-access" &&
    location !== "/register"
  ) {
    return <Redirect to="/owner" />;
  }

  return <>{children}</>;
}
