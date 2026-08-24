import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { BASE_SEATS_BY_ROLE, CPO_BASE_SEATS, type ManagementRole } from "@/lib/api";

const MANAGEMENT_ROLES: ManagementRole[] = ["manager", "operations", "finance", "human_resources"];
const ROLE_LABELS: Record<ManagementRole, string> = {
  manager: "Manager",
  operations: "Operations",
  finance: "Finance",
  human_resources: "Human Resources",
};

export default function RegisterPage() {
  const { user, register } = useAuth();
  const isOwnerTesting = user?.role === "admin";
  const [, navigate] = useLocation();
  const [companyName, setCompanyName] = useState("");
  const [additionalSeats, setAdditionalSeats] = useState<Record<ManagementRole, number>>({
    manager: 0,
    operations: 0,
    finance: 0,
    human_resources: 0,
  });
  const [additionalCpoSeats, setAdditionalCpoSeats] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({
        companyName,
        name,
        email,
        password,
        additionalManagerSeats: additionalSeats.manager,
        additionalOperationsSeats: additionalSeats.operations,
        additionalFinanceSeats: additionalSeats.finance,
        additionalHumanResourcesSeats: additionalSeats.human_resources,
        additionalCpoSeats,
      });
      // register() reloads the page on success - this line only runs if
      // it somehow returns without navigating, as a fallback.
      navigate(isOwnerTesting ? "/owner" : "/admin");
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
            You're signed in as the Owner - this creates a real company, but you'll stay logged in as yourself and return to the Owner Console.
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
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
            <Label className="text-slate-300">Seats</Label>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Every company starts with a fixed base per role - add more if you need them. Additional seats are billed separately.
            </p>
            <div className="space-y-2">
              {MANAGEMENT_ROLES.map((role) => (
                <div key={role} className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5">
                  <span className="text-sm text-slate-300">
                    {ROLE_LABELS[role]} <span className="text-slate-500">({BASE_SEATS_BY_ROLE[role]} base)</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">+</span>
                    <Input
                      type="number"
                      min={0}
                      className="w-16 h-7 text-sm bg-slate-900 border-slate-800 text-white"
                      value={additionalSeats[role]}
                      onChange={(e) =>
                        setAdditionalSeats((s) => ({ ...s, [role]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 uppercase tracking-wide mt-3 mb-1.5">Operators note</p>
            <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5">
              <span className="text-sm text-slate-300">
                CPO <span className="text-slate-500">({CPO_BASE_SEATS} base)</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">+</span>
                <Input
                  type="number"
                  min={0}
                  className="w-16 h-7 text-sm bg-slate-900 border-slate-800 text-white"
                  value={additionalCpoSeats}
                  onChange={(e) => setAdditionalCpoSeats(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          </div>
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
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !companyName || !name || !email || password.length < 8}
          >
            {submitting ? "Creating..." : isOwnerTesting ? "Create Company" : "Create Account"}
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
