import { Link } from "wouter";
import { ShieldCheck, Gauge, ShieldAlert, ArrowRight } from "lucide-react";

// Temporary fast-path landing page (per direct product direction: "for
// now to make it faster... from the start") - sits in front of the CPO
// Operational Canvas (now at /cpo, was previously at / directly) so
// testing doesn't require digging through either app's own menus
// (CPO's operator menu > Admin Dashboard, or the Manager sidebar's
// Operator View link) just to switch between the two. Not a real
// role/auth gate - both options stay reachable from inside each app the
// same way they always were.
export default function RoleSelect() {
  return (
    <div className="min-h-[80vh] bg-slate-950 text-white rounded-3xl p-8 flex items-center justify-center">
      <div className="max-w-3xl w-full mx-auto space-y-10 text-center">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          <Link
            href="/cpo"
            className="group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500 hover:bg-slate-800/60 transition-colors"
          >
            <ShieldCheck className="w-6 h-6 text-sky-300 mb-3" />
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">CPO</h2>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Operational Canvas - your daily brief, tasks, and field tools.
            </p>
          </Link>

          <Link
            href="/admin"
            className="group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500 hover:bg-slate-800/60 transition-colors"
          >
            <Gauge className="w-6 h-6 text-amber-300 mb-3" />
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Admin</h2>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Management Dashboard - tasks, operators, costs, and reporting.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
