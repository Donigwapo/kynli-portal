import { createContext, useContext, useState, ReactNode } from "react";
import type { PackageTier } from "../../../shared/tiers";

interface PortalContextValue {
  /** When admin is impersonating, this is the target tenant ID */
  impersonatingTenantId: number | null;
  setImpersonatingTenantId: (id: number | null) => void;
  /** Effective package tier (from real tenant or impersonated tenant) */
  effectiveTier: PackageTier;
  setEffectiveTier: (tier: PackageTier) => void;
}

const PortalContext = createContext<PortalContextValue>({
  impersonatingTenantId: null,
  setImpersonatingTenantId: () => {},
  effectiveTier: "cfo",
  setEffectiveTier: () => {},
});

export function PortalProvider({ children }: { children: ReactNode }) {
  const [impersonatingTenantId, setImpersonatingTenantId] = useState<number | null>(null);
  const [effectiveTier, setEffectiveTier] = useState<PackageTier>("cfo");

  return (
    <PortalContext.Provider
      value={{ impersonatingTenantId, setImpersonatingTenantId, effectiveTier, setEffectiveTier }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  return useContext(PortalContext);
}
