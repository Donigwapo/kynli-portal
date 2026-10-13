import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseClient } from "@/lib/supabase";
import { Loader2, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

const GENERIC_RESET_CONFIRMATION =
  "If an account exists for that email, a password reset link has been sent.";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const [location, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (user?.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/portal");
      }
    }
  }, [authLoading, isAuthenticated, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setResetMessage("Password reset successful. Please sign in with your new password.");
    } else if (params.get("reset") === "invalid") {
      setError("This password reset link is invalid or has expired. Please request a new one.");
    }
  }, [location]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid email or password.");
        return;
      }
      if (data.user?.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/portal");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) return;

    setResetLoading(true);
    setResetMessage("");

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await supabaseClient.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${origin}/auth/callback?flow=recovery`,
      });
    } catch (err) {
      console.warn("[Login] forgot password request error", err);
    } finally {
      // Always return generic confirmation to prevent account enumeration.
      setResetMessage(GENERIC_RESET_CONFIRMATION);
      setResetLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-xl px-4 py-2 mb-4">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663280358154/DHoPFRmeekJSRWmQf4bAQb/kynli-logo_c9409708.png"
              alt="KynLi Consulting"
              className="h-14 w-auto object-contain"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {forgotMode ? "Reset your password" : "Sign in to your client portal"}
          </p>
        </div>

        {resetMessage && (
          <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
            {resetMessage}
          </p>
        )}

        {!forgotMode ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="bg-card border-border text-foreground h-10"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm text-foreground">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setForgotMode(true);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="bg-card border-border text-foreground h-10"
              />
            </div>

            {error && (
              <p className="text-sm text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/30 dark:border-red-500/20 rounded px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 font-semibold"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-email" className="text-sm text-foreground">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="bg-card border-border text-foreground h-10"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 font-semibold"
              disabled={resetLoading || !resetEmail.trim()}
            >
              {resetLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
              {resetLoading ? "Sending…" : "Send reset link"}
            </Button>

            <button
              type="button"
              onClick={() => setForgotMode(false)}
              className="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </form>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield size={12} />
          <span>Secure access — KynLi clients only</span>
        </div>
      </div>
    </div>
  );
}
