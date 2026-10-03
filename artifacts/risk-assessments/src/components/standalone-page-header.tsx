import { Link } from "wouter";
import { ArrowLeftRight, Compass, LogOut, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";

const ROLE_LABELS: Record<string, string> = {
  admin: "Owner",
  manager: "Manager",
  finance: "Finance",
  human_resources: "Human Resources",
  operations: "Operations",
  gsoc: "GSOC",
  cpo: "CPO",
};

// Shared header for every standalone (no Command Desk sidebar/shell)
// Management-side surface - GSOC, Operations, Finance, HR, IT. Each
// surface passes its own icon/label/accent so it still reads as its
// own product-ish destination, same reasoning that first shaped
// GSOC's own standalone page, just no longer duplicated per page.
export function StandalonePageHeader({
  icon: Icon,
  label,
  iconClassName = "text-cyan-400",
  avatarClassName = "bg-cyan-600/30 text-cyan-300",
}: {
  icon: LucideIcon;
  label: string;
  iconClassName?: string;
  avatarClassName?: string;
}) {
  const { user, logout } = useAuth();
  // An Owner session has no real "Command Desk home" of its own - it's
  // just auto-scoped to the Test Company for QA (see CLAUDE.md's Preview-
  // removal note), so the way back for an Owner is Quick Access, not
  // Command Desk. A real Management-role session's home genuinely is
  // Command Desk, so that link stays correct for them.
  const isOwner = user?.role === "admin";

  return (
    <header className="h-14 flex items-center px-6 bg-slate-950 text-white gap-2.5 shrink-0">
      <Icon className={`w-5 h-5 ${iconClassName}`} />
      <div>
        <div className="text-sm font-bold tracking-wide">VENUEGUARD</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest -mt-0.5">{label}</div>
      </div>
      <div className="flex-1" />
      {isOwner ? (
        <Link href="/quick-access" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mr-4">
          <Compass className="w-3.5 h-3.5" /> Quick Access
        </Link>
      ) : (
        <Link href="/admin" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mr-4">
          <ArrowLeftRight className="w-3.5 h-3.5" /> Command Desk
        </Link>
      )}
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0 ${avatarClassName}`}>
          {user?.avatarInitials ?? user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 hidden sm:block">
          <div className="text-xs font-medium text-slate-200 truncate">{user?.name ?? "—"}</div>
          <div className="text-[10px] text-slate-500 truncate">{user ? (ROLE_LABELS[user.role] ?? user.role) : ""}</div>
        </div>
        <button onClick={() => logout()} title="Sign Out" className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors shrink-0">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
