import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, Cell,
  PieChart, Pie,
} from "recharts";
import {
  DollarSign, TrendingDown, TrendingUp, BarChart2,
  Users, ShoppingBag, Clock, Activity,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const AMBER = "oklch(0.78 0.16 60)";

type Period = "Year" | "Quarter" | "Month";
type Tab = "financial" | "clients" | "sales" | "time" | "profitability";

const QUARTERS: Record<number, number[]> = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtN(n: number | string | null | undefined) {
  return typeof n === "number" ? n : parseFloat(n ?? "0") || 0;
}
function fmtDFull(n: number | string | null | undefined) {
  const v = fmtN(n);
  return `$${Math.round(v).toLocaleString()}`;
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
function varianceColor(n: number) {
  if (n > 0) return GREEN;
  if (n < 0) return RED;
  return AMBER;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, budget, vsTarget, icon: Icon,
}: {
  label: string;
  value: string;
  budget?: string;
  vsTarget?: { pct: number };
  icon: React.ElementType;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</span>
        <Icon size={16} className="text-muted-foreground" />
      </div>
      <div className="text-3xl font-bold text-foreground">{value}</div>
      {budget && <div className="text-xs text-muted-foreground">{budget}</div>}
      {vsTarget !== undefined && (
        <div className="flex items-center gap-1 text-xs font-medium" style={{ color: varianceColor(vsTarget.pct) }}>
          {vsTarget.pct >= 0
            ? <TrendingUp size={12} />
            : <TrendingDown size={12} />}
          {fmtPct(vsTarget.pct)} vs target
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("Year");
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>("financial");
  const { impersonatingTenantSlug } = usePortal();
  const tslug = impersonatingTenantSlug ?? undefined;

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  // Determine which months to include based on period
  const activeMonths = useMemo(() => {
    if (period === "Year") return Array.from({ length: 12 }, (_, i) => i + 1);
    if (period === "Quarter") return QUARTERS[quarter];
    return [month];
  }, [period, quarter, month]);

  // Fetch financial data
  const { data: yearlyData = [], isLoading: finLoading } = trpc.financials.get.useQuery(
    { year, tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  // Fetch sales data
  const { data: salesData = [] } = trpc.sales.getByYear.useQuery(
    { year, tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  // Fetch time data
  const { data: timeData = [] } = trpc.time.getByYear.useQuery(
    { year },
    { staleTime: 30_000 }
  );

  // Fetch client roster
  const { data: rosterData = [] } = trpc.roster.list.useQuery(
    { tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  // Fetch line items for the year (income + expense breakdown)
  const { data: lineItemsData = [] } = trpc.financials.lineItemsByYear.useQuery(
    { year, tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  // Filter financial data by active months
  const filteredFin = useMemo(
    () => yearlyData.filter(r => activeMonths.includes(r.month ?? 0)),
    [yearlyData, activeMonths]
  );

  // For P&L table: always show all 12 months (or active months), merging DB data with empty rows
  const plTableRows = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const nowMonth = new Date().getMonth() + 1; // 1-based
    const dbByMonth: Record<number, typeof yearlyData[0]> = {};
    yearlyData.forEach(r => { if (r.month) dbByMonth[r.month] = r; });
    return activeMonths.map(m => {
      const row = dbByMonth[m];
      const rev = fmtN(row?.revenue);
      const bud = fmtN(row?.budget_revenue);
      const exp = fmtN(row?.expenses);
      const np = fmtN(row?.net_profit);
      const rawMargin = fmtN(row?.net_profit_margin);
      // If margin stored as decimal (e.g. 0.193), multiply by 100; if already >1, use as-is
      const margin = rawMargin > 1 ? rawMargin : rawMargin * 100;
      const variance = rev - bud;
      // Actual = strictly before current month; Projection = current month and all future months
      const isPast = (year < nowYear) || (year === nowYear && m < nowMonth);
      const isFuture = !isPast;
      const hasData = rev > 0 || exp > 0;
      const label = isPast ? "Actual" : "Projection";
      return { m, rev, bud, exp, np, margin, variance, label, isFuture, hasData };
    });
  }, [yearlyData, activeMonths, year]);

  // Aggregate financial totals
  const totals = useMemo(() => filteredFin.reduce(
    (acc, row) => ({
      revenue: acc.revenue + fmtN(row.revenue),
      expenses: acc.expenses + fmtN(row.expenses),
      netProfit: acc.netProfit + fmtN(row.net_profit),
      budgetRevenue: acc.budgetRevenue + fmtN(row.budget_revenue),
      budgetExpenses: acc.budgetExpenses + fmtN(row.budget_expenses),
    }),
    { revenue: 0, expenses: 0, netProfit: 0, budgetRevenue: 0, budgetExpenses: 0 }
  ), [filteredFin]);

  const netMargin = totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0;
  const targetMargin = totals.budgetRevenue > 0
    ? ((totals.budgetRevenue - totals.budgetExpenses) / totals.budgetRevenue) * 100
    : 35;
  const revVsBudget = totals.budgetRevenue > 0
    ? ((totals.revenue / totals.budgetRevenue) - 1) * 100 : 0;
  const expVsBudget = totals.budgetExpenses > 0
    ? ((totals.expenses / totals.budgetExpenses) - 1) * 100 : 0;
  const profitVsBudget = (totals.budgetRevenue - totals.budgetExpenses) > 0
    ? ((totals.netProfit / (totals.budgetRevenue - totals.budgetExpenses)) - 1) * 100 : 0;
  const marginVsTarget = netMargin - targetMargin;

  // Aggregate line items by label for the active months
  const { topIncome, topExpense } = useMemo(() => {
    const filteredItems = (lineItemsData as any[]).filter(r => activeMonths.includes(r.month ?? 0));
    const incomeMap: Record<string, number> = {};
    const expenseMap: Record<string, number> = {};
    filteredItems.forEach((r: any) => {
      const amt = typeof r.amount === 'number' ? r.amount : parseFloat(r.amount ?? '0') || 0;
      if (r.type === 'income') {
        incomeMap[r.label] = (incomeMap[r.label] ?? 0) + amt;
      } else {
        expenseMap[r.label] = (expenseMap[r.label] ?? 0) + amt;
      }
    });
    const sortDesc = (map: Record<string, number>) =>
      Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { topIncome: sortDesc(incomeMap), topExpense: sortDesc(expenseMap) };
  }, [lineItemsData, activeMonths]);

  // Revenue vs Budget chart: always all active months, Actual=red for past months, Budget=grey for all
  const revBudgetChartData = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const nowMonth = new Date().getMonth() + 1;
    const dbByMonth: Record<number, typeof yearlyData[0]> = {};
    yearlyData.forEach(r => { if (r.month) dbByMonth[r.month] = r; });
    return activeMonths.map(m => {
      const row = dbByMonth[m];
      const isPast = (year < nowYear) || (year === nowYear && m < nowMonth);
      return {
        month: MONTHS_SHORT[m - 1],
        Actual: isPast ? fmtN(row?.revenue) : 0,
        Budget: fmtN(row?.budget_revenue),
        isPast,
      };
    });
  }, [yearlyData, activeMonths, year]);

  // Chart data for P&L
  const chartData = useMemo(() => filteredFin.map(row => ({
    month: MONTHS_SHORT[(row.month ?? 1) - 1],
    Revenue: fmtN(row.revenue),
    Budget: fmtN(row.budget_revenue),
    Expenses: fmtN(row.expenses),
    "Net Profit": fmtN(row.net_profit),
  })), [filteredFin]);

  // Sales chart data — note: Supabase returns snake_case
  const salesChartData = useMemo(() => salesData
    .filter((r: any) => activeMonths.includes(r.month ?? 0))
    .map((r: any) => ({
      month: MONTHS_SHORT[(r.month ?? 1) - 1],
      Goal: r.goal_clients ?? 0,
      Signed: r.signed_clients ?? 0,
      Referrals: r.referral_count ?? 0,
      Outbound: r.outbound_count ?? 0,
    })), [salesData, activeMonths]);

  // Time chart data
  const timeChartData = useMemo(() => {
    const byMonth: Record<number, Record<string, number>> = {};
    const focusAreas = new Set<string>();
    timeData
      .filter((r: any) => activeMonths.includes(r.month ?? 0))
      .forEach((r: any) => {
        const m = r.month ?? 0;
        if (!byMonth[m]) byMonth[m] = {};
        const fa = r.focusArea ?? "Other";
        focusAreas.add(fa);
        byMonth[m][fa] = (byMonth[m][fa] ?? 0) + fmtN(r.hours);
      });
    return {
      data: Object.entries(byMonth).map(([m, areas]) => ({
        month: MONTHS_SHORT[Number(m) - 1],
        ...areas,
      })),
      focusAreas: Array.from(focusAreas),
    };
  }, [timeData, activeMonths]);

  // Period label
  const periodLabel = useMemo(() => {
    if (period === "Year") return `Full Year ${year}`;
    if (period === "Quarter") return `Q${quarter} ${year} (${MONTHS_SHORT[QUARTERS[quarter][0]-1]}–${MONTHS_SHORT[QUARTERS[quarter][2]-1]})`;
    return `${MONTHS_SHORT[month - 1]} ${year}`;
  }, [period, year, quarter, month]);

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "financial", label: "Financial P&L", icon: DollarSign },
    { key: "clients", label: "Client Analytics", icon: Users },
    { key: "sales", label: "Sales", icon: ShoppingBag },
    { key: "time", label: "Time", icon: Clock },
    { key: "profitability", label: "Profitability", icon: BarChart2 },
  ];

  const FOCUS_COLORS = [TEAL, GREEN, AMBER, RED, "oklch(0.65 0.15 270)", "oklch(0.65 0.15 320)"];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Activity size={22} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Reports &amp; Analytics</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Slice every metric by Year, Quarter, or Month</p>
      </div>

      {/* Period Selector Bar */}
      <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Report Period:</span>
        <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
          {(["Year", "Quarter", "Month"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {period === "Quarter" && (
          <select
            value={quarter}
            onChange={e => setQuarter(Number(e.target.value))}
            className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {[1,2,3,4].map(q => (
              <option key={q} value={q}>Q{q} ({MONTHS_SHORT[QUARTERS[q][0]-1]}–{MONTHS_SHORT[QUARTERS[q][2]-1]})</option>
            ))}
          </select>
        )}
        {period === "Month" && (
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {MONTHS_SHORT.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        )}
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Period Label */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-0.5 bg-primary rounded-full" />
        <h2 className="text-lg font-semibold text-foreground">{periodLabel}</h2>
      </div>

      {/* Tab Bar */}
      <div className="bg-card border border-border rounded-xl p-1 flex items-center gap-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-1 justify-center ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Financial P&L Tab ── */}
      {tab === "financial" && (
        <div className="space-y-6">
          {finLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">Loading financial data…</div>
          ) : filteredFin.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
              No financial data for this period.
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total Revenue" value={fmtDFull(totals.revenue)} budget={`Budget: ${fmtDFull(totals.budgetRevenue)}`} vsTarget={{ pct: revVsBudget }} icon={DollarSign} />
                <KpiCard label="Total Expenses" value={fmtDFull(totals.expenses)} budget={`Budget: ${fmtDFull(totals.budgetExpenses)}`} vsTarget={{ pct: expVsBudget }} icon={TrendingDown} />
                <KpiCard label="Net Profit" value={fmtDFull(totals.netProfit)} budget={`Budget: ${fmtDFull(totals.budgetRevenue - totals.budgetExpenses)}`} vsTarget={{ pct: profitVsBudget }} icon={TrendingUp} />
                <KpiCard label="Net Margin" value={`${netMargin.toFixed(1)}%`} budget={`Target: ${targetMargin.toFixed(0)}%`} vsTarget={{ pct: marginVsTarget }} icon={BarChart2} />
              </div>

              {/* Monthly P&L Breakdown Table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Monthly P&amp;L Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-3 text-muted-foreground font-medium">Month</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Revenue</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Budget</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Variance</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Expenses</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Net Profit</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Margin</th>
                        <th className="text-right px-5 py-3 text-muted-foreground font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plTableRows.map(({ m, rev, bud, exp, np, margin, variance, label }) => (
                        <tr key={m} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3 font-bold text-foreground">{MONTHS_SHORT[m - 1]} {year}</td>
                          <td className="px-4 py-3 text-right text-foreground">{fmtDFull(rev)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtDFull(bud)}</td>
                          <td className="px-4 py-3 text-right font-bold" style={{ color: variance > 0 ? GREEN : variance < 0 ? RED : GREEN }}>
                            {variance >= 0 ? "+" : ""}{fmtDFull(variance)}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">{fmtDFull(exp)}</td>
                          <td className="px-4 py-3 text-right font-bold" style={{ color: GREEN }}>{fmtDFull(np)}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: margin >= 30 ? AMBER : margin > 0 ? AMBER : AMBER }}>{margin.toFixed(1)}%</td>
                          <td className="px-5 py-3 text-right text-muted-foreground text-xs">{label}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td className="px-5 py-3 font-bold text-foreground">TOTAL</td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">{fmtDFull(totals.revenue)}</td>
                        <td className="px-4 py-3 text-right font-bold text-muted-foreground">{fmtDFull(totals.budgetRevenue)}</td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: (totals.revenue - totals.budgetRevenue) >= 0 ? GREEN : RED }}>
                          {totals.revenue - totals.budgetRevenue >= 0 ? "+" : ""}{fmtDFull(totals.revenue - totals.budgetRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">{fmtDFull(totals.expenses)}</td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: GREEN }}>{fmtDFull(totals.netProfit)}</td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">{netMargin.toFixed(1)}%</td>
                        <td className="px-5 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Revenue vs Budget Chart — 12 months, red=Actual (past), grey=Budget (all) */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold text-foreground mb-4">Revenue vs Budget</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={revBudgetChartData} barCategoryGap="20%" barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }}
                      labelStyle={{ color: "oklch(0.85 0.008 240)" }}
                      formatter={(v: number, name: string) => [`$${v.toLocaleString()}`, name]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 13, paddingTop: 12 }}
                      formatter={(value) => (
                        <span style={{ color: value === "Actual" ? RED : "oklch(0.60 0.008 240)", fontWeight: 600 }}>{value}</span>
                      )}
                    />
                    <Bar dataKey="Actual" radius={[4,4,0,0]}>
                      {revBudgetChartData.map((entry, index) => (
                        <Cell key={`actual-${index}`} fill={entry.isPast && entry.Actual > 0 ? RED : "transparent"} />
                      ))}
                    </Bar>
                    <Bar dataKey="Budget" fill="oklch(0.32 0.008 240)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Top Income Sources & Top Expense Categories */}
              {(topIncome.length > 0 || topExpense.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Top Income Sources */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="font-bold text-foreground text-base mb-4">Top Income Sources</h3>
                    {topIncome.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No income data for this period.</p>
                    ) : (() => {
                      const maxIncome = topIncome[0]?.[1] ?? 1;
                      const totalIncome = topIncome.reduce((s, [, v]) => s + v, 0);
                      return (
                        <div className="space-y-3">
                          {topIncome.map(([label, amount]) => {
                            const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0;
                            const barWidth = maxIncome > 0 ? (amount / maxIncome) * 100 : 0;
                            const isTop = amount === maxIncome;
                            return (
                              <div key={label}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-foreground">{label}</span>
                                  <span className="text-sm font-bold text-foreground">{fmtDFull(amount)}</span>
                                </div>
                                <div className="w-full bg-muted/30 rounded-full h-1.5">
                                  <div
                                    className="h-1.5 rounded-full transition-all"
                                    style={{ width: `${barWidth}%`, backgroundColor: isTop ? RED : 'oklch(0.45 0.008 240)' }}
                                  />
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">{pct.toFixed(1)}%</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Top Expense Categories */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="font-bold text-foreground text-base mb-4">Top Expense Categories</h3>
                    {topExpense.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No expense data for this period.</p>
                    ) : (() => {
                      const maxExpense = topExpense[0]?.[1] ?? 1;
                      const totalExpense = topExpense.reduce((s, [, v]) => s + v, 0);
                      return (
                        <div className="space-y-3">
                          {topExpense.map(([label, amount]) => {
                            const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
                            const barWidth = maxExpense > 0 ? (amount / maxExpense) * 100 : 0;
                            const isTop = amount === maxExpense;
                            return (
                              <div key={label}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-foreground">{label}</span>
                                  <span className="text-sm font-bold text-foreground">{fmtDFull(amount)}</span>
                                </div>
                                <div className="w-full bg-muted/30 rounded-full h-1.5">
                                  <div
                                    className="h-1.5 rounded-full transition-all"
                                    style={{ width: `${barWidth}%`, backgroundColor: isTop ? RED : 'oklch(0.45 0.008 240)' }}
                                  />
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">{pct.toFixed(1)}%</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Client Analytics Tab ── */}
      {tab === "clients" && (() => {
        const activeClients = (rosterData as any[]).filter(c => c.status === "active");
        const churnedClients = (rosterData as any[]).filter(c => c.status === "churned");

        // New clients: signed_date falls within the active period
        const newClients = (rosterData as any[]).filter(c => {
          if (!c.signed_date) return false;
          const d = new Date(c.signed_date);
          const cy = d.getFullYear();
          const cm = d.getMonth() + 1;
          if (cy !== year) return false;
          return activeMonths.includes(cm);
        });

        const netGrowth = newClients.length - churnedClients.length;

        // Package Tier LTV Analysis — group all clients by package
        const tierMap: Record<string, { count: number; totalMonthly: number; totalTenure: number; totalLtv: number }> = {};
        ;(rosterData as any[]).forEach(c => {
          const pkg = c.package || "Unknown";
          if (!tierMap[pkg]) tierMap[pkg] = { count: 0, totalMonthly: 0, totalTenure: 0, totalLtv: 0 };
          tierMap[pkg].count++;
          tierMap[pkg].totalMonthly += fmtN(c.monthly_amount);
          tierMap[pkg].totalTenure += fmtN(c.tenure_months);
          tierMap[pkg].totalLtv += fmtN(c.ltv);
        });
        const tierRows = Object.entries(tierMap)
          .map(([pkg, d]) => ({
            pkg,
            count: d.count,
            avgMonthly: d.count > 0 ? d.totalMonthly / d.count : 0,
            avgTenure: d.count > 0 ? d.totalTenure / d.count : 0,
            avgLtv: d.count > 0 ? d.totalLtv / d.count : 0,
          }))
          .sort((a, b) => b.avgLtv - a.avgLtv);

        // Active client distribution by package (for pie chart)
        const activeByTier: Record<string, number> = {};
        activeClients.forEach((c: any) => {
          const pkg = c.package || "Unknown";
          activeByTier[pkg] = (activeByTier[pkg] ?? 0) + 1;
        });
        const pieData = Object.entries(activeByTier)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        const PIE_COLORS = [RED, "oklch(0.52 0.18 25)", "oklch(0.42 0.14 25)", "oklch(0.35 0.10 25)", "oklch(0.28 0.06 25)", "oklch(0.22 0.04 25)"];

        // LTV by Tier bar chart data
        const ltvBarData = tierRows.map(r => ({ name: r.pkg, LTV: Math.round(r.avgLtv) }));

        return (
          <div className="space-y-6">
            {rosterData.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
                No client data available. Add clients in the Clients section.
              </div>
            ) : (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Total Active</span>
                      <Users size={16} className="text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold text-foreground">{activeClients.length}</div>
                    <div className="text-xs text-muted-foreground">Current roster</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">New Clients</span>
                      <TrendingUp size={16} className="text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold text-foreground">{newClients.length}</div>
                    <div className="text-xs text-muted-foreground">Signed in {period === "Year" ? `Full Year ${year}` : period === "Quarter" ? `Q${quarter} ${year}` : `${MONTHS_SHORT[month - 1]} ${year}`}</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Churned</span>
                      <TrendingDown size={16} className="text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold text-foreground">{churnedClients.length}</div>
                    <div className="text-xs text-muted-foreground">Left in {period === "Year" ? `Full Year ${year}` : period === "Quarter" ? `Q${quarter} ${year}` : `${MONTHS_SHORT[month - 1]} ${year}`}</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Net Growth</span>
                      <BarChart2 size={16} className="text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold" style={{ color: netGrowth >= 0 ? GREEN : RED }}>{netGrowth >= 0 ? `+${netGrowth}` : netGrowth}</div>
                    <div className="text-xs text-muted-foreground">New minus churned</div>
                  </div>
                </div>

                {/* Package Tier LTV Analysis */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-bold text-foreground text-base">Package Tier LTV Analysis</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Across all clients (active + churned)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-5 py-3 text-muted-foreground font-medium">Package Tier</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-medium">Total Clients</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-medium">Avg Monthly Price</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-medium">Avg Tenure</th>
                          <th className="text-right px-5 py-3 text-muted-foreground font-medium">Avg LTV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tierRows.map(r => (
                          <tr key={r.pkg} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3">
                              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-muted/40 text-foreground border border-border/60">{r.pkg}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">{r.count}</td>
                            <td className="px-4 py-3 text-right text-foreground">{fmtDFull(r.avgMonthly)}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{r.avgTenure.toFixed(1)} mo</td>
                            <td className="px-5 py-3 text-right font-bold" style={{ color: TEAL }}>{fmtDFull(r.avgLtv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Active Client Distribution + LTV by Tier */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Pie Chart */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="font-bold text-foreground text-base mb-4">Active Client Distribution</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={110}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                          labelLine={false}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }}
                          formatter={(v: number, name: string) => [v, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* LTV by Tier bar chart */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="font-bold text-foreground text-base mb-4">LTV by Tier</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={ltvBarData} layout="vertical" margin={{ left: 16, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "oklch(0.70 0.008 240)", fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip
                          contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }}
                          formatter={(v: number) => [`$${v.toLocaleString()}`, "Avg LTV"]}
                        />
                        <Bar dataKey="LTV" fill={RED} radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Sales Tab ── */}
      {tab === "sales" && (() => {
        // Build 12-month (or active-month) rows from salesData, always showing all months
        const salesByMonth: Record<number, any> = {};
        ;(salesData as any[]).forEach(r => { if (r.month) salesByMonth[r.month] = r; });

        const salesTableRows = activeMonths.map(m => {
          const r = salesByMonth[m];
          const goal = r?.goal_clients ?? 0;
          const closed = r?.signed_clients ?? 0;
          const totalCalls = (r?.referral_count ?? 0) + (r?.outbound_count ?? 0);
          const closeRate = totalCalls > 0 ? (closed / totalCalls) * 100 : null;
          const vsTarget = closed - goal;
          return { m, goal, closed, totalCalls, closeRate, vsTarget };
        });

        const totalGoal = salesTableRows.reduce((s, r) => s + r.goal, 0);
        const totalClosed = salesTableRows.reduce((s, r) => s + r.closed, 0);
        const totalCalls = salesTableRows.reduce((s, r) => s + r.totalCalls, 0);
        const overallCloseRate = totalCalls > 0 ? (totalClosed / totalCalls) * 100 : 0;
        const goalAchievement = totalGoal > 0 ? (totalClosed / totalGoal) * 100 : 0;

        // Closed vs Target chart — always all active months
        const closedVsTargetData = salesTableRows.map(r => ({
          month: MONTHS_SHORT[r.m - 1],
          Closed: r.closed,
          Target: r.goal,
        }));

        return (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Clients Closed</span>
                  <Activity size={16} className="text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold text-foreground">{totalClosed}</div>
                <div className="text-xs text-muted-foreground">Target: {totalGoal}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Total Calls</span>
                  <Users size={16} className="text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold text-foreground">{totalCalls}</div>
                <div className="text-xs text-muted-foreground">Discovery calls</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Close Rate</span>
                  <TrendingUp size={16} className="text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold text-foreground">{overallCloseRate.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">Calls to closes</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Goal Achievement</span>
                  <BarChart2 size={16} className="text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold text-foreground">{goalAchievement.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">{totalClosed} of {totalGoal}</div>
                <div className="flex items-center gap-1 text-xs font-medium" style={{ color: goalAchievement >= 100 ? GREEN : RED }}>
                  <TrendingDown size={12} />
                  {(goalAchievement - 100).toFixed(1)}% vs target
                </div>
              </div>
            </div>

            {/* Monthly Sales Detail Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-bold text-foreground text-base">Monthly Sales Detail</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-muted-foreground font-medium">Month</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Target</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Closed</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Total Calls</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Close Rate</th>
                      <th className="text-right px-5 py-3 text-muted-foreground font-medium">vs Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesTableRows.map(r => (
                      <tr key={r.m} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{MONTHS_SHORT[r.m - 1]} {year}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{r.goal}</td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">{r.closed}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{r.totalCalls}</td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {r.closeRate !== null ? `${r.closeRate.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right font-bold" style={{ color: r.vsTarget > 0 ? GREEN : r.vsTarget < 0 ? RED : "oklch(0.70 0.008 240)" }}>
                          {r.vsTarget > 0 ? `+${r.vsTarget}` : r.vsTarget}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Closed vs Target Chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold text-foreground text-base mb-4">Closed vs Target</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={closedVsTargetData} barCategoryGap="20%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }}
                    labelStyle={{ color: "oklch(0.85 0.008 240)" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 13, paddingTop: 12 }}
                    formatter={(value) => (
                      <span style={{ color: value === "Closed" ? RED : "oklch(0.60 0.008 240)", fontWeight: 600 }}>{value}</span>
                    )}
                  />
                  <Bar dataKey="Closed" fill={RED} radius={[4,4,0,0]} />
                  <Bar dataKey="Target" fill="oklch(0.32 0.008 240)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* ── Time Tab ── */}
      {tab === "time" && (() => {
        const filtered = (timeData as any[]).filter(r => activeMonths.includes(r.month ?? 0));
        const totalHours = filtered.reduce((s, r) => s + fmtN(r.hours), 0);

        // Hours by focus area
        const byFocus: Record<string, number> = {};
        filtered.forEach(r => {
          const f = r.focusArea ?? "Other";
          byFocus[f] = (byFocus[f] ?? 0) + fmtN(r.hours);
        });

        // Identify Sales hours and Consulting hours by focus area label match
        const salesHours = Object.entries(byFocus)
          .filter(([k]) => k.toLowerCase().includes("sales"))
          .reduce((s, [, v]) => s + v, 0);
        const consultingHours = Object.entries(byFocus)
          .filter(([k]) => k.toLowerCase().includes("consult") || k.toLowerCase().includes("delivery") || k.toLowerCase().includes("client"))
          .reduce((s, [, v]) => s + v, 0);

        // Focus area target percentages (hardcoded based on reference design; can be made configurable)
        const FOCUS_TARGETS: Record<string, number> = {
          "Sales": 40,
          "Strategy & Analysis": 20,
          "Operations": 5,
          "Training & Leadership": 10,
        };

        // Build focus area rows sorted by hours desc
        const focusRows = Object.entries(byFocus)
          .map(([label, hrs]) => ({
            label,
            hrs,
            pct: totalHours > 0 ? (hrs / totalHours) * 100 : 0,
            target: FOCUS_TARGETS[label] ?? null,
          }))
          .sort((a, b) => b.hrs - a.hrs);

        // Actual vs Target chart data
        const actualVsTargetData = focusRows
          .filter(r => r.target !== null)
          .map(r => ({ name: r.label, "Actual %": Math.round(r.pct), "Target %": r.target as number }));

        const periodDesc = period === "Year" ? `Full Year ${year}` : period === "Quarter" ? `Q${quarter} ${year}` : `${MONTHS_SHORT[(month ?? 1) - 1]} ${year}`;

        return (
          <div className="space-y-6">
            {/* KPI Cards — 3 wide */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Total Hours</span>
                  <Clock size={16} className="text-muted-foreground" style={{ color: TEAL }} />
                </div>
                <div className="text-3xl font-bold text-foreground">{totalHours.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">{periodDesc}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Sales Hours</span>
                  <Activity size={16} style={{ color: TEAL }} />
                </div>
                <div className="text-3xl font-bold text-foreground">{salesHours.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">Target: 20% of total</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Consulting Hours</span>
                  <Users size={16} className="text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold text-foreground">{consultingHours.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">Billable delivery</div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
                No time data for this period.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Focus Area Allocation */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-bold text-foreground text-base mb-5">Focus Area Allocation</h3>
                  <div className="space-y-5">
                    {focusRows.map(r => (
                      <div key={r.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-foreground">{r.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.hrs.toFixed(1)}h ({r.pct.toFixed(1)}%){r.target !== null ? ` — Target: ${r.target}%` : ""}
                          </span>
                        </div>
                        {/* Progress bar with white target marker */}
                        <div className="relative h-2 rounded-full bg-muted/30 overflow-visible">
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${Math.min(r.pct, 100)}%`, background: RED }}
                          />
                          {r.target !== null && (
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white rounded-full"
                              style={{ left: `${Math.min(r.target, 100)}%` }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">White line = target allocation</p>
                </div>

                {/* Actual vs Target % bar chart */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-bold text-foreground text-base mb-4">Actual vs Target (%)</h3>
                  {actualVsTargetData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={actualVsTargetData} layout="vertical" margin={{ left: 16, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={v => `${v}%`}
                          domain={[0, 80]}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fill: "oklch(0.70 0.008 240)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={110}
                        />
                        <Tooltip
                          contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }}
                          formatter={(v: number, name: string) => [`${v}%`, name]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 13, paddingTop: 12 }}
                          formatter={(value) => (
                            <span style={{ color: value === "Actual %" ? RED : "oklch(0.60 0.008 240)", fontWeight: 600 }}>{value}</span>
                          )}
                        />
                        <Bar dataKey="Actual %" fill={RED} radius={[0,4,4,0]} />
                        <Bar dataKey="Target %" fill="oklch(0.35 0.008 240)" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      No focus area targets configured.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Profitability Tab ── */}
      {tab === "profitability" && (() => {
        const activeClients = (rosterData as any[]).filter(c => c.status === "active");
        const allClients = rosterData as any[];

        // Active MRR = sum of monthly_amount for active clients
        const activeMrr = activeClients.reduce((s, c) => s + fmtN(c.monthly_amount), 0);
        const annualRunRate = activeMrr * 12;

        // Avg LTV across all clients (active + churned)
        const avgLtv = allClients.length > 0
          ? allClients.reduce((s, c) => s + fmtN(c.ltv), 0) / allClients.length
          : 0;

        // Avg Margin = net margin from financials
        const avgMargin = netMargin;

        // LTV by Package Tier
        const tierMap: Record<string, { active: number; churned: number; totalMonthly: number; totalTenure: number; totalLtv: number; count: number }> = {};
        allClients.forEach(c => {
          const pkg = c.package || "Unknown";
          if (!tierMap[pkg]) tierMap[pkg] = { active: 0, churned: 0, totalMonthly: 0, totalTenure: 0, totalLtv: 0, count: 0 };
          tierMap[pkg].count++;
          tierMap[pkg].totalMonthly += fmtN(c.monthly_amount);
          tierMap[pkg].totalTenure += fmtN(c.tenure_months);
          tierMap[pkg].totalLtv += fmtN(c.ltv);
          if (c.status === "active") tierMap[pkg].active++;
          else tierMap[pkg].churned++;
        });
        const tierRows = Object.entries(tierMap)
          .map(([tier, d]) => ({
            tier,
            active: d.active,
            churned: d.churned,
            avgMonthly: d.count > 0 ? d.totalMonthly / d.count : 0,
            avgTenure: d.count > 0 ? d.totalTenure / d.count : 0,
            avgLtv: d.count > 0 ? d.totalLtv / d.count : 0,
          }))
          .sort((a, b) => b.avgLtv - a.avgLtv);

        // Per-client rows sorted: active first (by monthly desc), then churned
        const clientRows = [...allClients].sort((a, b) => {
          if (a.status === b.status) return fmtN(b.monthly_amount) - fmtN(a.monthly_amount);
          return a.status === "active" ? -1 : 1;
        });

        // Tier badge colors
        const TIER_COLORS: Record<string, string> = {
          "Momentum": TEAL,
          "Growth 1": TEAL,
          "Growth 2": TEAL,
          "Legacy": "oklch(0.70 0.12 280)",
          "CFO": AMBER,
          "Accelerate/CFO": AMBER,
        };
        function tierColor(t: string) {
          return TIER_COLORS[t] ?? TEAL;
        }

        const totalActiveMrr = activeClients.reduce((s, c) => s + fmtN(c.monthly_amount), 0);

        return (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Active MRR</span>
                  <DollarSign size={16} style={{ color: TEAL }} />
                </div>
                <div className="text-3xl font-bold text-foreground">{fmtDFull(activeMrr)}</div>
                <div className="text-xs text-muted-foreground">{activeClients.length} active clients</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Annual Run Rate</span>
                  <TrendingUp size={16} style={{ color: TEAL }} />
                </div>
                <div className="text-3xl font-bold text-foreground">{fmtDFull(annualRunRate)}</div>
                <div className="text-xs text-muted-foreground">MRR × 12</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Avg LTV</span>
                  <BarChart2 size={16} style={{ color: TEAL }} />
                </div>
                <div className="text-3xl font-bold text-foreground">{fmtDFull(avgLtv)}</div>
                <div className="text-xs text-muted-foreground">Across all tiers</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Avg Margin</span>
                  <Activity size={16} style={{ color: TEAL }} />
                </div>
                <div className="text-3xl font-bold text-foreground">{avgMargin.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">Active clients</div>
              </div>
            </div>

            {/* LTV by Package Tier */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-bold text-foreground text-base">LTV by Package Tier</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-muted-foreground font-medium">Tier</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Active</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Churned</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Avg Price/Mo</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Avg Tenure</th>
                      <th className="text-right px-5 py-3 text-muted-foreground font-medium">Avg LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierRows.map(r => (
                      <tr key={r.tier} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-bold text-foreground">{r.tier}</td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: TEAL }}>{r.active}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{r.churned}</td>
                        <td className="px-4 py-3 text-right text-foreground">{fmtDFull(r.avgMonthly)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{r.avgTenure.toFixed(1)} mo</td>
                        <td className="px-5 py-3 text-right font-bold" style={{ color: TEAL }}>{fmtDFull(r.avgLtv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-Client Breakdown */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground text-base">Client Profitability Breakdown</h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-muted-foreground font-medium">Client</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Tier</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Monthly</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Total Income</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Margin</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Tenure</th>
                      <th className="text-right px-5 py-3 text-muted-foreground font-medium">LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map(c => {
                      const monthly = fmtN(c.monthly_amount);
                      const income = fmtN(c.total_income);
                      const ltv = fmtN(c.ltv);
                      const tenure = fmtN(c.tenure_months);
                      // Margin = (income - estimated expenses) / income; approximate as net margin
                      const marginPct = income > 0 ? (ltv / income) * 100 : 0;
                      const isActive = c.status === "active";
                      return (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3 font-medium text-foreground">{c.client_name}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs font-semibold" style={{ color: tierColor(c.package) }}>{c.package}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                              style={isActive
                                ? { color: TEAL, borderColor: TEAL, background: "oklch(0.75 0.15 192 / 0.12)" }
                                : { color: RED, borderColor: RED, background: "oklch(0.62 0.22 25 / 0.12)" }
                              }
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">{monthly > 0 ? fmtDFull(monthly) : "$0"}</td>
                          <td className="px-4 py-3 text-right text-foreground">{income > 0 ? fmtDFull(income) : "$0"}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: marginPct > 0 ? TEAL : RED }}>{marginPct.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{tenure > 0 ? `${tenure} mo` : "—"}</td>
                          <td className="px-5 py-3 text-right font-bold" style={{ color: ltv > 0 ? TEAL : RED }}>{fmtDFull(ltv)}</td>
                        </tr>
                      );
                    })}
                    {/* Total Active MRR footer */}
                    <tr className="border-t-2 border-border bg-muted/10">
                      <td className="px-5 py-3 font-bold text-foreground" colSpan={3}>Total (Active)</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{fmtDFull(totalActiveMrr)}</td>
                      <td colSpan={4} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
