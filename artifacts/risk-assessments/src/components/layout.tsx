import { Link, useLocation } from "wouter";
import { AlertTriangle, Home, List, Settings, ShieldAlert } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/assessments", label: "Assessments", icon: List },
  ];

  return (
    <div className="min-h-screen flex bg-background font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar">
          <ShieldAlert className="w-6 h-6 text-primary mr-3" />
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">RiskTrack</span>
        </div>
        
        <div className="p-4 flex-1">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
            Workspace
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 mr-3" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center px-3 py-2 text-sidebar-foreground/70 text-sm">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold mr-3">
              JD
            </div>
            <div className="flex-1 truncate">
              <div className="font-medium text-sidebar-foreground truncate">J. Doe</div>
              <div className="text-xs opacity-70 truncate">Safety Officer</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center px-6 md:px-8 border-b bg-card justify-between sticky top-0 z-10">
          <div className="flex items-center md:hidden">
            <ShieldAlert className="w-6 h-6 text-primary mr-2" />
            <span className="font-bold">RiskTrack</span>
          </div>
          <div className="hidden md:block">
            {/* Breadcrumb area or contextual header could go here */}
          </div>
          <div className="flex items-center space-x-4">
            {/* Quick Actions */}
          </div>
        </header>
        
        <div className="flex-1 p-6 md:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
