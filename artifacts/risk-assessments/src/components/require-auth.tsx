import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ShieldAlert, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";

// Wraps App.tsx's whole <Switch> (outside <Layout>, so /login itself
// renders full-bleed with no sidebar chrome). Redirects to /login when
// unauthenticated, to /change-password when the session must set a
// real password first, and gates /owner to the admin (Owner) role only
// - matching the backend's requireRole("admin") on /api/companies/*.
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
  // else -> the Management Dashboard. Only used to route a fresh login
  // (from /login) - "/" itself stays reachable afterward as a manual
  // nav aid (role-select.tsx's own stated purpose), not redirected away
  // from on every visit.
  const homeRoute = user?.role === "cpo" ? "/cpo" : user?.role === "admin" ? "/owner" : "/admin";

  if (location === "/login") return <Redirect to={user?.mustChangePassword ? "/change-password" : homeRoute} />;

  if (user?.mustChangePassword && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  if (location === "/owner" && user?.role !== "admin") {
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

  return (
    <>
      {user?.isPreviewing && <PreviewBanner companyName={user.companyName} />}
      {/* Layout's own root div is `min-h-screen` with a `sticky top-0`
          sidebar/header - stacking that under a second `sticky top-0`
          sibling is unreliable (they can end up competing for the same
          spot depending on the browser's scroll-container resolution
          rather than cleanly stacking), which is why the banner above
          uses `fixed` instead. This padding just reserves its height so
          fixed positioning doesn't cover the page underneath it. */}
      <div className={user?.isPreviewing ? "pt-9" : undefined}>{children}</div>
    </>
  );
}

function PreviewBanner({ companyName }: { companyName: string | null }) {
  return (
    <div className="fixed top-0 inset-x-0 z-[100] h-9 flex items-center justify-center gap-3 bg-violet-600 text-white text-xs font-medium px-4">
      <FlaskConical className="w-3.5 h-3.5" />
      <span>Previewing {companyName ?? "the test company"} - not a real subscriber</span>
      <Button
        size="sm"
        variant="secondary"
        className="h-6 px-2 text-[11px]"
        onClick={async () => {
          // Full reload (not client-side nav) - same cache-safety reason
          // login/enterPreview use one: no react-query cache here is
          // keyed by company, so an in-memory cache built while
          // previewing shouldn't bleed into the plain Owner view after.
          await api.auth.exitPreview();
          window.location.href = "/owner";
        }}
      >
        Exit Preview
      </Button>
    </div>
  );
}
