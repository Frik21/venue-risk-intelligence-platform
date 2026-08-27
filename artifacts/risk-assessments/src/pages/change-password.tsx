import { useState } from "react";
import { useLocation } from "wouter";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Reached right after login when the session's mustChangePassword flag
// is set (see useAuth's user.mustChangePassword) - an admin-generated
// initial password (POST /users, onboarding operational-access grant)
// must be replaced with one only the account holder knows.
export default function ChangePasswordPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords don't match"); return; }

    setSubmitting(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      navigate(user?.role === "cpo" ? "/cpo" : user?.role === "admin" ? "/owner" : "/admin");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
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
            <div className="text-xs text-slate-500 uppercase tracking-widest">Set a new password</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <p className="text-sm text-slate-400">You're using a temporary password - set your own before continuing.</p>
          <div>
            <Label className="text-slate-300">Temporary Password</Label>
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-slate-300">New Password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-slate-300">Confirm New Password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white mt-1"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting || !currentPassword || !newPassword || !confirmPassword}>
            {submitting ? "Saving..." : "Set Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
