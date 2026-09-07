import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Users,
  Plus,
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
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const MUTED_FG = "oklch(0.50 0.008 240)";

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

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function KpiCard({
  label,
  value,
  budget,
  variance,
  variancePct,
  icon,
  invertGood = false,
}: {
  label: string;
  value: string;
  budget?: string;
  variance?: number;
  variancePct?: number;
  icon: React.ReactNode;
  invertGood?: boolean;
}) {
  const isGood = invertGood ? (variance ?? 0) <= 0 : (variance ?? 0) >= 0;
  const color = variance == null ? MUTED_FG : isGood ? GREEN : RED;
  const Arrow = isGood ? ArrowUpRight : ArrowDownRight;
  const sign = (variancePct ?? variance ?? 0) >= 0 ? "+" : "";

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
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
  const now = new Date();
  const [year] = useState(now.getFullYear());

  const isStaffPortfolioUser = !!user && ["accounting_manager", "tax_manager", "accountant"].includes(user.role);
  const canEditPriorities = user?.role !== "client";
  const canEditActionItems = user?.role !== "client";

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

  const createPriorityMutation = trpc.coaching.prioritiesCreate.useMutation({
    onSuccess: async () => {
      await prioritiesQuery.refetch();
      setNewPriorityTitle("");
    },
    onError: (err) => toast.error(err.message || "Unable to create priority."),
  });

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

  const createMeetingMutation = trpc.coaching.meetingsCreate.useMutation();
  const upsertItemsMutation = trpc.coaching.meetingActionItemsUpsertBatch.useMutation();

  const [newPriorityTitle, setNewPriorityTitle] = useState("");
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [selectedMeetingDate, setSelectedMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [actionItemText, setActionItemText] = useState("");
  const [actionSaveStatus, setActionSaveStatus] = useState<string | null>(null);

  const meetings = (meetingsQuery.data as Array<any>) || [];

  const detailQuery = trpc.coaching.meetingsGet.useQuery(
    { id: selectedMeetingId ?? 0, tenantSlug: coachingTenantSlug },
    { enabled: coachingCardsEnabled && !!selectedMeetingId },
  );

  const ytdRevenue = useMemo(() => financials.reduce((s, f) => s + (f.revenue ?? 0), 0), [financials]);
  const ytdExpenses = useMemo(() => financials.reduce((s, f) => s + (f.expenses ?? 0), 0), [financials]);
  const ytdProfit = ytdRevenue - ytdExpenses;
  const ytdMargin = ytdRevenue > 0 ? (ytdProfit / ytdRevenue) * 100 : 0;
  const ytdBudgetRevenue = useMemo(() => financials.reduce((s, f) => s + (f.budget_revenue ?? 0), 0), [financials]);
  const ytdBudgetExpenses = useMemo(() => financials.reduce((s, f) => s + (f.budget_expenses ?? 0), 0), [financials]);
  const ytdBudgetProfit = ytdBudgetRevenue - ytdBudgetExpenses;

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

  const revVariancePct = ytdBudgetRevenue > 0 ? (ytdRevenue / ytdBudgetRevenue) * 100 - 100 : 0;
  const expVariancePct = ytdBudgetExpenses > 0 ? (ytdExpenses / ytdBudgetExpenses) * 100 - 100 : 0;
  const profitVariancePct = ytdBudgetProfit > 0 ? (ytdProfit / ytdBudgetProfit) * 100 - 100 : 0;

  const priorities = (prioritiesQuery.data as Array<any>) || [];
  const openPriorities = priorities.filter((p) => !p.completed);
  const completedPriorities = priorities.filter((p) => !!p.completed);

  const selectedMeetingActionItems = (detailQuery.data?.actionItems as Array<any> | undefined) ?? [];
  const selectedMeetingSavedCount = selectedMeetingActionItems.length;

  const savingActionItems = createMeetingMutation.isPending || upsertItemsMutation.isPending;

  async function handleSaveActionItem() {
    if (!canEditActionItems) return;

    const date = String(selectedMeetingDate || "").trim();
    const title = String(actionItemText || "").trim();
    if (!date || !title) return;

    if (selectedMeetingId && detailQuery.isLoading) {
      toast.error("Meeting details are still loading.");
      return;
    }

    try {
      let meetingId = selectedMeetingId;

      if (!meetingId) {
        const created = await createMeetingMutation.mutateAsync({
          tenantSlug: coachingTenantSlug,
          title: `Client Meeting · ${date}`,
          meetingDate: date,
          meetingType: "other",
          status: "completed",
          notes: null,
        });
        meetingId = Number(created.meeting.id);
        setSelectedMeetingId(meetingId);
      }

      const baseItems = meetingId
        ? selectedMeetingActionItems
            .map((it: any, idx: number) => ({
              title: String(it.title || "").trim(),
              details: it.details == null ? null : String(it.details),
              status: (it.status ?? "open") as "open" | "in_progress" | "completed",
              dueDate: it.due_date ? String(it.due_date).slice(0, 10) : null,
              assignedToUserId: it.assigned_to_user_id == null ? null : Number(it.assigned_to_user_id),
              sortOrder: idx,
            }))
            .filter((it: any) => it.title.length > 0)
        : [];

      const nextItems = [
        ...baseItems,
        {
          title,
          details: null,
          status: "open" as const,
          dueDate: null,
          assignedToUserId: null,
          sortOrder: baseItems.length,
        },
      ];

      await upsertItemsMutation.mutateAsync({
        meetingId: Number(meetingId),
        tenantSlug: coachingTenantSlug,
        items: nextItems,
      });

      await Promise.all([meetingsQuery.refetch(), detailQuery.refetch()]);
      setActionItemText("");
      setActionSaveStatus(`Saved to ${fmtDate(date)}`);
    } catch (error: any) {
      toast.error(error?.message || "Unable to save action item.");
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Strategic Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Latest period: {periodLabel} · {year} YTD</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20">
          <Users size={14} />
          <span>{activeClients} Active Clients</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Revenue YTD"
          value={fmtD(ytdRevenue)}
          budget={fmtD(ytdBudgetRevenue)}
          variance={ytdRevenue - ytdBudgetRevenue}
          variancePct={revVariancePct}
          icon={<DollarSign size={16} />}
        />
        <KpiCard
          label="Expenses YTD"
          value={fmtD(ytdExpenses)}
          budget={fmtD(ytdBudgetExpenses)}
          variance={ytdExpenses - ytdBudgetExpenses}
          variancePct={expVariancePct}
          icon={<TrendingDown size={16} />}
          invertGood
        />
        <KpiCard
          label="Net Profit YTD"
          value={fmtD(ytdProfit)}
          budget={fmtD(ytdBudgetProfit)}
          variance={ytdProfit - ytdBudgetProfit}
          variancePct={profitVariancePct}
          icon={<TrendingUp size={16} />}
        />
        <KpiCard
          label="Net Margin"
          value={fmtPct(ytdMargin)}
          budget="35% target"
          variance={ytdMargin - 35}
          variancePct={ytdMargin - 35}
          icon={<Percent size={16} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Top Income Sources <span className="text-xs font-normal text-muted-foreground">({periodLabel})</span>
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
            Top Expenses <span className="text-xs font-normal text-muted-foreground">({periodLabel})</span>
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
            <span className="text-xs text-muted-foreground">{openPriorities.length} open · {completedPriorities.length} complete</span>
          </div>

          {!coachingCardsEnabled ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              Select a client via “Viewing as client” to manage coaching priorities.
            </div>
          ) : prioritiesQuery.isLoading ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">Loading priorities…</div>
          ) : prioritiesQuery.isError ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">Unable to load priorities for this client.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Input
                  value={newPriorityTitle}
                  onChange={(e) => setNewPriorityTitle(e.target.value)}
                  placeholder="Add a coaching priority..."
                  className="h-10"
                  disabled={!canEditPriorities}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!canEditPriorities || !newPriorityTitle.trim() || createPriorityMutation.isPending) return;
                    createPriorityMutation.mutate({ year, tenantSlug: coachingTenantSlug, title: newPriorityTitle.trim() });
                  }}
                />
                <Button
                  type="button"
                  className="h-10 w-10 shrink-0"
                  disabled={!canEditPriorities || !newPriorityTitle.trim() || createPriorityMutation.isPending}
                  onClick={() => {
                    if (!canEditPriorities || !newPriorityTitle.trim()) return;
                    createPriorityMutation.mutate({ year, tenantSlug: coachingTenantSlug, title: newPriorityTitle.trim() });
                  }}
                  aria-label="Add priority"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {openPriorities.length > 0 ? (
                  openPriorities.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 cursor-pointer">
                      <Checkbox
                        checked={!!p.completed}
                        onCheckedChange={(checked) => {
                          if (!canEditPriorities) return;
                          togglePriorityMutation.mutate({ id: p.id, completed: checked === true, tenantSlug: coachingTenantSlug });
                        }}
                        disabled={!canEditPriorities || togglePriorityMutation.isPending}
                      />
                      <span className="text-sm text-foreground truncate">{p.title}</span>
                    </label>
                  ))
                ) : (
                  <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">No open priorities yet.</div>
                )}

                <div className="pt-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Completed</p>
                  {completedPriorities.length > 0 ? (
                    completedPriorities.map((p) => (
                      <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/70 px-3 py-2 cursor-pointer mb-2">
                        <Checkbox
                          checked={!!p.completed}
                          onCheckedChange={(checked) => {
                            if (!canEditPriorities) return;
                            togglePriorityMutation.mutate({ id: p.id, completed: checked === true, tenantSlug: coachingTenantSlug });
                          }}
                          disabled={!canEditPriorities || togglePriorityMutation.isPending}
                        />
                        <span className="text-sm text-muted-foreground line-through truncate">{p.title}</span>
                      </label>
                    ))
                  ) : (
                    <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">No completed priorities yet.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-sm font-semibold text-foreground">Client Action Items</h2>
            <span className="text-xs text-muted-foreground">{selectedMeetingId ? `${selectedMeetingSavedCount} saved` : "No meeting selected"}</span>
          </div>

          {!coachingCardsEnabled ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              Select a client via “Viewing as client” to manage action items.
            </div>
          ) : meetingsQuery.isLoading ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">Loading action items…</div>
          ) : meetingsQuery.isError ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">Unable to load client meetings.</div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                <label className="text-xs text-muted-foreground">Meeting Date</label>
                <Input
                  type="date"
                  value={selectedMeetingDate}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setSelectedMeetingDate(nextDate);
                    setActionSaveStatus(null);
                    const match = meetings.find((m: any) => toDateInputValue(m.meeting_date) === nextDate) || null;
                    setSelectedMeetingId(match ? Number(match.id) : null);
                  }}
                  className="h-10"
                  disabled={!canEditActionItems}
                />
              </div>

              <div className="space-y-2 mb-4">
                <label className="text-xs text-muted-foreground">Action Item</label>
                <textarea
                  value={actionItemText}
                  onChange={(e) => setActionItemText(e.target.value)}
                  placeholder="Enter one action item to save for this meeting date..."
                  className="w-full min-h-[92px] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  disabled={!canEditActionItems}
                />
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    className="h-9"
                    disabled={
                      !canEditActionItems ||
                      !selectedMeetingDate ||
                      !actionItemText.trim() ||
                      savingActionItems ||
                      (selectedMeetingId != null && detailQuery.isLoading)
                    }
                    onClick={() => {
                      void handleSaveActionItem();
                    }}
                  >
                    {savingActionItems ? "Saving..." : "Save"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {actionSaveStatus || (selectedMeetingId ? "Connected to saved meeting" : "Will create a new meeting for this date")}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Action Item History</p>
                  <div className="max-h-[140px] overflow-y-auto pr-1 space-y-1.5">
                    {meetings.length === 0 ? (
                      <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">No saved meetings yet.</div>
                    ) : (
                      meetings.map((m: any) => {
                        const isSelected = Number(m.id) === selectedMeetingId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedMeetingId(Number(m.id));
                              setSelectedMeetingDate(toDateInputValue(m.meeting_date));
                              setActionSaveStatus(null);
                            }}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                              isSelected ? "border-primary/60 bg-primary/10" : "border-border bg-background hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-foreground truncate">{m.title || "Client Meeting"}</span>
                              <span className="text-[11px] text-muted-foreground">{m.open_action_items ?? 0} open</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(m.meeting_date)}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Selected Meeting Items</p>
                  <div className="max-h-[140px] overflow-y-auto pr-1 space-y-1.5">
                    {!selectedMeetingId ? (
                      <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                        Select a saved meeting to view its action items.
                      </div>
                    ) : detailQuery.isLoading ? (
                      <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">Loading items…</div>
                    ) : detailQuery.isError ? (
                      <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">Unable to load action items.</div>
                    ) : selectedMeetingActionItems.length === 0 ? (
                      <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                        No action items saved for this meeting.
                      </div>
                    ) : (
                      selectedMeetingActionItems.map((it: any) => (
                        <div key={it.id} className="rounded-lg border border-border bg-background px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-foreground truncate">{it.title}</p>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{String(it.status || "open").replace("_", " ")}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Executive Performance</h2>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">{year} Sales Target</h3>
              <p className="text-xs text-muted-foreground mt-1">Clients signed vs annual client target</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Clients signed</p>
                <p className="text-2xl font-semibold text-foreground mt-1">{ytdSigned}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Annual client target</p>
                <p className="text-2xl font-semibold text-foreground mt-1">{annualTarget}</p>
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
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
            <p className="text-xs text-muted-foreground mb-4">{clientsRemaining} clients remaining</p>

            <Link href="/portal/sales" className="inline-flex items-center text-xs text-primary hover:underline">
              Manage annual goal in Sales Tracker
            </Link>
          </div>

          <div className="xl:col-span-3 bg-card border border-border rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground">Actuals vs Budget</h3>
              <p className="text-xs text-muted-foreground mt-1">Available periods only · {year}</p>
            </div>

            {actualVsBudgetChartData.length === 0 ? (
              <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
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
              <p className="text-xs text-muted-foreground mt-1">Actual revenue across available periods · {year}</p>
            </div>

            {revenueTrendData.length === 0 ? (
              <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
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
              <p className="text-xs text-muted-foreground mt-1">Grouped by active package/tier</p>
            </div>

            {activeClientMix.length === 0 ? (
              <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
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
                    <div key={entry.name} className="flex items-center justify-between text-xs rounded-md border border-border bg-background px-2.5 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: mixColors[idx % mixColors.length] }} />
                        <span className="text-muted-foreground truncate">{entry.name}</span>
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
