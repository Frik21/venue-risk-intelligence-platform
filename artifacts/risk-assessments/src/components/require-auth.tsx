import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { ShieldAlert } from "lucide-react";

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
    return location === "/login" ? <>{children}</> : <Redirect to="/login" />;
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

  // "/" (role-select.tsx's "Where do you want to go?" chooser) is an
  // Owner-only manual nav aid, not something a real subscriber's user
  // should ever land on - its tiles expose every department's
  // dashboard regardless of who's actually logged in. Same "only the
  // Owner sees this" principle as the Company switcher and Owner
  // Console itself.
  if (location === "/" && user?.role !== "admin") {
    return <Redirect to={homeRoute} />;
  }

  // A plain Owner session (role: "admin", companyId: null, not
  // previewing) has nothing to do on the Management/CPO pages - every
  // API call there 400s (see requireCompanyId's comment in
  // lib/resolve-company.ts). Send them to /owner instead of a broken
  // empty-looking UI. Once they've entered Preview (pages/owner/
  // dashboard.tsx's "Preview" button), companyId is set and these
  // routes work normally, so this only applies pre-preview.
  if (user?.role === "admin" && !user.isPreviewing && location !== "/owner") {
    return <Redirect to="/owner" />;
  }

  return <>{children}</>;
}
