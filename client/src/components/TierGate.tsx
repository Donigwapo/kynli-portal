import { ReactNode } from "react";
import { usePortal } from "../contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import { TAB_ACCESS, hasAccess, type PackageTier } from "../../../shared/tiers";
import { Lock } from "lucide-react";

interface TierGateProps {
  /** The TAB_ACCESS key for the feature this route requires */
  featureKey: string;
  children: ReactNode;
}

const TIER_LABELS: Record<PackageTier, string> = {
  legacy: "Legacy",
  momentum: "Momentum",
  growth_1: "Growth 1",
  growth_2: "Growth 2",
  cfo: "CFO",
};

const FEATURE_LABELS: Record<string, string> = {
  sales_tracker: "Sales Tracker",
  coaching: "Coaching & Accountability",
  time_intelligence: "Time Intelligence",
  reports: "Reports",
  clients: "Client Roster",
  kpi_dashboard: "KPI Dashboard",
};

/**
 * TierGate — wraps a portal route and shows an upgrade message if the
 * current user's package tier does not include the required feature.
 *
 * Admins bypass all tier checks (they can view any page).
 */
export default function TierGate({ featureKey, children }: TierGateProps) {
  const { user } = useAuth();
  const { impersonatingTenantSlug, effectiveTier } = usePortal();
  const isStaffOrAdmin = !!user && ["admin", "accounting_manager", "tax_manager", "accountant"].includes(user.role);

  // Staff/admin should never receive client package gating in normal mode.
  if (isStaffOrAdmin && !impersonatingTenantSlug) {
    return <>{children}</>;
  }

  // Fetch real tenant tier (only for non-impersonating client sessions)
  const { data: tenant, isLoading } = trpc.tenant.me.useQuery(undefined, {
    enabled: !impersonatingTenantSlug,
  });

  const activeTier: PackageTier = impersonatingTenantSlug
    ? effectiveTier
    : (tenant?.package_tier ?? "legacy") as PackageTier;

  const requiredTier = (TAB_ACCESS[featureKey] ?? "legacy") as PackageTier;
  const allowed = hasAccess(activeTier, requiredTier);

  // While loading, render nothing (RouteGuard already shows a spinner above)
  if (isLoading && !impersonatingTenantSlug) return null;

  if (!allowed) {
    const featureLabel = FEATURE_LABELS[featureKey] ?? featureKey;
    const requiredLabel = TIER_LABELS[requiredTier] ?? requiredTier;
    const currentLabel = TIER_LABELS[activeTier] ?? activeTier;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="rounded-full bg-white/5 p-5 mb-6">
          <Lock className="w-10 h-10 text-[#00C2CB]" />
        </div>
        <h2 className="text-2xl font-semibold text-white mb-2">
          {featureLabel} is not included in your plan
        </h2>
        <p className="text-white/60 max-w-md mb-1">
          Your current package is <span className="text-white font-medium">{currentLabel}</span>.
          This feature requires the{" "}
          <span className="text-[#00C2CB] font-medium">{requiredLabel}</span> package or higher.
        </p>
        <p className="text-white/40 text-sm mt-4">
          Contact your KynLi advisor to upgrade your package and unlock this feature.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
