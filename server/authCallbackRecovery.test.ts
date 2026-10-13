import { describe, expect, it } from "vitest";
import {
  hasRecoveryCallbackCredential,
  isRecoveryRequested,
  isRecoveryPurposeTrusted,
  shouldAllowRecoveryTransition,
  type CallbackParams,
} from "../client/src/lib/authCallbackRecovery";

function params(partial: Partial<CallbackParams>): CallbackParams {
  return {
    accessToken: null,
    refreshToken: null,
    tokenHash: null,
    code: null,
    type: null,
    flow: null,
    ...partial,
  };
}

describe("auth callback recovery gating", () => {
  it("does not allow recovery transition with only flow=recovery", () => {
    const p = params({ flow: "recovery" });
    expect(isRecoveryRequested(p)).toBe(true);
    expect(hasRecoveryCallbackCredential(p)).toBe(false);
    expect(shouldAllowRecoveryTransition(p, { passwordRecoveryEventSeen: false })).toBe(false);
  });

  it("does not trust query params alone for recovery purpose", () => {
    const p = params({ type: "recovery", code: "auth-code" });
    expect(isRecoveryRequested(p)).toBe(true);
    expect(hasRecoveryCallbackCredential(p)).toBe(true);
    expect(isRecoveryPurposeTrusted(p, { passwordRecoveryEventSeen: false })).toBe(false);
    expect(shouldAllowRecoveryTransition(p, { passwordRecoveryEventSeen: false })).toBe(false);
  });

  it("allows recovery transition when PASSWORD_RECOVERY event is seen", () => {
    const p = params({ flow: "recovery", accessToken: "a", refreshToken: "r" });
    expect(shouldAllowRecoveryTransition(p, { passwordRecoveryEventSeen: true })).toBe(true);
  });

  it("allows verified recovery OTP token_hash flow", () => {
    const p = params({ type: "recovery", tokenHash: "hash" });
    expect(isRecoveryPurposeTrusted(p, { passwordRecoveryEventSeen: false })).toBe(true);
    expect(shouldAllowRecoveryTransition(p, { passwordRecoveryEventSeen: false })).toBe(true);
  });

  it("rejects non-recovery OTP flow even if flow param is tampered", () => {
    const p = params({ type: "invite", tokenHash: "hash", flow: "recovery" });
    expect(shouldAllowRecoveryTransition(p, { passwordRecoveryEventSeen: false })).toBe(false);
  });
});
