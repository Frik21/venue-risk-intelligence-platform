import { Link } from "wouter";
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
  Building2,
  UserCog,
} from "lucide-react";

// Owner-only fast-path (see require-auth.tsx - non-admin sessions
// never reach this route). Used to be the default landing page at "/"
// before real auth existed; now it's a manual shortcut reachable via a
// button on the Owner Console header (pages/owner/dashboard.tsx), for
// jumping straight into whatever's currently the Test Company's
// Management/CPO pages during Preview, without digging through either
// app's own nav. Not a role/auth gate itself - the tiles with an href
// land on either /cpo or the same /admin Management Dashboard, exactly
// like clicking into them normally would. Operations/Finance/Human
// Resources are extra entry points into that one dashboard, not
// separately scoped views - per direct product direction, revisit if
// role-scoped dashboards are wanted later. IT has no destination yet
// (href: null) - deliberately left as a placeholder, not wired to
// /admin like the others, until there's an actual IT-specific surface.
const TILES = [
  {
    href: "/cpo",
    icon: ShieldCheck,
    iconColor: "text-sky-300",
    label: "CPO",
    description: "Operational Canvas - your daily brief, tasks, and field tools.",
  },
  {
    href: "/admin",
    icon: Gauge,
    iconColor: "text-amber-300",
    label: "Management",
    description: "Management Dashboard - tasks, operators, costs, and reporting.",
  },
  {
    href: "/admin",
    icon: Workflow,
    iconColor: "text-emerald-300",
    label: "Operations",
    description: "Management Dashboard - tasks, operators, costs, and reporting.",
  },
  {
    href: "/admin",
    icon: Wallet,
    iconColor: "text-violet-300",
    label: "Finance",
    description: "Management Dashboard - tasks, operators, costs, and reporting.",
  },
  {
    href: "/admin",
    icon: Users2,
    iconColor: "text-rose-300",
    label: "Human Resources",
    description: "Management Dashboard - tasks, operators, costs, and reporting.",
  },
  {
    href: null,
    icon: Cpu,
    iconColor: "text-slate-400",
    label: "IT",
    description: "Not built yet.",
  },
  {
    href: null,
    icon: Globe,
    iconColor: "text-slate-400",
    label: "Landing Page",
    description: "Not built yet.",
  },
  {
    href: null,
    icon: CreditCard,
    iconColor: "text-slate-400",
    label: "Subscriptions",
    description: "Not built yet.",
  },
  {
    href: null,
    icon: Building2,
    iconColor: "text-slate-400",
    label: "Enterprise",
    description: "Not built yet.",
  },
  {
    href: null,
    icon: UserCog,
    iconColor: "text-slate-400",
    label: "Single Operator",
    description: "Not built yet.",
  },
] as const satisfies readonly { href: string | null; icon: typeof Cpu; iconColor: string; label: string; description: string }[];

export default function RoleSelect() {
  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex items-center justify-center relative">
      <Link
        href="/owner"
        className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Owner Console
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
          {TILES.map((tile) =>
            tile.href ? (
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
                    Coming soon
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{tile.description}</p>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
