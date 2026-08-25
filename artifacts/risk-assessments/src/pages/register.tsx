import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ShieldAlert, ShieldCheck, Gauge, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import type { PlanType, ManagementRole } from "@/lib/api";

// Same four roles/labels as Command Desk's own "Add User" dialog
// (pages/admin/users.tsx) - "Position" on the signup form is really
// just picking which of those the person signing up is.
const POSITIONS: { value: ManagementRole; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "finance", label: "Finance" },
  { value: "human_resources", label: "Human Resources" },
  { value: "operations", label: "Operations" },
];

// Two display-label-only names, "Solo Operator" and "Management
// system" - per direct product direction ("when you click register it
// needs to give me the option to select 'Solo Operator' or
// 'Management system'"). "Management system" is a signup-flow-only
// label for the "team" plan (the internal planType value, route
// names, and every other surface's own "Team" label are unchanged -
// same display-label-vs-identifier split as Command Desk/Operators
// note elsewhere in this app).
const PLAN_CHOICES: { value: PlanType; label: string; description: string; icon: typeof ShieldCheck }[] = [
  {
    value: "solo_operator",
    label: "Solo Operator",
    description: "Just you, a freelance CPO - Operators Note only, no Management side.",
    icon: ShieldCheck,
  },
  {
    value: "team",
    label: "Management system",
    description: "Full Command Desk + Operators Note for your whole team.",
    icon: Gauge,
  },
];

export default function RegisterPage() {
  const { user, register } = useAuth();
  const isOwnerTesting = user?.role === "admin";
  const [, navigate] = useLocation();
  const [planType, setPlanType] = useState<PlanType | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<ManagementRole>("manager");
  const [officeCity, setOfficeCity] = useState("");
  const [officeCountry, setOfficeCountry] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSolo = planType === "solo_operator";
  const canSubmit = (isSolo || companyName.trim()) && name.trim() && email.trim() && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planType) return;
    setError(null);
    setSubmitting(true);
    try {
      // Additional seats beyond each role's free base aren't set here -
      // per direct product direction, seat management moved into
      // Command Desk itself rather than being asked at signup. Every
      // new Team company starts on the base-only seat counts (0
      // additional for every role); an Owner/Manager can add more
      // later. Meaningless for Solo Operator (a single, hard-capped
      // CPO seat), so companyName/role/office are simply omitted for
      // that plan too - the company row gets named after the person
      // directly, same convention the Owner Console's own onboarding
      // dialog follows, and the account is always role: "cpo".
      await register({
        planType,
        companyName: isSolo ? undefined : companyName,
        role: isSolo ? undefined : role,
        officeCity: isSolo ? undefined : officeCity,
        officeCountry: isSolo ? undefined : officeCountry,
        name,
        email,
        password,
      });
      // register() reloads the page on success - this line only runs if
      // it somehow returns without navigating, as a fallback.
      navigate(isOwnerTesting ? "/owner" : isSolo ? "/cpo" : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-blue-400" />
          <div className="text-center">
            <div className="text-lg font-bold tracking-wide">VENUEGUARD</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">Risk Intelligence</div>
          </div>
        </div>

        {isOwnerTesting && (
          <div className="bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs rounded-lg p-3 text-center">
            You're signed in as the Owner - this creates a real company, but you'll stay logged in as yourself and return to the Master Console.
          </div>
        )}

        {planType === null ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400 text-center">What are you signing up for?</p>
            {PLAN_CHOICES.map((choice) => {
              const Icon = choice.icon;
              return (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setPlanType(choice.value)}
                  className="w-full text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-3 hover:border-blue-500/50 hover:bg-slate-900/70 transition-colors"
                >
                  <Icon className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">{choice.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{choice.description}</div>
                  </div>
                </button>
              );
            })}
            {!isOwnerTesting && (
              <p className="text-xs text-center text-slate-500 pt-2">
                Already have an account? <Link href="/login" className="text-blue-400 hover:underline">Log in</Link>
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <button
              type="button"
              onClick={() => setPlanType(null)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {PLAN_CHOICES.find((c) => c.value === planType)?.label}
            </button>
            {isSolo ? (
              <p className="text-xs text-slate-500">
                Solo Operator is for one individual, not a company - no company name, no Management side, just your own login into Operators Note.
              </p>
            ) : (
              <>
                <div>
                  <Label className="text-slate-300">Company Name</Label>
                  <Input
                    autoFocus
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Position</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as ManagementRole)}>
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300">Office Location</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-1.5">Optional - add more offices later from Command Desk.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="City"
                      value={officeCity}
                      onChange={(e) => setOfficeCity(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                    <Input
                      placeholder="Country"
                      value={officeCountry}
                      onChange={(e) => setOfficeCountry(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="border-t border-slate-800 pt-4">
              <Label className="text-slate-300">Your Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Email</Label>
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting || !canSubmit}>
              {submitting ? "Creating..." : isOwnerTesting ? (isSolo ? "Onboard Solo Operator" : "Create Company") : "Create Account"}
            </Button>
            {!isOwnerTesting && (
              <p className="text-xs text-center text-slate-500">
                Already have an account? <Link href="/login" className="text-blue-400 hover:underline">Log in</Link>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
