import { createContext, useContext, useState, ReactNode } from "react";
import type { PackageTier } from "../../../shared/tiers";
interface PortalContextValue {
  /** When admin is impersonating, this is the target tenant slug */
  impersonatingTenantSlug: string | null;
  setImpersonatingTenantSlug: (slug: string | null) => void;
  /** Effective package tier (from real tenant or impersonated tenant) */
  effectiveTier: PackageTier;
  setEffectiveTier: (tier: PackageTier) => void;
  /** Optional AI context derived from currently selected Coaching trigger period */
  aiCoachingPeriod: { year: number; month: number } | null;
  setAiCoachingPeriod: (value: { year: number; month: number } | null) => void;
}
const PortalContext = createContext<PortalContextValue>({
  impersonatingTenantSlug: null,
  setImpersonatingTenantSlug: () => {},
  effectiveTier: "cfo",
  setEffectiveTier: () => {},
  aiCoachingPeriod: null,
  setAiCoachingPeriod: () => {},
});
export function PortalProvider({ children }: { children: ReactNode }) {
  const [impersonatingTenantSlug, setImpersonatingTenantSlug] = useState<string | null>(null);
  const [effectiveTier, setEffectiveTier] = useState<PackageTier>("cfo");
  const [aiCoachingPeriod, setAiCoachingPeriod] = useState<{ year: number; month: number } | null>(null);
  return (
    <PortalContext.Provider
      value={{
        impersonatingTenantSlug,
        setImpersonatingTenantSlug,
        effectiveTier,
        setEffectiveTier,
        aiCoachingPeriod,
        setAiCoachingPeriod,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}
export function usePortal() {
  return useContext(PortalContext);
}
