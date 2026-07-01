import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  AlertTriangle,
  Bell,
  Map,
  FolderOpen,
  FileText,
  Users,
  Radio,
  ChevronDown,
  ShieldAlert,
  Search,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/venues", label: "Venues", icon: Building2 },
      { href: "/assessments", label: "Assessments", icon: ClipboardList },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle },
      { href: "/maps", label: "Maps", icon: Map },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/alerts", label: "Alert Queue", icon: Bell },
      { href: "/osint", label: "OSINT", icon: Radio },
    ],
  },
  {
    label: "Repository",
    items: [
      { href: "/evidence", label: "Evidence", icon: FolderOpen },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showShell, setShowShell] = useState(() => {
  return sessionStorage.getItem("venueguard-show-shell") === "true";
});
useEffect(() => {
  const handler = () => {
    sessionStorage.setItem("venueguard-show-shell", "true");
    setShowShell(true);
  };
const hideShell = location === "/" && !showShell;
  window.addEventListener("venueguard-show-shell", handler);

  return () => {
    window.removeEventListener("venueguard-show-shell", handler);
  };
}, []);
const hideShell = location === "/" && !showShell;
  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const Sidebar = () => (
    <aside className="w-64 bg-slate-950 text-slate-100 flex flex-col h-full">
      <div className="h-14 flex items-center px-5 border-b border-slate-800 shrink-0">
        <ShieldAlert className="w-5 h-5 text-blue-400 mr-2.5 shrink-0" />
        <div>
          <div className="text-sm font-bold text-white tracking-wide">VENUEGUARD</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Risk Intelligence</div>
        </div>
      </div>

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

      <div className="p-3 border-t border-slate-800 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md text-slate-400">
          <div className="w-7 h-7 rounded bg-blue-600/30 flex items-center justify-center text-blue-300 text-xs font-bold shrink-0">
            SA
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">Senior Analyst</div>
            <div className="text-[10px] text-slate-500 truncate">Admin Access</div>
          </div>
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
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md">
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="ml-1 px-1.5 py-0.5 text-xs bg-white border border-slate-200 rounded font-mono">⌘K</kbd>
          </div>
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            SA
          </div>
        </header>

       <div
  className={cn(
    "flex-1 overflow-auto",
    hideShell ? "p-0" : "p-4 md:p-6"
  )}
>
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
