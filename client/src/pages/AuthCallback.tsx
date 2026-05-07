import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabaseClient } from "@/lib/supabase";
import type { EmailOtpType, Session } from "@supabase/supabase-js";

function getApiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

const OTP_TYPES = new Set<EmailOtpType>([
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

type CallbackParams = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  code: string | null;
  type: string | null;
};

function readCallbackParams(): CallbackParams {
  const url = new URL(window.location.href);
  const search = url.searchParams;
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

  const get = (key: string) => search.get(key) ?? hashParams.get(key);

  return {
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    tokenHash: get("token_hash"),
    code: get("code"),
    type: get("type"),
  };
}

async function waitForSession(timeoutMs = 8000): Promise<Session | null> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) return session;

  return await new Promise<Session | null>((resolve) => {
    const timer = setTimeout(() => {
      listener.data.subscription.unsubscribe();
      resolve(null);
    }, timeoutMs);

    const listener = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) {
        clearTimeout(timer);
        listener.data.subscription.unsubscribe();
        resolve(nextSession);
      }
    });
  });
}

export default function AuthCallback() {
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;

    async function resolveSupabaseSessionFromCallback(): Promise<Session | null> {
      const params = readCallbackParams();
      const otpType = params.type as EmailOtpType | null;

      console.info("[AuthCallback] callback params detected", {
        hasAccessToken: Boolean(params.accessToken),
        hasRefreshToken: Boolean(params.refreshToken),
        hasTokenHash: Boolean(params.tokenHash),
        hasCode: Boolean(params.code),
        type: params.type,
      });

      if (params.accessToken && params.refreshToken) {
        console.info("[AuthCallback] access/refresh token pair detected; setting session");
        const { error } = await supabaseClient.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        });
        if (error) {
          console.error("[AuthCallback] token setSession failed", error.message);
          throw new Error(`Failed to set session from callback tokens: ${error.message}`);
        }
        console.info("[AuthCallback] token exchange success via setSession");
      } else if (params.code) {
        console.info("[AuthCallback] OAuth code detected; exchanging for session");
        const { error } = await supabaseClient.auth.exchangeCodeForSession(params.code);
        if (error) {
          console.error("[AuthCallback] code exchange failed", error.message);
          throw new Error(`Failed to exchange callback code: ${error.message}`);
        }
        console.info("[AuthCallback] token exchange success via code");
      } else if (params.tokenHash && otpType && OTP_TYPES.has(otpType)) {
        console.info("[AuthCallback] token_hash detected; verifying OTP", { type: otpType });
        const { error } = await supabaseClient.auth.verifyOtp({
          type: otpType,
          token_hash: params.tokenHash,
        });
        if (error) {
          console.error("[AuthCallback] token_hash verify failed", error.message);
          throw new Error(`Failed to verify OTP callback token: ${error.message}`);
        }
        console.info("[AuthCallback] token exchange success via verifyOtp", { type: otpType });
      } else {
        console.info("[AuthCallback] no callback token payload found; checking existing session");
      }

      const session = await waitForSession(8000);
      console.info("[AuthCallback] Supabase session detected", {
        hasSession: Boolean(session),
        email: session?.user?.email ?? null,
      });

      return session;
    }

    async function run() {
      try {
        const session = await resolveSupabaseSessionFromCallback();

        if (!session?.user) {
          console.warn("[AuthCallback] No authenticated user found in session");
          if (!cancelled) navigate("/login");
          return;
        }

        const accessToken = session.access_token;

        const callbackSessionRes = await fetch(`${getApiBase()}/api/auth/callback-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: "include",
        });

        if (!callbackSessionRes.ok) {
          const errText = await callbackSessionRes.text().catch(() => "");
          console.error("[AuthCallback] callback-session API failed", {
            status: callbackSessionRes.status,
            detail: errText,
          });
          if (!cancelled) navigate("/login");
          return;
        }

        const callbackData = await callbackSessionRes.json().catch(() => ({}));
        console.info("[AuthCallback] callback-session API success", {
          success: true,
          role: callbackData?.user?.role ?? null,
        });

        const meRes = await fetch(`${getApiBase()}/api/auth/me`, {
          credentials: "include",
        });

        let resolvedUser: { role?: string } | null = null;

        if (meRes.ok) {
          resolvedUser = await meRes.json();
        } else {
          console.warn("[AuthCallback] /api/auth/me failed after callback-session", {
            status: meRes.status,
          });
          resolvedUser = callbackData?.user ?? null;
        }

        const resolvedRole = resolvedUser?.role === "admin" ? "admin" : "client";
        const redirectTarget = resolvedRole === "admin" ? "/admin" : "/portal/profile";

        console.info("[AuthCallback] resolved user role", { role: resolvedRole });
        console.info("[AuthCallback] final redirect target", { target: redirectTarget });

        if (!cancelled) {
          navigate(redirectTarget);
        }
      } catch (err) {
        console.error("[AuthCallback] Unexpected error:", err);
        if (!cancelled) navigate("/login");
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" size={18} />
        <span>Finalizing your invite and signing you in…</span>
      </div>
    </div>
  );
}
