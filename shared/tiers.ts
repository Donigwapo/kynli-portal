export type PackageTier = "legacy" | "momentum" | "growth_1" | "growth_2" | "cfo";

export const PACKAGE_TIERS: PackageTier[] = ["legacy", "momentum", "growth_1", "growth_2", "cfo"];

export const PACKAGE_LABELS: Record<PackageTier, string> = {
  legacy: "Legacy",
  momentum: "Momentum",
  growth_1: "Growth 1",
  growth_2: "Growth 2",
  cfo: "CFO",
};

export const PACKAGE_PRICES: Record<PackageTier, string> = {
  legacy: "$575/mo",
  momentum: "$875+/mo",
  growth_1: "$1,350+/mo",
  growth_2: "$1,850+/mo",
  cfo: "$3,000+/mo",
};

export const PACKAGE_COLORS: Record<PackageTier, string> = {
  legacy: "text-slate-400 bg-slate-400/10",
  momentum: "text-blue-400 bg-blue-400/10",
  growth_1: "text-emerald-400 bg-emerald-400/10",
  growth_2: "text-violet-400 bg-violet-400/10",
  cfo: "text-amber-400 bg-amber-400/10",
};

/** Returns true if the tenant's tier meets or exceeds the required tier */
export function hasAccess(tenantTier: PackageTier, requiredTier: PackageTier): boolean {
  return PACKAGE_TIERS.indexOf(tenantTier) >= PACKAGE_TIERS.indexOf(requiredTier);
}

/** Tab visibility rules — minimum tier required per tab.
 * Tiers in order: legacy < momentum < growth_1 < growth_2 < cfo
 * Confirmed feature matrix:
 *   legacy:    overview, financials, documents, chat
 *   momentum:  + sales_tracker
 *   growth_1:  + time_intelligence, reports
 *   growth_2:  + clients, kpi_dashboard
 *   cfo:       all
 */
export const TAB_ACCESS: Record<string, PackageTier> = {
  overview:          "legacy",
  financials:        "legacy",
  documents:         "legacy",
  chat:              "legacy",
  coaching:          "legacy",
  sales_tracker:     "momentum",
  time_intelligence: "growth_1",
  reports:           "growth_1",
  clients:           "growth_2",
  kpi_dashboard:     "growth_2",
};
