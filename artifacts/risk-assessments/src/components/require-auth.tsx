import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { ShieldAlert } from "lucide-react";

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

  return <>{children}</>;
}
