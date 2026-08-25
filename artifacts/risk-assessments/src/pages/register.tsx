import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import type { PlanType } from "@/lib/api";

export default function RegisterPage() {
  const { user, register } = useAuth();
  const isOwnerTesting = user?.role === "admin";
  const [, navigate] = useLocation();
  const [planType, setPlanType] = useState<PlanType>("team");
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSolo = planType === "solo_operator";
  const canSubmit = (isSolo || companyName.trim()) && name.trim() && email.trim() && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Additional seats beyond each role's free base aren't set here -
      // per direct product direction, seat management moved into
      // Command Desk itself rather than being asked at signup. Every
      // new Team company starts on the base-only seat counts (0
      // additional for every role); an Owner/Manager can add more
      // later. Meaningless for Solo Operator (a single, hard-capped
      // CPO seat), so companyName is simply omitted for that plan too -
      // the company row gets named after the person directly, same
      // convention the Owner Console's own onboarding dialog follows.
      await register({ planType, companyName: isSolo ? undefined : companyName, name, email, password });
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

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <Label className="text-slate-300">Plan</Label>
            <Select value={planType} onValueChange={(v) => setPlanType(v as PlanType)}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Team - full Management + Operators Note</SelectItem>
                <SelectItem value="solo_operator">Solo Operator - an individual, Operators Note only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isSolo ? (
            <p className="text-xs text-slate-500">
              Solo Operator is for one individual, not a company - no company name, no Management side, just your own login into Operators Note.
            </p>
          ) : (
            <div>
              <Label className="text-slate-300">Company Name</Label>
              <Input
                autoFocus
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1"
              />
            </div>
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
      </div>
    </div>
  );
}
