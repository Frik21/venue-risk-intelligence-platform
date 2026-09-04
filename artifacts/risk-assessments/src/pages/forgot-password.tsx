import { useState } from "react";
import { useLocation } from "wouter";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Always the success state once the request round-trips - the
  // backend deliberately returns the same generic response whether or
  // not the email belongs to a real account (see routes/auth.ts), so
  // there's nothing more specific to show here without leaking that.
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.auth.forgotPassword(email);
    } finally {
      setSubmitting(false);
      setSent(true);
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

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          {sent ? (
            <>
              <p className="text-sm text-slate-300">
                If an account exists for <span className="text-white">{email}</span>, a password reset link has been sent.
              </p>
              <Button type="button" variant="secondary" className="w-full" onClick={() => navigate("/login")}>
                Back to Sign In
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-slate-400">Enter the email on your account and we'll send you a link to reset your password.</p>
              <div>
                <Label className="text-slate-300">Email</Label>
                <Input
                  type="email"
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white mt-1"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !email}>
                {submitting ? "Sending..." : "Send Reset Link"}
              </Button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-300"
              >
                Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
