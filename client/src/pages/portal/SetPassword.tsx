/**
 * SetPassword.tsx
 *
 * Shown to clients who have clicked their magic-link invite and need to set
 * a permanent password before accessing the portal.
 *
 * Detection: rendered by PortalLayout / RouteGuard when
 *   user.must_reset_password === true  OR  tenant.invite_accepted === false
 *
 * The component is also accessible at /portal/set-password for direct navigation.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "../../lib/trpc";

export default function SetPassword() {
  const [, navigate] = useLocation();
  const { refresh } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: async (data) => {
      console.log("[SetPassword] submit success", data);
      toast.success("Password set successfully! Welcome to the KynLi portal.");
      const refreshed = await refresh(); // re-fetch user so must_reset_password is cleared
      console.log("[SetPassword] user after password set", refreshed?.data ?? null);
      navigate("/portal");
    },
    onError: (e) => toast.error(`Failed to set password: ${e.message}`),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    changePassword.mutate({ newPassword });
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0a0a" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg px-3 py-2">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663280358154/DHoPFRmeekJSRWmQf4bAQb/kynli-logo_c9409708.png"
              alt="KynLi Consulting"
              className="h-8 w-auto object-contain"
            />
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8 space-y-6"
          style={{ backgroundColor: "#111111", borderColor: "#1f1f1f" }}
        >
          {/* Header */}
          <div className="text-center space-y-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "rgba(0,212,170,0.1)" }}
            >
              <KeyRound size={22} style={{ color: "#00d4aa" }} />
            </div>
            <h1 className="text-xl font-bold text-foreground">Set Your Password</h1>
            <p className="text-sm text-muted-foreground">
              Create a secure password to access your KynLi client portal.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">New Password</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="bg-background border-border text-foreground pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowNew((v) => !v)}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="bg-background border-border text-foreground pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Password strength hint */}
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs" style={{ color: "#f59e0b" }}>
                Password must be at least 8 characters.
              </p>
            )}
            {newPassword.length >= 8 && confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs" style={{ color: "#ef4444" }}>
                Passwords do not match.
              </p>
            )}
            {newPassword.length >= 8 && confirmPassword === newPassword && (
              <p className="text-xs flex items-center gap-1" style={{ color: "#00d4aa" }}>
                <ShieldCheck size={12} /> Passwords match
              </p>
            )}

            <Button
              type="submit"
              className="w-full font-medium"
              style={{ backgroundColor: "#00d4aa", color: "#000" }}
              disabled={changePassword.isPending || newPassword.length < 8 || newPassword !== confirmPassword}
            >
              {changePassword.isPending ? "Setting password…" : "Set Password & Enter Portal"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "#444" }}>
          KynLi Consulting — Secure Client Portal
        </p>
      </div>
    </div>
  );
}
