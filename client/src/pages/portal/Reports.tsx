import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
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
      // Determine label: if month is in the future (no data yet), show "Projection"; if has data, "Actual"
      const isFuture = (year > nowYear) || (year === nowYear && m > nowMonth);
      const hasData = rev > 0 || exp > 0;
      const label = hasData ? "Actual" : (bud > 0 ? "Projection" : "—");
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

              {/* Revenue vs Budget Chart */}
              {chartData.length > 1 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-foreground mb-4">Revenue vs Budget vs Expenses</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }} labelStyle={{ color: "oklch(0.85 0.008 240)" }} formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Revenue" fill={TEAL} radius={[4,4,0,0]} />
                      <Bar dataKey="Budget" fill="oklch(0.40 0.008 240)" radius={[4,4,0,0]} />
                      <Bar dataKey="Expenses" fill={RED} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Client Analytics Tab ── */}
      {tab === "clients" && (
        <div className="space-y-6">
          {rosterData.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
              No client data available. Add clients in the Clients section.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Active Clients" value={String(rosterData.filter((c: any) => c.status === "active").length)} icon={Users} />
                <KpiCard label="Total MRR" value={fmtDFull(rosterData.filter((c: any) => c.status === "active").reduce((s: number, c: any) => s + (c.monthly_amount ?? 0), 0))} icon={DollarSign} />
                <KpiCard label="Avg LTV" value={fmtDFull(rosterData.length > 0 ? rosterData.reduce((s: number, c: any) => s + (c.ltv ?? 0), 0) / rosterData.length : 0)} icon={TrendingUp} />
                <KpiCard label="Churned" value={String(rosterData.filter((c: any) => c.status === "churned").length)} icon={TrendingDown} />
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Client Roster</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-3 text-muted-foreground font-medium">Client</th>
                        <th className="text-left px-4 py-3 text-muted-foreground font-medium">Package</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Monthly</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">LTV</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Tenure</th>
                        <th className="text-right px-5 py-3 text-muted-foreground font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterData.map((c: any) => (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3 font-medium text-foreground">{c.client_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{c.package}</td>
                          <td className="px-4 py-3 text-right text-foreground">{fmtDFull(c.monthly_amount)}</td>
                          <td className="px-4 py-3 text-right text-foreground">{fmtDFull(c.ltv)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{c.tenure_months}mo</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                              {c.status === "active" ? "Active" : "Churned"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Sales Tab ── */}
      {tab === "sales" && (
        <div className="space-y-6">
          {salesChartData.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
              No sales data for this period.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Goal Clients" value={String(salesChartData.reduce((s: number, r: any) => s + r.Goal, 0))} icon={Users} />
                <KpiCard label="Signed Clients" value={String(salesChartData.reduce((s: number, r: any) => s + r.Signed, 0))} icon={TrendingUp} />
                <KpiCard label="Referrals" value={String(salesChartData.reduce((s: number, r: any) => s + r.Referrals, 0))} icon={Activity} />
                <KpiCard label="Outbound" value={String(salesChartData.reduce((s: number, r: any) => s + r.Outbound, 0))} icon={ShoppingBag} />
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold text-foreground mb-4">Sales Activity</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={salesChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }} labelStyle={{ color: "oklch(0.85 0.008 240)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Goal" fill="oklch(0.40 0.008 240)" radius={[4,4,0,0]} />
                    <Bar dataKey="Signed" fill={TEAL} radius={[4,4,0,0]} />
                    <Bar dataKey="Referrals" fill={GREEN} radius={[4,4,0,0]} />
                    <Bar dataKey="Outbound" fill={AMBER} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Monthly Sales Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-3 text-muted-foreground font-medium">Month</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Goal</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Signed</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Attainment</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Referrals</th>
                        <th className="text-right px-5 py-3 text-muted-foreground font-medium">Outbound</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesChartData.map((r: any, i: number) => {
                        const attainment = r.Goal > 0 ? (r.Signed / r.Goal) * 100 : 0;
                        return (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3 font-medium text-foreground">{r.month} {year}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{r.Goal}</td>
                            <td className="px-4 py-3 text-right font-bold" style={{ color: TEAL }}>{r.Signed}</td>
                            <td className="px-4 py-3 text-right font-semibold" style={{ color: attainment >= 100 ? GREEN : attainment >= 70 ? AMBER : RED }}>{attainment.toFixed(0)}%</td>
                            <td className="px-4 py-3 text-right text-foreground">{r.Referrals}</td>
                            <td className="px-5 py-3 text-right text-foreground">{r.Outbound}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Time Tab ── */}
      {tab === "time" && (() => {
        const filtered = timeData.filter((r: any) => activeMonths.includes(r.month ?? 0));
        const totalHours = filtered.reduce((s: number, r: any) => s + fmtN(r.hours), 0);
        const byMember: Record<string, number> = {};
        const byFocus: Record<string, number> = {};
        filtered.forEach((r: any) => {
          const m = r.teamMember ?? "Unknown";
          byMember[m] = (byMember[m] ?? 0) + fmtN(r.hours);
          const f = r.focusArea ?? "Other";
          byFocus[f] = (byFocus[f] ?? 0) + fmtN(r.hours);
        });
        const topMember = Object.entries(byMember).sort((a, b) => b[1] - a[1])[0];
        const topFocus = Object.entries(byFocus).sort((a, b) => b[1] - a[1])[0];
        return (
          <div className="space-y-6">
            {filtered.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
                No time data for this period.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard label="Total Hours" value={`${totalHours.toFixed(1)}h`} icon={Clock} />
                  <KpiCard label="Team Members" value={String(Object.keys(byMember).length)} icon={Users} />
                  <KpiCard label="Top Member" value={topMember?.[0] ?? "—"} budget={topMember ? `${topMember[1].toFixed(1)}h` : undefined} icon={Activity} />
                  <KpiCard label="Top Focus Area" value={topFocus?.[0] ?? "—"} budget={topFocus ? `${topFocus[1].toFixed(1)}h` : undefined} icon={BarChart2} />
                </div>
                {timeChartData.data.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="font-semibold text-foreground mb-4">Hours by Focus Area</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={timeChartData.data} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }} labelStyle={{ color: "oklch(0.85 0.008 240)" }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {timeChartData.focusAreas.slice(0, 6).map((fa, i) => (
                          <Bar key={fa} dataKey={fa} stackId="a" fill={FOCUS_COLORS[i % 6]} radius={i === timeChartData.focusAreas.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Team Member Hours</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-5 py-3 text-muted-foreground font-medium">Member</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-medium">Hours</th>
                          <th className="text-right px-5 py-3 text-muted-foreground font-medium">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byMember).sort((a, b) => b[1] - a[1]).map(([name, hrs]) => (
                          <tr key={name} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3 font-medium text-foreground">{name}</td>
                            <td className="px-4 py-3 text-right font-bold" style={{ color: TEAL }}>{hrs.toFixed(1)}h</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">{totalHours > 0 ? ((hrs / totalHours) * 100).toFixed(1) : 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Profitability Tab ── */}
      {tab === "profitability" && (
        <div className="space-y-6">
          {filteredFin.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground text-sm">
              No financial data for this period.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Net Margin" value={`${netMargin.toFixed(1)}%`} budget={`Target: ${targetMargin.toFixed(0)}%`} vsTarget={{ pct: marginVsTarget }} icon={BarChart2} />
                <KpiCard label="Gross Profit" value={fmtDFull(totals.netProfit)} icon={TrendingUp} />
                <KpiCard label="Expense Ratio" value={totals.revenue > 0 ? `${((totals.expenses / totals.revenue) * 100).toFixed(1)}%` : "—"} icon={TrendingDown} />
                <KpiCard
                  label="Revenue/Client"
                  value={rosterData.filter((c: any) => c.status === "active").length > 0
                    ? fmtDFull(totals.revenue / rosterData.filter((c: any) => c.status === "active").length)
                    : "—"}
                  icon={DollarSign}
                />
              </div>
              {chartData.length > 1 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-foreground mb-4">Net Profit Trend</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 240)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: "oklch(0.18 0.008 240)", border: "1px solid oklch(0.28 0.008 240)", borderRadius: 8 }} labelStyle={{ color: "oklch(0.85 0.008 240)" }} formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Revenue" stroke={TEAL} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Expenses" stroke={RED} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Net Profit" stroke={GREEN} strokeWidth={2.5} dot={{ fill: GREEN, r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Monthly Profitability</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-3 text-muted-foreground font-medium">Month</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Revenue</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Expenses</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Net Profit</th>
                        <th className="text-right px-5 py-3 text-muted-foreground font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFin.map(row => {
                        const rev = fmtN(row.revenue);
                        const exp = fmtN(row.expenses);
                        const np = fmtN(row.net_profit);
                        const margin = fmtN(row.net_profit_margin) * 100;
                        return (
                          <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3 font-medium text-foreground">{MONTHS_SHORT[(row.month ?? 1) - 1]} {row.year}</td>
                            <td className="px-4 py-3 text-right text-foreground">{fmtDFull(rev)}</td>
                            <td className="px-4 py-3 text-right text-foreground">{fmtDFull(exp)}</td>
                            <td className="px-4 py-3 text-right font-bold" style={{ color: np >= 0 ? TEAL : RED }}>{fmtDFull(np)}</td>
                            <td className="px-5 py-3 text-right font-semibold" style={{ color: margin >= 30 ? TEAL : margin >= 15 ? AMBER : RED }}>{margin.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
