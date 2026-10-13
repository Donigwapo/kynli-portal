import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseClient } from "@/lib/supabase";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

const RECOVERY_VERIFIED_KEY = "kynli:recovery:verified";

type RecoveryState = "loading" | "ready" | "invalid";

export default function ResetPassword() {
  const [, navigate] = useLocation();

  const [state, setState] = useState<RecoveryState>("loading");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function verifyRecoverySession() {
      try {
        const recoveryFlag = typeof window !== "undefined" ? sessionStorage.getItem(RECOVERY_VERIFIED_KEY) : null;
        if (recoveryFlag !== "1") {
          if (!cancelled) {
            setState("invalid");
            setError("This password reset link is invalid or has expired. Please request a new link.");
          }
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabaseClient.auth.getSession();

        if (sessionError || !session?.user) {
          if (!cancelled) {
            setState("invalid");
            setError("This password reset link is invalid or has expired. Please request a new link.");
          }
          return;
        }

        if (!cancelled) {
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setState("invalid");
          setError("Unable to verify reset session. Please request a new password reset link.");
        }
      }
    }

    void verifyRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state === "ready") return;

    if (typeof window !== "undefined") {
      sessionStorage.removeItem(RECOVERY_VERIFIED_KEY);
    }
  }, [state]);

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8;
  const passwordsMatch = newPassword.length >= 8 && confirmPassword.length > 0 && newPassword === confirmPassword;

  const canSubmit = useMemo(() => {
    return state === "ready" && !submitting && newPassword.length >= 8 && confirmPassword === newPassword;
  }, [state, submitting, newPassword, confirmPassword]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword });

      if (updateError) {
        setError(updateError.message || "Unable to reset password. Please request a new link.");
        return;
      }

      setMessage("Password reset successful. Redirecting to sign in…");

      await supabaseClient.auth.signOut();
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(RECOVERY_VERIFIED_KEY);
      }

      setTimeout(() => {
        navigate("/login?reset=success");
      }, 500);
    } catch {
      setError("Unable to reset password. Please request a new link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-primary/10 text-primary">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-xl font-bold text-foreground">Reset Password</h1>
          <p className="text-sm text-muted-foreground">Create a new password for your KynLi Portal account.</p>
        </div>

        {state === "loading" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="animate-spin" size={16} />
            <span>Verifying reset link…</span>
          </div>
        )}

        {state === "invalid" && (
          <div className="space-y-3">
            <p className="text-sm text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error || "This password reset link is invalid or has expired."}
            </p>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.removeItem(RECOVERY_VERIFIED_KEY);
                }
                navigate("/login");
              }}
            >
              Back to Sign In
            </Button>
          </div>
        )}

        {state === "ready" && (
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

            {passwordTooShort && (
              <p className="text-xs text-amber-700 dark:text-amber-300">Password must be at least 8 characters.</p>
            )}
            {newPassword.length >= 8 && confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <p className="text-xs text-red-700 dark:text-red-300">Passwords do not match.</p>
            )}
            {passwordsMatch && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <ShieldCheck size={12} /> Passwords match
              </p>
            )}

            {error && (
              <p className="text-sm text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
                {error}
              </p>
            )}
            {message && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
                {message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!canSubmit}
            >
              {submitting ? "Resetting…" : "Reset Password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
