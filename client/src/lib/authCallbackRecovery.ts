import type { EmailOtpType } from "@supabase/supabase-js";

export type CallbackParams = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  code: string | null;
  type: string | null;
  flow: string | null;
};

export type RecoveryTransitionContext = {
  passwordRecoveryEventSeen: boolean;
};

export function isRecoveryRequested(params: CallbackParams): boolean {
  return params.type === "recovery" || params.flow === "recovery";
}

export function isRecoveryPurposeTrusted(
  params: CallbackParams,
  ctx: RecoveryTransitionContext,
): boolean {
  // Do NOT trust query params alone for recovery purpose.
  // Trust only Supabase-originated signal paths:
  // 1) PASSWORD_RECOVERY auth event observed while establishing session, or
  // 2) token_hash flow explicitly verified as recovery OTP.
  const otpType = params.type as EmailOtpType | null;
  const verifiedRecoveryOtp = Boolean(params.tokenHash) && otpType === "recovery";
  return ctx.passwordRecoveryEventSeen || verifiedRecoveryOtp;
}

export function hasRecoveryCallbackCredential(params: CallbackParams): boolean {
  if (params.accessToken && params.refreshToken) return true;
  if (params.code) return true;

  const otpType = params.type as EmailOtpType | null;
  if (params.tokenHash && otpType === "recovery") return true;

  return false;
}

export function shouldAllowRecoveryTransition(
  params: CallbackParams,
  ctx: RecoveryTransitionContext,
): boolean {
  return (
    isRecoveryRequested(params) &&
    isRecoveryPurposeTrusted(params, ctx) &&
    hasRecoveryCallbackCredential(params)
  );
}
