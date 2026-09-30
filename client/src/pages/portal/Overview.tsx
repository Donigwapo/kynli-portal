import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const MUTED_FG = "oklch(0.50 0.008 240)";
const OPEN_ITEMS_DISPLAY_LIMIT = 5;

type OpenActionItemRow = {
  actionItemId: number;
  title: string;
  status: "open" | "in_progress";
  meetingId: number | null;
  meetingTitle: string | null;
  meetingDate: string | null;
};

function fmtD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function KpiCard({
  label,
  sublabel,
  value,
  budget,
  variance,
  variancePct,
  icon,
  invertGood = false,
}: {
  label: string;
  sublabel?: string;
  value: string;
  budget?: string;
  variance?: number;
  variancePct?: number;
  icon: ReactNode;
  invertGood?: boolean;
}) {
  const isGood = invertGood ? (variance ?? 0) <= 0 : (variance ?? 0) >= 0;
  const color = variance == null ? MUTED_FG : isGood ? GREEN : RED;
  const Arrow = isGood ? ArrowUpRight : ArrowDownRight;
  const sign = (variancePct ?? variance ?? 0) >= 0 ? "+" : "";

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          {sublabel ? <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sublabel}</div> : null}
        </div>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {budget && <div className="text-xs text-muted-foreground">Budget: {budget}</div>}
      {variance != null && (
        <div className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
          <Arrow size={12} />
          <span>
            {variancePct != null
              ? `${sign}${variancePct.toFixed(1)}% vs budget`
              : `${sign}${fmtD(Math.abs(variance))} vs budget`}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();
  const utils = trpc.useUtils();

  const now = new Date();
  const [year] = useState(now.getFullYear());

  const isStaffPortfolioUser = !!user && ["accounting_manager", "tax_manager", "accountant"].includes(user.role);
  const canEditPriorities = user?.role !== "client";

  const { data: tenant } = trpc.tenant.me.useQuery(undefined, {
    enabled: !impersonatingTenantSlug && !isStaffPortfolioUser,
  });

  const tslug = impersonatingTenantSlug ?? (!isStaffPortfolioUser ? tenant?.slug ?? null : null);
  const hasOverviewScope = isStaffPortfolioUser || !!tslug;
  const hasSingleCoachingScope = !!tslug || !isStaffPortfolioUser;
  const coachingCardsEnabled = hasOverviewScope && hasSingleCoachingScope;
  const coachingTenantSlug = tslug ?? undefined;

  const { data: financials = [] } = trpc.financials.get.useQuery(
    { year, tenantSlug: tslug ?? undefined },
    { enabled: hasOverviewScope, staleTime: 30_000 },
  );

  const { data: rosterData = [] } = trpc.roster.list.useQuery(
    { tenantSlug: tslug ?? undefined },
    { enabled: hasOverviewScope, staleTime: 30_000 },
  );

  const { data: salesByYear = [] } = trpc.sales.getByYear.useQuery(
    { year, tenantSlug: tslug ?? undefined },
    { enabled: hasOverviewScope, staleTime: 30_000 },
  );

  const latestPeriod = useMemo(() => {
    const withData = financials.filter((f) => (f.revenue ?? 0) > 0 || (f.expenses ?? 0) > 0);
    return withData[withData.length - 1] ?? financials[financials.length - 1] ?? null;
  }, [financials]);

  const { data: lineItemsData = [] } = trpc.financials.lineItems.useQuery(
    { year, month: latestPeriod?.month ?? now.getMonth() + 1, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug && !!latestPeriod, staleTime: 30_000 },
  );

  const prioritiesQuery = trpc.coaching.prioritiesList.useQuery(
    { year, tenantSlug: coachingTenantSlug },
    { enabled: coachingCardsEnabled, staleTime: 10_000 },
  );

  const togglePriorityMutation = trpc.coaching.prioritiesToggle.useMutation({
    onSuccess: async () => {
      await prioritiesQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Unable to update priority."),
  });

  const meetingsQuery = trpc.coaching.meetingsList.useQuery(
    { tenantSlug: coachingTenantSlug },
    { enabled: coachingCardsEnabled, staleTime: 30_000 },
  );

  const actionItemStatusMutation = trpc.coaching.meetingActionItemsUpdateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        meetingsQuery.refetch(),
        utils.coaching.clientActionItemsList.invalidate({ tenantSlug: coachingTenantSlug }),
      ]);
    },
    onError: (err) => toast.error(err.message || "Unable to update action item status."),
  });

  const meetings = (meetingsQuery.data as Array<any>) || [];
  const [openActionItems, setOpenActionItems] = useState<OpenActionItemRow[]>([]);
  const [openItemsLoading, setOpenItemsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOpenItems() {
      if (!coachingCardsEnabled || !coachingTenantSlug) {
        setOpenActionItems([]);
        return;
      }
      setOpenItemsLoading(true);
      try {
        const rows: OpenActionItemRow[] = [];

        const standalone = await utils.coaching.clientActionItemsList.fetch({ tenantSlug: coachingTenantSlug });
        for (const item of (standalone as Array<any>) || []) {
          const status = String(item?.status || "open");
          if (status === "completed") continue;

          rows.push({
            actionItemId: Number(item.id),
            title: String(item.title || "Untitled action item"),
            status: status === "in_progress" ? "in_progress" : "open",
            meetingId: item.meeting_id == null ? null : Number(item.meeting_id),
            meetingTitle: null,
            meetingDate: null,
          });
        }

        if (meetings.length > 0) {
          const details = await Promise.all(
            meetings.map((m) =>
              utils.coaching.meetingsGet.fetch({ id: Number(m.id), tenantSlug: coachingTenantSlug }),
            ),
          );

          if (cancelled) return;

          const seen = new Set<number>(rows.map((r) => r.actionItemId));

          for (const detail of details) {
            const meeting = (detail as any)?.meeting;
            const actionItems = Array.isArray((detail as any)?.actionItems) ? (detail as any).actionItems : [];

            for (const item of actionItems) {
              const itemId = Number(item.id);
              if (seen.has(itemId)) continue;

              const status = String(item?.status || "open");
              if (status === "completed") continue;

              rows.push({
                actionItemId: itemId,
                title: String(item.title || "Untitled action item"),
                status: status === "in_progress" ? "in_progress" : "open",
                meetingId: Number(meeting?.id ?? 0) || null,
                meetingTitle: String(meeting?.title || "Client Meeting"),
                meetingDate: meeting?.meeting_date ? String(meeting.meeting_date) : null,
              });
              seen.add(itemId);
            }
          }
        }

        setOpenActionItems(rows);
      } catch (err: any) {
        if (!cancelled) {
          setOpenActionItems([]);
          toast.error(err?.message || "Unable to load open action items.");
        }
      } finally {
        if (!cancelled) setOpenItemsLoading(false);
      }
    }

    void loadOpenItems();

    return () => {
      cancelled = true;
    };
  }, [coachingCardsEnabled, coachingTenantSlug, meetings, utils.coaching.meetingsGet, utils.coaching.clientActionItemsList]);

  const latestRevenue = latestPeriod?.revenue ?? 0;
  const latestExpenses = latestPeriod?.expenses ?? 0;
  const latestNetProfit = latestPeriod?.net_profit ?? 0;
  const latestNetMarginPct = latestPeriod?.net_profit_margin ?? 0;

  const latestBudgetRevenue = latestPeriod?.budget_revenue ?? 0;
  const latestBudgetExpenses = latestPeriod?.budget_expenses ?? 0;

  const latestCogs = (latestPeriod as any)?.cogs_actual ?? 0;
  const latestOtherIncome = (latestPeriod as any)?.other_income_actual ?? 0;
  const latestOtherExpense = (latestPeriod as any)?.other_expense_actual ?? 0;
  const latestCogsBudget = (latestPeriod as any)?.cogs_budget ?? 0;
  const latestOtherIncomeBudget = (latestPeriod as any)?.other_income_budget ?? 0;
  const latestOtherExpenseBudget = (latestPeriod as any)?.other_expense_budget ?? 0;

  const latestBudgetNetProfit =
    latestBudgetRevenue - latestCogsBudget - latestBudgetExpenses + latestOtherIncomeBudget - latestOtherExpenseBudget;
  const latestBudgetNetMarginPct =
    latestBudgetRevenue > 0 ? (latestBudgetNetProfit / latestBudgetRevenue) * 100 : 0;

  const activeClients = rosterData.filter((c: any) => c.status === "active").length;

  const ytdSigned = useMemo(() => salesByYear.reduce((s, m) => s + (m.signed_clients ?? 0), 0), [salesByYear]);
  const annualTarget = useMemo(() => salesByYear.reduce((s, m) => s + (m.goal_clients ?? 0), 0), [salesByYear]);
  const salesProgressPct = annualTarget > 0 ? Math.min((ytdSigned / annualTarget) * 100, 100) : 0;
  const clientsRemaining = Math.max(annualTarget - ytdSigned, 0);

  const availableFinancialPeriods = useMemo(
    () => [...financials].filter((r) => typeof r.month === "number").sort((a, b) => (a.month ?? 0) - (b.month ?? 0)),
    [financials],
  );

  const actualVsBudgetChartData = useMemo(
    () =>
      availableFinancialPeriods.map((row) => {
        const budgetRaw = (row as any).budget_revenue;
        const hasBudget = budgetRaw !== null && budgetRaw !== undefined;
        return {
          month: MONTHS[(row.month ?? 1) - 1],
          actualRevenue: row.revenue ?? 0,
          budgetRevenue: hasBudget ? Number(budgetRaw) : null,
        };
      }),
    [availableFinancialPeriods],
  );

  const revenueTrendData = useMemo(
    () =>
      availableFinancialPeriods.map((row) => ({
        month: MONTHS[(row.month ?? 1) - 1],
        revenue: row.revenue ?? 0,
      })),
    [availableFinancialPeriods],
  );

  const activeClientMix = useMemo(() => {
    const active = rosterData.filter((c: any) => c.status === "active");
    const counts = new Map<string, number>();
    for (const row of active) {
      const key = String((row as any).package ?? "Unassigned").trim() || "Unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rosterData]);

  const mixColors = [
    "oklch(0.75 0.15 192)",
    "oklch(0.68 0.18 145)",
    "oklch(0.78 0.16 60)",
    "oklch(0.65 0.15 270)",
    "oklch(0.62 0.22 25)",
    "oklch(0.62 0.12 325)",
    "oklch(0.70 0.06 240)",
  ];

  const incomeItems = lineItemsData.filter((li) => li.type === "income");
  const expenseItems = lineItemsData.filter((li) => li.type === "expense");
  const totalIncome = incomeItems.reduce((s, li) => s + (li.amount ?? 0), 0) || 1;
  const totalExp = expenseItems.reduce((s, li) => s + (li.amount ?? 0), 0) || 1;
  const topIncome = [...incomeItems].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5);
  const topExpenses = [...expenseItems].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5);

  const periodLabel = latestPeriod ? `${MONTHS[latestPeriod.month - 1]} ${latestPeriod.year}` : `${MONTHS[now.getMonth()]} ${year}`;

  const revVariancePct = latestBudgetRevenue > 0 ? (latestRevenue / latestBudgetRevenue) * 100 - 100 : 0;
  const expVariancePct = latestBudgetExpenses > 0 ? (latestExpenses / latestBudgetExpenses) * 100 - 100 : 0;
  const profitVariancePct = latestBudgetNetProfit > 0 ? (latestNetProfit / latestBudgetNetProfit) * 100 - 100 : 0;
  const marginVariancePct = latestNetMarginPct - latestBudgetNetMarginPct;

  const priorities = (prioritiesQuery.data as Array<any>) || [];
  const openPriorities = priorities.filter((p) => !p.completed);
  const displayedOpenPriorities = openPriorities.slice(0, OPEN_ITEMS_DISPLAY_LIMIT);

  const displayedOpenActionItems = openActionItems.slice(0, OPEN_ITEMS_DISPLAY_LIMIT);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Strategic Overview</h1>
          <p className="text-sm text-foreground/70 mt-0.5">Latest period: {periodLabel} · {year} YTD</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20">
          <Users size={14} />
          <span>{activeClients} Active Clients</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Revenue"
          sublabel={periodLabel}
          value={fmtD(latestRevenue)}
          budget={fmtD(latestBudgetRevenue)}
          variance={latestRevenue - latestBudgetRevenue}
          variancePct={revVariancePct}
          icon={<DollarSign size={16} />}
        />
        <KpiCard
          label="Expenses"
          sublabel={periodLabel}
          value={fmtD(latestExpenses)}
          budget={fmtD(latestBudgetExpenses)}
          variance={latestExpenses - latestBudgetExpenses}
          variancePct={expVariancePct}
          icon={<TrendingDown size={16} />}
          invertGood
        />
        <KpiCard
          label="Net Profit"
          sublabel={periodLabel}
          value={fmtD(latestNetProfit)}
          budget={fmtD(latestBudgetNetProfit)}
          variance={latestNetProfit - latestBudgetNetProfit}
          variancePct={profitVariancePct}
          icon={<TrendingUp size={16} />}
        />
        <KpiCard
          label="Net Margin"
          sublabel={periodLabel}
          value={fmtPct(latestNetMarginPct)}
          budget={`${latestBudgetNetMarginPct.toFixed(1)}%`}
          variance={marginVariancePct}
          variancePct={marginVariancePct}
          icon={<Percent size={16} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Top Income Sources <span className="text-xs font-normal text-foreground/70">({periodLabel})</span>
          </h2>
          {topIncome.length === 0 ? (
            <p className="text-xs text-muted-foreground">No income data for this period.</p>
          ) : (
            <div className="space-y-3">
              {topIncome.map((item) => {
                const amt = item.amount ?? 0;
                const pct = (amt / totalIncome) * 100;
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-foreground truncate max-w-[55%]">{item.label}</span>
                      <span>
                        <span className="font-semibold" style={{ color: TEAL }}>{fmtD(amt)}</span>
                        <span className="text-muted-foreground ml-1.5">{fmtPct(pct)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: TEAL }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Top Expenses <span className="text-xs font-normal text-foreground/70">({periodLabel})</span>
          </h2>
          {topExpenses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No expense data for this period.</p>
          ) : (
            <div className="space-y-3">
              {topExpenses.map((item) => {
                const amt = item.amount ?? 0;
                const pct = (amt / totalExp) * 100;
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-foreground truncate max-w-[55%]">{item.label}</span>
                      <span>
                        <span className="font-semibold" style={{ color: RED }}>{fmtD(amt)}</span>
                        <span className="text-muted-foreground ml-1.5">{fmtPct(pct)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: RED }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-sm font-semibold text-foreground">{year} Coaching Priorities</h2>
            <span className="text-xs text-foreground/70">{openPriorities.length} open</span>
          </div>

          {!coachingCardsEnabled ? (
            <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">
              Select a client via “Viewing as client” to manage coaching priorities.
            </div>
          ) : prioritiesQuery.isLoading ? (
            <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">Loading priorities…</div>
          ) : prioritiesQuery.isError ? (
            <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">Unable to load priorities for this client.</div>
          ) : (
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {openPriorities.length > 0 ? (
                <>
                  {displayedOpenPriorities.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] px-3 py-2">
                      <Checkbox
                        checked={!!p.completed}
                        onCheckedChange={(checked) => {
                          if (!canEditPriorities) return;
                          togglePriorityMutation.mutate({ id: p.id, completed: checked === true, tenantSlug: coachingTenantSlug });
                        }}
                        disabled={!canEditPriorities || togglePriorityMutation.isPending}
                        className="border-[oklch(0.30_0.01_240)] bg-[oklch(0.13_0.004_240)]"
                      />
                      <Link
                        href="/portal/coaching"
                        className="text-sm text-foreground hover:text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded-sm truncate"
                        title={p.title}
                      >
                        {p.title}
                      </Link>
                    </div>
                  ))}
                  {openPriorities.length > OPEN_ITEMS_DISPLAY_LIMIT ? (
                    <div className="pt-1">
                      <Link
                        href="/portal/coaching"
                        className="text-xs text-primary hover:text-primary/90 hover:underline"
                      >
                        View all {openPriorities.length} open priorities →
                      </Link>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-3 text-sm text-muted-foreground">No open coaching priorities.</div>
              )}
            </div>
          )}
        </div>

        <div id="client-action-items" className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-sm font-semibold text-foreground">Client Action Items</h2>
            <span className="text-xs text-foreground/70">{openActionItems.length} open</span>
          </div>

          {!coachingCardsEnabled ? (
            <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">
              Select a client via “Viewing as client” to view open client action items.
            </div>
          ) : meetingsQuery.isLoading || openItemsLoading ? (
            <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">Loading open action items…</div>
          ) : meetingsQuery.isError ? (
            <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">Unable to load client meetings.</div>
          ) : (
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {openActionItems.length === 0 ? (
                <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-3 text-sm text-muted-foreground">No open client action items.</div>
              ) : (
                <>
                  {displayedOpenActionItems.map((row) => (
                    <div key={row.actionItemId} className="flex items-start gap-3 rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] px-3 py-2.5">
                      <Checkbox
                        checked={false}
                        onCheckedChange={(checked) => {
                          if (checked !== true) return;
                          void actionItemStatusMutation.mutateAsync({
                            id: row.actionItemId,
                            status: "completed",
                            tenantSlug: coachingTenantSlug,
                          });
                        }}
                        disabled={actionItemStatusMutation.isPending}
                        className="border-[oklch(0.30_0.01_240)] bg-[oklch(0.13_0.004_240)]"
                      />
                      <div className="min-w-0 flex-1">
                        {row.meetingId ? (
                          <Link
                            href="/portal/coaching/client-meeting"
                            className="block text-sm text-foreground hover:text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded-sm truncate"
                            title={row.title}
                          >
                            {row.title}
                          </Link>
                        ) : (
                          <span className="block text-sm text-foreground truncate" title={row.title}>{row.title}</span>
                        )}
                        {row.meetingId ? (
                          <p className="text-xs text-foreground/70 mt-0.5 truncate">
                            {row.meetingTitle} · {fmtDate(row.meetingDate)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {openActionItems.length > OPEN_ITEMS_DISPLAY_LIMIT ? (
                    <div className="pt-1">
                      <Link
                        href="/portal/coaching/client-meeting"
                        className="text-xs text-primary hover:text-primary/90 hover:underline"
                      >
                        View all {openActionItems.length} open action items →
                      </Link>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Executive Performance</h2>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">{year} Sales Target</h3>
              <p className="text-xs text-foreground/70 mt-1">Clients signed vs annual client target</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-3">
                <p className="text-xs text-foreground/70">Clients signed</p>
                <p className="text-2xl font-semibold text-foreground mt-1">{ytdSigned}</p>
              </div>
              <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-3">
                <p className="text-xs text-foreground/70">Annual client target</p>
                <p className="text-2xl font-semibold text-foreground mt-1">{annualTarget}</p>
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-foreground/70">Progress</span>
              <span className="font-semibold" style={{ color: salesProgressPct >= 100 ? GREEN : TEAL }}>
                {fmtPct(salesProgressPct)}
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{ width: `${salesProgressPct}%`, backgroundColor: salesProgressPct >= 100 ? GREEN : TEAL }}
              />
            </div>
            <p className="text-xs text-foreground/70 mb-4">{clientsRemaining} clients remaining</p>

            <Link href="/portal/sales" className="inline-flex items-center text-xs text-primary hover:underline">
              Manage annual goal in Sales Tracker
            </Link>
          </div>

          <div className="xl:col-span-3 bg-card border border-border rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground">Actuals vs Budget</h3>
              <p className="text-xs text-foreground/70 mt-1">Available periods only · {year}</p>
            </div>

            {actualVsBudgetChartData.length === 0 ? (
              <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">
                No financial periods available for this year.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={actualVsBudgetChartData} margin={{ top: 6, right: 16, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round((v as number) / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(v: any, name: any) => [v == null ? "—" : fmtD(Number(v)), name === "actualRevenue" ? "Actual Revenue" : "Budget Revenue"]}
                  />
                  <Bar dataKey="actualRevenue" name="Actual Revenue" fill={TEAL} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="budgetRevenue" name="Budget Revenue" fill={GREEN} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground">Revenue Trend</h3>
              <p className="text-xs text-foreground/70 mt-1">Actual revenue across available periods · {year}</p>
            </div>

            {revenueTrendData.length === 0 ? (
              <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">
                No revenue periods available for this year.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueTrendData} margin={{ top: 6, right: 16, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round((v as number) / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(v: number) => [fmtD(v), "Revenue"]}
                  />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke={TEAL} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground">Active Client Mix</h3>
              <p className="text-xs text-foreground/70 mt-1">Grouped by active package/tier</p>
            </div>

            {activeClientMix.length === 0 ? (
              <div className="rounded-lg border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] p-4 text-sm text-muted-foreground">
                No active clients available.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-center">
                <div className="flex justify-center">
                  <PieChart width={170} height={170}>
                    <Pie
                      data={activeClientMix}
                      cx={85}
                      cy={85}
                      innerRadius={46}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {activeClientMix.map((entry, idx) => (
                        <Cell key={entry.name} fill={mixColors[idx % mixColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 11 }}
                      formatter={(v: number, name: string) => [v, name]}
                    />
                  </PieChart>
                </div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {activeClientMix.map((entry, idx) => (
                    <div key={entry.name} className="flex items-center justify-between text-xs rounded-md border border-[oklch(0.18_0.004_240)] bg-[oklch(0.12_0.004_240)] px-2.5 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: mixColors[idx % mixColors.length] }} />
                        <span className="text-foreground/70 truncate">{entry.name}</span>
                      </div>
                      <span className="font-semibold text-foreground">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
