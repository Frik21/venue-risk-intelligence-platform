import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  ShieldCheck,
  Gauge,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Workflow,
  Wallet,
  Users2,
  Cpu,
  Globe,
  CreditCard,
  UserCog,
} from "lucide-react";

// Owner-only fast-path (see require-auth.tsx - non-admin sessions
// never reach this route). Used to be the default landing page at "/"
// before real auth existed; now it's a manual shortcut reachable via a
// button on the Master Console header (pages/owner/dashboard.tsx), for
// jumping straight into whatever's currently the Test Company's
// Management/CPO pages during Preview, without digging through either
// app's own nav. Not a role/auth gate itself - the tiles with an href
// land wherever clicking into them normally would. Finance, Operations,
// and Human Resources are each separately scoped now - /admin/finance
// (Quotations/Invoices/Payroll), /admin/operations (Tasks/Operator
// Deployment/Schedule), /admin/hr (Operator Database/Users) - see
// CLAUDE.md's own notes on them. Only "Management" still lands on the
// general /admin Management Dashboard. Landing Page links to "/"
// itself (pages/landing.tsx); Subscriptions links to /owner, where
// plan/status/seats actually live now (see the single-plan seat model
// and Solo Operator plan notes in CLAUDE.md). IT links to /owner/it -
// system status plus the support-ticket inbox (routes/support-tickets.ts),
// per direct product direction ("this needs to monitor the website/App
// health, were logged tickets get send to all off IT"). Single Operator
// links to /cpo (requiresPreview: true) - a Solo Operator company
// redirects there automatically (require-auth.tsx), so this tile is
// really just "preview it, and remember to set your Test Company to
// that plan first." "Enterprise" (the old tier system's leftover, per
// the seat-model note) has been removed outright rather than left as a
// placeholder - per direct product direction, no longer needed.
//
// requiresPreview: true tiles (CPO/Management/Operations/Finance/HR/
// Single Operator) land on a company-scoped page with no company
// context unless the Owner is actively previewing a Test Company -
// require-auth.tsx's catch-all bounces a plain (non-previewing) Owner
// straight back to /owner, since there's nothing real to show.
// Previously that just silently kicked you back with no explanation,
// reported directly as "clicking Quick Access takes me to the Master
// Console." Fixed by disabling those specific tiles up front (matching
// the "Coming soon" treatment, but explaining why) until a Preview is
// actually running.
const TILES = [
  {
    href: "/cpo",
    requiresPreview: true,
    icon: ShieldCheck,
    iconColor: "text-sky-300",
    label: "CPO",
    description: "Operational Canvas - your daily brief, tasks, and field tools.",
  },
  {
    href: "/admin",
    requiresPreview: true,
    icon: Gauge,
    iconColor: "text-amber-300",
    label: "Management",
    description: "Management Dashboard - tasks, operators, costs, and reporting.",
  },
  {
    href: "/admin/operations",
    requiresPreview: true,
    icon: Workflow,
    iconColor: "text-emerald-300",
    label: "Operations",
    description: "Operations Dashboard - Tasks, Operator Deployment, and Schedule.",
  },
  {
    href: "/admin/finance",
    requiresPreview: true,
    icon: Wallet,
    iconColor: "text-violet-300",
    label: "Finance",
    description: "Finance Dashboard - Quotations, Invoices, and Payroll.",
  },
  {
    href: "/admin/hr",
    requiresPreview: true,
    icon: Users2,
    iconColor: "text-rose-300",
    label: "Human Resources",
    description: "HR Dashboard - Operator Database and Users.",
  },
  {
    href: "/owner/it",
    requiresPreview: false,
    icon: Cpu,
    iconColor: "text-sky-300",
    label: "IT",
    description: "System status and the support-ticket inbox for every subscriber.",
  },
  {
    href: "/",
    requiresPreview: false,
    icon: Globe,
    iconColor: "text-cyan-300",
    label: "Landing Page",
    description: "The public marketing page - what a stranger sees before logging in.",
  },
  {
    href: "/owner",
    requiresPreview: false,
    icon: CreditCard,
    iconColor: "text-emerald-300",
    label: "Subscriptions",
    description: "Master Console - plan, status, and seats for every subscriber.",
  },
  {
    href: "/cpo",
    requiresPreview: true,
    icon: UserCog,
    iconColor: "text-violet-300",
    label: "Single Operator",
    description: "Preview Operators Note for a Solo Operator company - set your Test Company to that plan first.",
  },
] as const satisfies readonly { href: string | null; requiresPreview: boolean; icon: typeof Cpu; iconColor: string; label: string; description: string }[];

export default function RoleSelect() {
  const { user } = useAuth();
  const isPreviewing = user?.isPreviewing ?? false;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex items-center justify-center relative">
      <Link
        href="/owner"
        className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Master Console
      </Link>
      <div className="max-w-5xl w-full mx-auto space-y-10 text-center">
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-blue-400" />
          <div>
            <div className="text-lg font-bold tracking-wide">VENUEGUARD</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">Risk Intelligence</div>
          </div>
        </div>

        <div>
          <p className="text-sky-300 text-sm">Quick Access</p>
          <h1 className="text-3xl font-bold mt-1">Where do you want to go?</h1>
          {!isPreviewing && (
            <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
              Start a Preview on your Test Company from the Master Console to unlock the CPO/Management tiles below.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
          {TILES.map((tile) => {
            const locked = tile.requiresPreview && !isPreviewing;
            return tile.href && !locked ? (
              <Link
                key={tile.label}
                href={tile.href}
                className="group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500 hover:bg-slate-800/60 transition-colors"
              >
                <tile.icon className={`w-6 h-6 ${tile.iconColor} mb-3`} />
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">{tile.label}</h2>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-sm text-slate-400 mt-1">{tile.description}</p>
              </Link>
            ) : (
              <div
                key={tile.label}
                className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-6 cursor-not-allowed"
              >
                <tile.icon className={`w-6 h-6 ${tile.iconColor} mb-3`} />
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-500">{tile.label}</h2>
                  <span className="text-[10px] uppercase tracking-widest text-slate-600 border border-slate-700 rounded px-1.5 py-0.5">
                    {locked ? "Start Preview first" : "Coming soon"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {locked ? "Requires an active Preview on your Test Company." : tile.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
