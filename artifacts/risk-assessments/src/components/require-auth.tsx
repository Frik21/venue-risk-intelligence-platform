import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
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
    // public marketing page (pages/landing.tsx). Everything else still
    // bounces straight to /login.
    if (location === "/login") return <>{children}</>;
    if (location === "/") return <LandingPage />;
    return <Redirect to="/login" />;
  }

  // Where a logged-in session actually belongs - cpo -> its own
  // Operational Canvas, admin (Owner) -> the Owner Console, everyone
  // else -> the Management Dashboard.
  const homeRoute = user?.role === "cpo" ? "/cpo" : user?.role === "admin" ? "/owner" : "/admin";

  if (location === "/login") return <Redirect to={user?.mustChangePassword ? "/change-password" : homeRoute} />;

  if (user?.mustChangePassword && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  if (location === "/owner" && user?.role !== "admin") {
    return <Redirect to={homeRoute} />;
  }

  // "/" isn't a real page anymore (role-select.tsx's manual "Where do
  // you want to go?" chooser moved to /quick-access, Owner-only -
  // Preview mode already covers what "/" itself was for, and it
  // doubled as a way for any logged-in user to poke into another
  // department's dashboard). Anyone landing on the bare root just gets
  // sent to their own home route.
  if (location === "/") {
    return <Redirect to={homeRoute} />;
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
  // access itself is exempt (same as /owner) - it's just a static tile
  // grid, no API calls of its own, and it's the whole point of the
  // header button that links there while previewing.
  if (user?.role === "admin" && !user.isPreviewing && location !== "/owner" && location !== "/quick-access") {
    return <Redirect to="/owner" />;
  }

  return <>{children}</>;
}
