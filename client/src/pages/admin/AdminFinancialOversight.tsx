import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, CircleAlert, Link2, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { usePortal } from "@/contexts/PortalContext";

const COVERAGE_LABELS: Record<string, string> = {
  current_year_only: "Current year only",
  include_previous_years: "Include previous years",
  custom_start_month: "Custom reporting start month",
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  skipped_financial_month: "Skipped Month",
  all_zero_financial_period: "All-Zero Financials",
  invalid_financial_data: "Invalid Financial Data",
};

const ISSUE_TYPE_BADGE_STYLES: Record<string, string> = {
  skipped_financial_month: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  all_zero_financial_period: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  invalid_financial_data: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => String(CURRENT_YEAR - 20 + i));
const YEAR_FILTERS = ["all", ...YEARS].sort((a, b) => {
  if (a === "all") return -1;
  if (b === "all") return 1;
  return Number(b) - Number(a);
});
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function AdminFinancialOversight() {
  const [, navigate] = useLocation();
  const { setImpersonatingTenantSlug } = usePortal();
  const { data: tenants = [] } = trpc.tenant.list.useQuery();

  // Issues tab state
  const [issuesClientFilter, setIssuesClientFilter] = useState<string>("all");
  const [issuesYearFilter, setIssuesYearFilter] = useState<string>("all");
  const [issuesTypeFilter, setIssuesTypeFilter] = useState<string>("all");
  const [openingFinancialTenantSlug, setOpeningFinancialTenantSlug] = useState<string | null>(null);

  // Settings tab state
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>("");

  const selectedTenant = useMemo(
    () => (tenants as any[]).find((t) => String(t?.slug ?? "") === selectedTenantSlug) ?? null,
    [tenants, selectedTenantSlug],
  );

  const issuesQuery = trpc.financials.validationSkippedMonthsSummary.useQuery(
    {
      tenantSlug: issuesClientFilter !== "all" ? issuesClientFilter : undefined,
      year: issuesYearFilter !== "all" ? Number(issuesYearFilter) : undefined,
    },
    {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  );

  const settingsQuery = trpc.financials.getValidationSettings.useQuery(
    { tenantSlug: selectedTenantSlug },
    { enabled: !!selectedTenantSlug },
  );


  const updateSettings = trpc.financials.updateValidationSettings.useMutation({
    onSuccess: (res) => {
      toast.success("Financial validation settings saved.");
      setDraftCoverageMode(String(res.coverageMode));
      setDraftCustomYear(res.customStartYear == null ? "" : String(res.customStartYear));
      setDraftCustomMonth(res.customStartMonth == null ? "" : String(res.customStartMonth));
      settingsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save settings.");
    },
  });

  const loaded = settingsQuery.data;

  const issues = issuesQuery.data?.issues ?? [];

  const filteredIssues = useMemo(() => {
    if (issuesTypeFilter === "all") return issues;
    return issues.filter((i: any) => String(i.ruleId) === issuesTypeFilter);
  }, [issues, issuesTypeFilter]);
  const [draftCoverageMode, setDraftCoverageMode] = useState<string>("current_year_only");
  const [draftCustomYear, setDraftCustomYear] = useState<string>("");
  const [draftCustomMonth, setDraftCustomMonth] = useState<string>("");

  // sync form state whenever selected tenant or server payload changes
  useEffect(() => {
    if (!loaded) return;
    setDraftCoverageMode(String(loaded.coverageMode ?? "current_year_only"));
    setDraftCustomYear(loaded.customStartYear == null ? "" : String(loaded.customStartYear));
    setDraftCustomMonth(loaded.customStartMonth == null ? "" : String(loaded.customStartMonth));
  }, [selectedTenantSlug, loaded?.coverageMode, loaded?.customStartYear, loaded?.customStartMonth]);

  const isCustom = draftCoverageMode === "custom_start_month";

  const hasUnsavedChanges = !!loaded && (
    String(loaded.coverageMode ?? "") !== String(draftCoverageMode)
    || String(loaded.customStartYear ?? "") !== String(draftCustomYear || "")
    || String(loaded.customStartMonth ?? "") !== String(draftCustomMonth || "")
  );

  function validateDraft(): string | null {
    if (!selectedTenantSlug) return "Please select a client.";
    if (draftCoverageMode !== "custom_start_month") return null;

    const year = Number(draftCustomYear);
    const month = Number(draftCustomMonth);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return "Custom start year must be between 2000 and 2100.";
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return "Custom start month must be between 1 and 12.";
    }
    return null;
  }

  function resetToLoaded() {
    if (!loaded) return;
    setDraftCoverageMode(String(loaded.coverageMode ?? "current_year_only"));
    setDraftCustomYear(loaded.customStartYear == null ? "" : String(loaded.customStartYear));
    setDraftCustomMonth(loaded.customStartMonth == null ? "" : String(loaded.customStartMonth));
  }

  async function onSave() {
    const validationError = validateDraft();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    await updateSettings.mutateAsync({
      tenantSlug: selectedTenantSlug,
      coverageMode: draftCoverageMode as "current_year_only" | "include_previous_years" | "custom_start_month",
      customStartYear: isCustom ? Number(draftCustomYear) : null,
      customStartMonth: isCustom ? Number(draftCustomMonth) : null,
    });
  }

  async function onViewFinancials(tenantSlug: string) {
    if (!tenantSlug) return;
    try {
      setOpeningFinancialTenantSlug(tenantSlug);
      const res = await fetch("/api/auth/view-as-client/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantSlug }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({} as any));
        throw new Error(payload?.error || "Failed to open client financials.");
      }

      const payload = await res.json().catch(() => ({} as any));
      setImpersonatingTenantSlug(tenantSlug);
      navigate("/portal/financials");
      toast.success(`Viewing financials for ${payload?.workspace?.companyName ?? tenantSlug}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to open client financials.");
    } finally {
      setOpeningFinancialTenantSlug(null);
    }
  }

  function formatPeriod(year: number, month: number): string {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return `${year}-${month}`;
    }
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return (
    <div className="p-6 space-y-6 w-full max-w-7xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-700 dark:text-amber-400">
          <ShieldAlert size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Oversight</h1>
          <p className="text-sm text-muted-foreground">Monitor financial reporting completeness across clients.</p>
        </div>
      </div>

      <Tabs defaultValue="issues" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Financial Validation Issues</CardTitle>
              <CardDescription>
                Read-only multi-rule findings across active clients, respecting each client's saved coverage settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={issuesClientFilter} onValueChange={setIssuesClientFilter}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All clients</SelectItem>
                      {(tenants as any[]).map((t) => (
                        <SelectItem key={String(t.slug)} value={String(t.slug)}>
                          {String(t.company_name ?? t.slug)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reporting year</Label>
                  <Select value={issuesYearFilter} onValueChange={setIssuesYearFilter}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_FILTERS.map((y) => (
                        <SelectItem key={y} value={y}>{y === "all" ? "All years" : y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Issue type</Label>
                  <Select value={issuesTypeFilter} onValueChange={setIssuesTypeFilter}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All issue types</SelectItem>
                      <SelectItem value="skipped_financial_month">Skipped months</SelectItem>
                      <SelectItem value="all_zero_financial_period">All-zero financials</SelectItem>
                      <SelectItem value="invalid_financial_data">Invalid financial data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {issuesQuery.isLoading ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">Loading issues...</div>
              ) : issuesQuery.error ? (
                <div className="rounded-md border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5" />
                  <div>{issuesQuery.error.message}</div>
                </div>
              ) : (
                <>
                  {filteredIssues.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                      No financial validation findings for the current filters.
                    </div>
                  ) : (
                    <div className="rounded-md border border-border overflow-auto">
                      <table className="w-full min-w-[980px] text-sm">
                        <thead className="bg-muted/30 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2 w-[18%]">Client</th>
                            <th className="text-left px-3 py-2 w-[14%]">Reporting period</th>
                            <th className="text-left px-3 py-2 w-[18%]">Issue type</th>
                            <th className="text-left px-3 py-2 w-[34%]">Description</th>
                            <th className="text-left px-3 py-2 w-[8%]">Status</th>
                            <th className="text-left px-3 py-2 w-[8%]">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredIssues.map((row: any, idx: number) => {
                            const issueType = String(row.ruleId);
                            const issueLabel = ISSUE_TYPE_LABELS[issueType] ?? issueType;
                            const issueBadgeStyle = ISSUE_TYPE_BADGE_STYLES[issueType] ?? "bg-muted text-foreground";
                            return (
                              <tr key={`${row.tenantSlug}-${row.year}-${row.month}-${row.ruleId}-${idx}`} className="border-t border-border align-top">
                                <td className="px-3 py-3">{row.companyName}</td>
                                <td className="px-3 py-3">{formatPeriod(Number(row.year), Number(row.month))}</td>
                                <td className="px-3 py-3">
                                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${issueBadgeStyle}`}>
                                    <CircleAlert size={12} />
                                    {issueLabel}
                                  </span>
                                </td>
                                <td className="px-3 py-3 leading-relaxed">{row.description}</td>
                                <td className="px-3 py-3"><span className="inline-flex rounded px-2 py-0.5 text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400">Needs Review</span></td>
                                <td className="px-3 py-3">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2"
                                    onClick={() => onViewFinancials(String(row.tenantSlug || ""))}
                                    disabled={openingFinancialTenantSlug === String(row.tenantSlug || "")}
                                  >
                                    <Link2 size={13} className="mr-1" />
                                    {openingFinancialTenantSlug === String(row.tenantSlug || "") ? "Opening..." : "View Financials"}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Financial Validation Settings</CardTitle>
              <CardDescription>
                These settings control which reporting periods are eligible for skipped-month validation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={selectedTenantSlug} onValueChange={(slug) => {
                  setSelectedTenantSlug(slug);
                }}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenants as any[]).map((t) => (
                      <SelectItem key={String(t.slug)} value={String(t.slug)}>
                        {String(t.company_name ?? t.slug)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedTenantSlug ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Select a client to view and edit settings.
                </div>
              ) : settingsQuery.isLoading ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Loading settings...
                </div>
              ) : settingsQuery.error ? (
                <div className="rounded-md border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5" />
                  <div>{settingsQuery.error.message}</div>
                </div>
              ) : loaded ? (
                <>
                  <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">Selected client: {selectedTenant?.company_name ?? selectedTenant?.slug ?? selectedTenantSlug}</div>
                    <div className="text-muted-foreground mt-1">
                      Current mode: {COVERAGE_LABELS[String(loaded.coverageMode)] ?? String(loaded.coverageMode)}
                    </div>
                    {loaded.isDefault ? (
                      <div className="text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={14} />
                        Using default settings (not customized yet).
                      </div>
                    ) : (
                      <div className="text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1">
                        <CheckCircle2 size={14} />
                        Customized settings are active.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Coverage mode</Label>
                    <Select value={draftCoverageMode} onValueChange={setDraftCoverageMode}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current_year_only">Current year only</SelectItem>
                        <SelectItem value="include_previous_years">Include previous years</SelectItem>
                        <SelectItem value="custom_start_month">Custom reporting start month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {isCustom && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Custom start year</Label>
                        <Select value={draftCustomYear} onValueChange={setDraftCustomYear}>
                          <SelectTrigger className="bg-background border-border">
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                          <SelectContent>
                            {YEARS.map((y) => (
                              <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Custom start month</Label>
                        <Select value={draftCustomMonth} onValueChange={setDraftCustomMonth}>
                          <SelectTrigger className="bg-background border-border">
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((m, idx) => (
                              <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Button onClick={onSave} disabled={!hasUnsavedChanges || updateSettings.isPending}>
                      {updateSettings.isPending ? "Saving..." : "Save settings"}
                    </Button>
                    <Button variant="outline" onClick={resetToLoaded} disabled={!hasUnsavedChanges || updateSettings.isPending}>
                      Reset
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
