import { Link } from "wouter";
import {
  ShieldAlert,
  ShieldCheck,
  ListChecks,
  Briefcase,
  DollarSign,
  Radio,
  Users2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Public marketing page, shown at "/" for anyone who isn't logged in
// (see require-auth.tsx - this is the one page an unauthenticated
// visitor actually gets to see, everything else redirects straight to
// /login). No self-serve signup exists yet, so the only call to
// action is "Log In" - per direct product direction, this is
// deliberately pure marketing/informational for now, not a lead-
// capture funnel. Content pulled from real, already-built features
// and the Product Constitution's own language (docs/Product-
// Constitution.md) rather than invented copy - nothing described here
// is aspirational.
const FEATURES = [
  {
    icon: ShieldCheck,
    label: "Operational Brief",
    description: "Every CPO begins their day with a real Operational Brief before entering the field - current conditions, why, and what deserves attention.",
  },
  {
    icon: ListChecks,
    label: "Tasks & Deployment",
    description: "Assign, track, and cost every operation from request through completion, with real-time visibility into who's deployed where.",
  },
  {
    icon: Briefcase,
    label: "Client & Vendor CRM",
    description: "A full activity history for every client relationship and security subcontractor, in one place.",
  },
  {
    icon: DollarSign,
    label: "Quotations, Invoicing & Payroll",
    description: "From quote to invoice to CPO pay run, built around how a security operations business actually bills and pays.",
  },
  {
    icon: Radio,
    label: "Real-Time Monitoring",
    description: "OSINT event tracking and route intelligence feed directly into the operational picture, not a separate tool.",
  },
  {
    icon: Users2,
    label: "Operator Database",
    description: "Onboard, vet, and manage your CPO roster through a real pipeline - documents, checklist, approval, and beyond.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between px-6 md:px-10 h-16 border-b border-slate-900">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-blue-400" />
          <div>
            <div className="text-sm font-bold tracking-wide leading-none">VENUEGUARD</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest leading-none mt-0.5">Risk Intelligence</div>
          </div>
        </div>
        <Link href="/login">
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white">
            Log In
          </Button>
        </Link>
      </header>

      <section className="px-6 md:px-10 py-20 md:py-28 max-w-4xl mx-auto text-center">
        <p className="text-sky-400 text-sm font-medium tracking-wide uppercase mb-4">Operational Intelligence for Security Professionals</p>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          Clarity before action.
        </h1>
        <p className="text-lg md:text-xl text-slate-400 mt-6 max-w-2xl mx-auto">
          VenueGuard helps security professionals begin every operation with confidence, clarity, and context - from the field brief to the back office.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/login">
            <Button size="lg" className="gap-2">
              Log In <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="px-6 md:px-10 py-16 border-t border-slate-900 bg-slate-900/30">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
          <div>
            <p className="text-sky-400 text-sm font-medium tracking-wide uppercase mb-3">Two products, one platform</p>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Built for both sides of the operation.</h2>
            <p className="text-slate-400">
              A full Management console for dispatch, costing, and client relationships - and Operators note, a dedicated field app CPOs actually use on the ground.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="text-sm font-bold text-white mb-1">Management</div>
              <p className="text-xs text-slate-500">Tasks, Quotes, Invoices, Clients, Vendors, Payroll, and reporting - run by Manager, Finance, Human Resources, and Operations staff.</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="text-sm font-bold text-white mb-1">Operators note</div>
              <p className="text-xs text-slate-500">The CPO-facing Operational Canvas - daily brief, tasks, and field tools, purpose-built for the person doing the work.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sky-400 text-sm font-medium tracking-wide uppercase mb-3">What's inside</p>
          <h2 className="text-2xl md:text-3xl font-bold">Everything a security operations business runs on.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature) => (
            <div key={feature.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <feature.icon className="w-6 h-6 text-blue-400 mb-3" />
              <h3 className="text-base font-bold mb-1.5">{feature.label}</h3>
              <p className="text-sm text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 md:px-10 py-20 border-t border-slate-900 bg-slate-900/30 text-center">
        <p className="text-2xl md:text-3xl font-semibold max-w-2xl mx-auto">
          "Within 30 seconds, an operator should understand current conditions, why, what deserves attention, and recommended actions."
        </p>
        <p className="text-slate-500 text-sm mt-4">The VenueGuard 30 Second Rule</p>
      </section>

      <footer className="px-6 md:px-10 py-10 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <ShieldAlert className="w-4 h-4" />
          VenueGuard Risk Intelligence
        </div>
        <Link href="/login">
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white">
            Log In
          </Button>
        </Link>
      </footer>
    </div>
  );
}
