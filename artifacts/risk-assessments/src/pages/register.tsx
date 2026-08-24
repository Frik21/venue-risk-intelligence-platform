import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import type { CompanyTier } from "@/lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const [companyName, setCompanyName] = useState("");
  const [tier, setTier] = useState<CompanyTier>("enterprise");
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
      await register({ companyName, tier, name, email, password });
      // register() reloads the page on success - this line only runs if
      // it somehow returns without navigating, as a fallback.
      navigate("/admin");
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
            <Label className="text-slate-300">Subscription Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as CompanyTier)}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enterprise">Enterprise (20 seats)</SelectItem>
                <SelectItem value="micro_enterprise">Micro Enterprise (10 seats)</SelectItem>
              </SelectContent>
            </Select>
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
            {submitting ? "Creating account..." : "Create Account"}
          </Button>
          <p className="text-xs text-center text-slate-500">
            Already have an account? <Link href="/login" className="text-blue-400 hover:underline">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
