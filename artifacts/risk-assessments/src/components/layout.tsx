import { Link, useLocation } from "wouter";
import {
  Building2,
  Users,
  ListChecks,
  ChevronDown,
  ShieldAlert,
  Search,
  Menu,
  X,
  Gauge,
  ArrowLeftRight,
  UserCog,
  DollarSign,
  UserPlus,
  CalendarDays,
  Archive,
  Bell,
  Radio,
  Briefcase,
  Store,
  MessageSquare,
  Receipt,
  Wallet,
  LogOut,
  FlaskConical,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api, type Office } from "@/lib/api";
import { useSelectedOfficeId } from "@/lib/office-scope";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

const USER_ROLE_LABELS: Record<string, string> = {
  admin: "Owner",
  manager: "Manager",
  finance: "Finance",
  human_resources: "Human Resources",
  operations: "Operations",
  cpo: "CPO",
};

// Deliberately lean - this is a dispatch console for Managers
// (creating/costing task requests, assigning CPOs, tracking who's
// deployed, office locations), not a general risk-intelligence
// analyst tool. Venues/Assessments/Incidents/Alerts/Field
// Intelligence/Evidence/Reports/Documents/Audit History are the
// CPO's/analyst's concerns (the CPO's own Operational Canvas at "/"
// covers assessments) - their routes still exist and work, they're
// just not cluttering this nav per direct product direction.
const navGroups = [
  {
    label: "Management",
    items: [
      { href: "/alerts", label: "Alerts", icon: Bell },
      { href: "/admin", label: "Dashboard", icon: Gauge },
      { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
      { href: "/admin/communications", label: "Communications", icon: MessageSquare },
      { href: "/admin/clients", label: "Clients", icon: Briefcase },
      { href: "/admin/costs", label: "Quotations", icon: DollarSign },
      { href: "/admin/invoices", label: "Invoices", icon: Receipt },
      { href: "/admin/cpo-deployment", label: "Operator Deployment", icon: UserCog },
      { href: "/admin/onboarding", label: "Operator Database", icon: UserPlus },
      { href: "/admin/payroll", label: "Payroll", icon: Wallet },
      { href: "/osint", label: "OSINT", icon: Radio },
      { href: "/admin/vendors", label: "Vendors", icon: Store },
      { href: "/admin/task-archive", label: "Task Archived", icon: Archive },
      { href: "/admin/offices", label: "Offices", icon: Building2 },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
];

const ALL_OFFICES = "all";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useSelectedOfficeId();
  useEffect(() => {
    api.offices.list().then(setOffices).catch((err) => console.error("Failed to load offices:", err));
  }, []);
  const [showShell, setShowShell] = useState(() => {
  return sessionStorage.getItem("venueguard-show-shell") === "true";
});
useEffect(() => {
  const handler = () => {
    sessionStorage.setItem("venueguard-show-shell", "true");
    setShowShell(true);
  };
  window.addEventListener("venueguard-show-shell", handler);

  return () => {
    window.removeEventListener("venueguard-show-shell", handler);
  };
}, []);
// "/cpo" is the CPO's own full-screen Operational Canvas, and "/owner"
// is the platform Owner's own console (a different concept entirely
// from this company-scoped Management shell, which carries the Office
// switcher) - neither wants this sidebar/header chrome, nor do the
// full-bleed auth pages. "/" itself no longer renders anything (see
// require-auth.tsx) so it's not listed here.
const hideShell = (location === "/cpo" || location === "/owner" || location === "/login" || location === "/change-password") && !showShell;
  // "/admin" needs the same exact-match treatment as "/" - otherwise
  // it'd also read as active on "/admin/users" (a real, distinct nav
  // item), since that path also starts with "/admin".
  const isActive = (href: string) =>
    href === "/" || href === "/admin" ? location === href : location.startsWith(href);

  const Sidebar = () => (
    <aside className="w-64 bg-slate-950 text-slate-100 flex flex-col h-full">
      <div className="h-14 flex items-center px-5 border-b border-slate-800 shrink-0">
        <ShieldAlert className="w-5 h-5 text-blue-400 mr-2.5 shrink-0" />
        <div>
          <div className="text-sm font-bold text-white tracking-wide">VENUEGUARD</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Risk Intelligence</div>
        </div>
      </div>

      {/* Office switcher - global filter, per direct product direction
          ("companies will have different offices... select an office
          and all the data from the allocated office"). Persists to
          localStorage (see lib/office-scope.ts) so it survives
          reloads/navigation, and every list page filters to it. Only
          shown once there's actually more than one office to choose
          between - with a single office it's indistinguishable from
          "All Offices" and just reads as clutter next to the real
          "Offices" management page in the nav below. */}
      {offices.length > 1 && (
        <div className="px-3 pt-3 pb-1 border-b border-slate-800 shrink-0">
          <Building2 className="w-3 h-3 text-slate-500 inline mr-1.5 mb-2" />
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Office</span>
          <Select
            value={selectedOfficeId != null ? String(selectedOfficeId) : ALL_OFFICES}
            onValueChange={(v) => setSelectedOfficeId(v === ALL_OFFICES ? null : Number(v))}
          >
            <SelectTrigger className="h-8 text-xs bg-slate-900 border-slate-800 text-slate-200 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OFFICES}>All Offices</SelectItem>
              {offices.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1">
              {group.label}
            </div>
            <nav className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center px-3 py-2 rounded-md text-sm transition-colors",
                      active
                        ? "bg-blue-600 text-white font-medium"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    )}
                  >
                    <Icon className="w-4 h-4 mr-2.5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-slate-800 shrink-0 space-y-2">
        {/* Leaves this admin/manager shell entirely for the CPO's own
            full-screen Operational Canvas (its own login/brief flow,
            no persistent sidebar) - the reverse direction lives in
            that flow's own operator menu ("Admin Dashboard"). Owner-
            only sessions skip this: they have no company to preview a
            CPO's (company-scoped) view as. */}
        {user?.role !== "admin" && (
          <Link
            href="/cpo"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-slate-800"
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" />
            Operator View
          </Link>
        )}
        <div className="flex items-center gap-2 px-2 py-2 rounded-md text-slate-400">
          <div className="w-7 h-7 rounded bg-blue-600/30 flex items-center justify-center text-blue-300 text-xs font-bold shrink-0">
            {user?.avatarInitials ?? user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">{user?.name ?? "—"}</div>
            <div className="text-[10px] text-slate-500 truncate">{user ? (USER_ROLE_LABELS[user.role] ?? user.role) : ""}</div>
          </div>
          <button
            onClick={() => logout()}
            title="Sign Out"
            className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex bg-slate-100 font-sans">
      {/* Desktop sidebar */}
      <div className={cn("hidden md:flex flex-col shrink-0 h-screen sticky top-0", hideShell && "md:hidden")}>
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative flex flex-col w-64 h-full">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">
       <header
  className={cn(
    "h-14 flex items-center px-4 md:px-6 bg-white border-b border-slate-200 sticky top-0 z-10 gap-4",
    hideShell && "hidden"
  )}
>
          <button
            className="md:hidden p-1.5 rounded hover:bg-slate-100"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center md:hidden">
            <ShieldAlert className="w-5 h-5 text-blue-600 mr-1.5" />
            <span className="font-bold text-sm text-slate-900">VenueGuard</span>
          </div>
          {user?.isPreviewing && (
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium px-3 py-1.5 rounded-md">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Previewing {user.companyName ?? "the test company"} - not a real subscriber</span>
              <button
                className="underline decoration-dotted hover:text-violet-900"
                onClick={async () => {
                  // Full reload (not client-side nav) - no react-query
                  // cache in this app is keyed by company, so an
                  // in-memory cache built while previewing shouldn't
                  // bleed into the plain Owner view after exiting.
                  await api.auth.exitPreview();
                  window.location.href = "/owner";
                }}
              >
                Exit Preview
              </button>
            </div>
          )}
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md">
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="ml-1 px-1.5 py-0.5 text-xs bg-white border border-slate-200 rounded font-mono">⌘K</kbd>
          </div>
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.avatarInitials ?? user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
          </div>
        </header>

       <div
  className={cn(
    "flex-1 overflow-auto",
    hideShell ? "p-0" : "p-4 md:p-6"
  )}
>
          <div className={cn("w-full", !hideShell && "max-w-7xl mx-auto")}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
