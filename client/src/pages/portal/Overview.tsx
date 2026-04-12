import { useState } from "react";
import {
  BarChart, Bar, ComposedChart, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, PieChart, Pie, Legend,
} from "recharts";
import { BookOpen, DollarSign, TrendingDown, TrendingUp, Percent, Target } from "lucide-react";
import { trpc } from "../../lib/trpc";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(val: string | number | null | undefined): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}
function num(val: string | null | undefined): number {
  return parseFloat(val ?? "0") || 0;
}

// Thin progress bar used for top 5 lists
function ThinBar({ pct, red = false }: { pct: number; red?: boolean }) {
  return (
    <div className="w-full h-[3px] bg-white/10 rounded-full mt-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full ${red ? "bg-red-500" : "bg-primary"}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// Custom tooltip for charts
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-white/60 mb-1.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-white/70">{p.name}:</span>
          <span className="text-white font-medium">{typeof p.value === "number" && p.value > 1000 ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

const TIER_COLORS: Record<string, string> = {
  momentum: "#22d3ee",
  growth_1: "#a78bfa",
  growth_2: "#34d399",
  cfo: "#f59e0b",
  legacy: "#6b7280",
};
const TIER_LABELS: Record<string, string> = {
  momentum: "Momentum",
  growth_1: "Growth 1",
  growth_2: "Growth 2",
  cfo: "Accelerate/CFO",
  legacy: "Legacy",
};

export default function Overview() {
  const now = new Date();
  const [year] = useState(now.getFullYear());

  const { data: tenant } = trpc.tenant.me.useQuery(undefined);
  const { data: financials } = trpc.financials.get.useQuery(
    { year, tenantId: undefined },
    { enabled: !!tenant }
  );
  const { data: salesData } = trpc.sales.get.useQuery(
    { year, month: now.getMonth() + 1, tenantId: undefined },
    { enabled: !!tenant }
  );
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const quarterKey = `${year}-Q${currentQ}`;
  const { data: coachingItems } = trpc.coaching.list.useQuery(
    { quarter: quarterKey, tenantId: undefined },
    { enabled: !!tenant }
  );
  const latestPeriod = financials?.[0];
  const { data: lineItemsData } = trpc.financials.lineItems.useQuery(
    { year, month: latestPeriod?.month ?? now.getMonth() + 1, tenantId: undefined },
    { enabled: !!tenant && !!latestPeriod }
  );

  // ── Metric card values ────────────────────────────────────────────────────
  const revenue = num(latestPeriod?.revenue);
  const expenses = num(latestPeriod?.expenses);
  const profit = num(latestPeriod?.netProfit);
  const margin = num(latestPeriod?.margin);
  const budgetRevenue = num(latestPeriod?.budgetRevenue) || revenue;
  const budgetExpenses = num(latestPeriod?.budgetExpenses) || expenses;
  const revPct = budgetRevenue > 0 ? Math.round((revenue / budgetRevenue) * 100) : null;
  const expPct = budgetExpenses > 0 ? Math.round((expenses / budgetExpenses) * 100) : null;

  const latestMonthName = latestPeriod
    ? `${MONTHS_SHORT[(latestPeriod.month ?? 1) - 1]} ${latestPeriod.year}`
    : "—";

  // ── Sales target ──────────────────────────────────────────────────────────
  const salesRow = Array.isArray(salesData) ? salesData[0] : salesData;
  const salesGoal = num((salesRow as any)?.goalClients) || 48;
  const salesSigned = num((salesRow as any)?.signedClients);
  const salesPct = salesGoal > 0 ? Math.round((salesSigned / salesGoal) * 100) : 0;
  const referrals = num((salesRow as any)?.referralCount);
  const outbound = num((salesRow as any)?.outboundCount);
  const referralRate = (referrals + outbound) > 0 ? Math.round((referrals / (referrals + outbound)) * 100) : 0;

  // ── Top 5 income / expenses ───────────────────────────────────────────────
  const topIncome = (lineItemsData ?? []).filter((i) => i.type === "income").slice(0, 5);
  const topExpenses = (lineItemsData ?? []).filter((i) => i.type === "expense").slice(0, 5);
  const totalIncome = topIncome.reduce((s, i) => s + num(i.amount), 0) || 1;
  const totalExp = topExpenses.reduce((s, i) => s + num(i.amount), 0) || 1;

  // ── Revenue vs Budget chart ───────────────────────────────────────────────
  const chartData = MONTHS_SHORT.map((m, idx) => {
    const row = (financials ?? []).find((r) => r.month === idx + 1);
    const actual = row ? num(row.revenue) : null;
    const budget = row ? num(row.budgetRevenue) : null;
    const vsBudget = actual !== null && budget && budget > 0
      ? Math.round(((actual - budget) / budget) * 100)
      : null;
    return { month: m, actual, budget, vsBudget };
  });

  // ── Revenue & Profit trend ────────────────────────────────────────────────
  const trendData = MONTHS_SHORT.map((m, idx) => {
    const row = (financials ?? []).find((r) => r.month === idx + 1);
    return {
      month: `${m} '${String(year).slice(2)}`,
      revenue: row ? num(row.revenue) : null,
      profit: row ? num(row.netProfit) : null,
    };
  });

  // ── Clients by tier (stub — real data would come from admin endpoint) ─────
  // For client portal, we just show their own tier
  const tierData = tenant
    ? [{ name: TIER_LABELS[tenant.packageTier] ?? tenant.packageTier, value: 1, color: TIER_COLORS[tenant.packageTier] ?? "#6b7280" }]
    : [];

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#1a1a2e",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "8px",
      fontSize: 12,
    },
  };

  return (
    <div className="p-6 space-y-5 min-h-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Strategic Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Latest period: {latestMonthName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Active Clients</p>
          <p className="text-4xl font-bold text-primary leading-none mt-0.5">
            {tenant ? "1" : "—"}
          </p>
        </div>
      </div>

      {/* ── 4 Metric Cards ── */}
      <div className="grid grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign size={16} className="text-primary" />
            </div>
            {revPct !== null && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${revPct >= 90 ? "bg-primary/15 text-primary" : "bg-red-500/15 text-red-400"}`}>
                ↑ {revPct}% of budget
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(revenue)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Revenue</p>
          {budgetRevenue > 0 && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">Budget: {fmt(budgetRevenue)}</p>
          )}
        </div>

        {/* Expenses */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <TrendingDown size={16} className="text-red-400" />
            </div>
            {expPct !== null && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${expPct <= 100 ? "bg-primary/15 text-primary" : "bg-red-500/15 text-red-400"}`}>
                ↑ {expPct}% of budget
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(expenses)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Expenses</p>
          {budgetExpenses > 0 && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">Budget: {fmt(budgetExpenses)}</p>
          )}
        </div>

        {/* Net Profit */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-green-400" />
            </div>
          </div>
          <p className={`text-2xl font-bold ${profit >= 0 ? "text-foreground" : "text-red-400"}`}>{fmt(profit)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Net Profit</p>
        </div>

        {/* Net Profit Margin */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
              <Percent size={16} className="text-muted-foreground" />
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${margin >= 35 ? "bg-primary/15 text-primary" : "bg-white/10 text-muted-foreground"}`}>
              {margin >= 35 ? "On Target" : "Below Target"}
            </span>
          </div>
          <p className={`text-2xl font-bold ${margin >= 35 ? "text-foreground" : "text-foreground"}`}>
            {latestPeriod ? `${margin.toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Net Profit Margin</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Target: 35%+</p>
        </div>
      </div>

      {/* ── Sales Target Bar ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Sales Target — {year} YTD</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Goal: <span className="text-foreground font-semibold">{salesGoal}</span></span>
            <span className="text-muted-foreground">Actual: <span className="text-foreground font-semibold">{salesSigned}</span></span>
            <span className={`font-bold text-base ${salesPct >= 100 ? "text-primary" : salesPct >= 50 ? "text-yellow-400" : "text-red-400"}`}>
              {salesPct}%
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(salesPct, 100)}%` }}
          />
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span>Referrals: <span className="text-foreground">{referrals}</span></span>
          <span>Outbound: <span className="text-foreground">{outbound}</span></span>
          <span>Referral Rate: <span className="text-foreground">{referralRate}%</span></span>
        </div>
      </div>

      {/* ── Top 5 Income + Top 5 Expenses ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Income */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Top 5 Income Sources</h2>
          {topIncome.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No income data for this period.</p>
          ) : (
            <div className="space-y-3.5">
              {topIncome.map((item) => {
                const amt = num(item.amount);
                const pct = (amt / totalIncome) * 100;
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground truncate max-w-[55%]">{item.label}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-foreground font-medium">{fmt(amt)}</span>
                        <span className="text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <ThinBar pct={pct} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Top 5 Expenses</h2>
          {topExpenses.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No expense data for this period.</p>
          ) : (
            <div className="space-y-3.5">
              {topExpenses.map((item) => {
                const amt = num(item.amount);
                const pct = (amt / totalExp) * 100;
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground truncate max-w-[55%]">{item.label}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-foreground font-medium">{fmt(amt)}</span>
                        <span className="text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <ThinBar pct={pct} red />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Revenue: Actuals vs Budget Chart ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{year} Revenue: Actuals vs Budget</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Solid bars = actuals locked in · Dashed line = full-year budget target</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm bg-red-500 inline-block" />Actual Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 border-t-2 border-dashed border-yellow-400 inline-block" />Budget Target
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} domain={[-30, 30]} />
            <Tooltip content={<ChartTooltip />} />
            <Bar yAxisId="left" dataKey="actual" name="Actual Revenue" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.actual ? "oklch(0.62 0.22 25)" : "rgba(255,255,255,0.05)"} />
              ))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="vsBudget" name="vs Budget" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} strokeDasharray="4 2" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        {/* Monthly callouts */}
        <div className="flex gap-4 mt-2 flex-wrap">
          {chartData.filter((d) => d.actual !== null).map((d) => (
            <span key={d.month} className="text-xs text-muted-foreground">
              {d.month}:{" "}
              <span className={`font-semibold ${(d.vsBudget ?? 0) >= 0 ? "text-primary" : "text-red-400"}`}>
                {d.vsBudget !== null ? `${d.vsBudget >= 0 ? "+" : ""}${d.vsBudget}% vs budget` : "—"}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Revenue & Profit Trend + Clients by Tier ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Trend chart — takes 2/3 */}
        <div className="col-span-2 bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-1">Revenue & Profit Trend</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.75 0.15 192)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.75 0.15 192)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.68 0.18 145)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.68 0.18 145)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="oklch(0.75 0.15 192)" strokeWidth={2} fill="url(#revGrad)" connectNulls dot={false} />
              <Area type="monotone" dataKey="profit" name="Profit" stroke="oklch(0.68 0.18 145)" strokeWidth={2} fill="url(#profGrad)" connectNulls dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary inline-block rounded" />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-400 inline-block rounded" />Profit</span>
          </div>
        </div>

        {/* Clients by tier — takes 1/3 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Active Clients by Tier</h2>
          {tierData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={tierData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                    {tierData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {tierData.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="text-muted-foreground">{t.name}</span>
                    </div>
                    <span className="text-foreground font-medium">{t.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No tier data</p>
          )}
        </div>
      </div>

      {/* ── Coaching Goals ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Q{currentQ} {year} — Coaching Goals</h2>
          </div>
        </div>
        {!coachingItems || coachingItems.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No coaching goals for this quarter.</p>
        ) : (
          <div className="space-y-1.5">
            {coachingItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 shrink-0 ${item.isCompleted ? "text-primary" : "text-muted-foreground"}`}>
                  {item.isCompleted ? "✓" : "○"}
                </span>
                <span className={item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"}>
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
