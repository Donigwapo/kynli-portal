import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDollar(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function MetricCard({
  label, value, budget, budgetPct, icon, status, target,
}: {
  label: string; value: string; budget?: string; budgetPct?: number;
  icon: React.ReactNode; status?: "good" | "bad" | "neutral"; target?: string;
}) {
  const badgeText =
    status === "good" && budgetPct != null ? `↑ ${budgetPct.toFixed(0)}% of budget` :
    status === "bad" ? "Below Target" : null;
  const badgeCls =
    status === "good" ? "bg-green-500/15 text-green-400" :
    status === "bad" ? "bg-red-500/15 text-red-400" : "";

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        {badgeText && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeCls}`}>{badgeText}</span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {budget && <p className="text-xs text-muted-foreground mt-0.5">Budget: {budget}</p>}
        {target && <p className="text-xs text-muted-foreground mt-0.5">Target: {target}</p>}
      </div>
    </div>
  );
}

function ThinBar({ value, max, red = false }: { value: number; max: number; red?: boolean }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${red ? "bg-red-500" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Overview() {
  const { impersonatingTenantSlug } = usePortal();
  const now = new Date();
  const [year] = useState(now.getFullYear());

  const { data: tenant } = trpc.tenant.me.useQuery(undefined, { enabled: !impersonatingTenantSlug });
  const tslug = impersonatingTenantSlug ?? tenant?.slug ?? null;

  const { data: financials } = trpc.financials.get.useQuery(
    { year, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug }
  );
  const { data: salesData } = trpc.sales.get.useQuery(
    { year, month: now.getMonth() + 1, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug }
  );
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const { data: coachingItems } = trpc.coaching.list.useQuery(
    { year, quarter: currentQ, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug }
  );

  const latestPeriod = financials?.[0];
  const { data: lineItemsData } = trpc.financials.lineItems.useQuery(
    { year, month: latestPeriod?.month ?? now.getMonth() + 1, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug && !!latestPeriod }
  );
  const revenue = latestPeriod?.revenue ?? 0;
  const expenses = latestPeriod?.expenses ?? 0;
  const profit = latestPeriod?.net_profit ?? 0;
  const margin = (latestPeriod?.net_profit_margin ?? 0) * 100;
  const budgetRevenue = latestPeriod?.budget_revenue ?? revenue;
  const budgetExpenses = latestPeriod?.budget_expenses ?? expenses;
  const revPct = budgetRevenue > 0 ? (revenue / budgetRevenue) * 100 : 0;
  const expPct = budgetExpenses > 0 ? (expenses / budgetExpenses) * 100 : 0;

  const chartData = MONTHS.map((month, i) => {
    const rec = financials?.find((f) => f.month === i + 1 && f.year === year);
    return {
      month,
      revenue: rec?.revenue ?? 0,
      profit: rec?.net_profit ?? 0,
      budget: rec?.budget_revenue ?? 0,
    };
  });

  const salesGoal = salesData?.goal_clients ?? 48;
  const salesActual = salesData?.signed_clients ?? 0;
  const salesPct = salesGoal > 0 ? Math.round((salesActual / salesGoal) * 100) : 0;
  const referrals = salesData?.referral_count ?? 0;
  const outbound = salesData?.outbound_count ?? 0;

  const quarterGoals = coachingItems ?? [];

  const topIncome = (lineItemsData ?? []).filter((l) => l.type === "income").slice(0, 5);
  const topExpenses = (lineItemsData ?? []).filter((l) => l.type === "expense").slice(0, 5);
  const totalIncome = topIncome.reduce((s, i) => s + (i.amount ?? 0), 0) || 1;
  const totalExp = topExpenses.reduce((s, i) => s + (i.amount ?? 0), 0) || 1;

  const periodLabel = latestPeriod
    ? `${MONTHS[(latestPeriod.month - 1)]} ${latestPeriod.year}`
    : format(now, "MMM yyyy");

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Strategic Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Latest period: {periodLabel}</p>
      </div>

      {/* 4 metric cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Revenue" value={fmtDollar(revenue)} budget={fmtDollar(budgetRevenue)} budgetPct={revPct} icon={<DollarSign size={16} />} status={revPct >= 90 ? "good" : "neutral"} />
        <MetricCard label="Total Expenses" value={fmtDollar(expenses)} budget={fmtDollar(budgetExpenses)} budgetPct={expPct} icon={<TrendingDown size={16} />} status={expPct <= 100 ? "good" : "bad"} />
        <MetricCard label="Net Profit" value={fmtDollar(profit)} icon={<TrendingUp size={16} />} status={profit >= 0 ? "neutral" : "bad"} />
        <MetricCard label="Net Profit Margin" value={`${margin.toFixed(1)}%`} target="35%+" icon={<Percent size={16} />} status={margin >= 35 ? "good" : "bad"} />
      </div>

      {/* Sales Target */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Sales Target — {year} YTD</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Goal: <span className="text-foreground font-medium">{salesGoal}</span></span>
            <span className="text-muted-foreground">Actual: <span className="text-foreground font-medium">{salesActual}</span></span>
            <span className="text-red-400 font-bold">{salesPct}%</span>
          </div>
        </div>
        <ThinBar value={salesActual} max={salesGoal} />
        <div className="flex gap-6 mt-2 text-xs text-muted-foreground">
          <span>Referrals: <span className="text-foreground">{referrals}</span></span>
          <span>Outbound: <span className="text-foreground">{outbound}</span></span>
          <span>Referral Rate: <span className="text-foreground">{referrals + outbound > 0 ? Math.round((referrals / (referrals + outbound)) * 100) : 0}%</span></span>
        </div>
      </div>

      {/* Top 5 Income + Top 5 Expenses */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Top 5 Income Sources</h2>
          <div className="space-y-3">
            {topIncome.length === 0 && <p className="text-xs text-muted-foreground">No data for this period.</p>}
            {topIncome.map((item: any) => {
              const amt = item.amount ?? 0;
              const p = ((amt / totalIncome) * 100).toFixed(1);
              const budgetAmt = item.budget_amount ?? null;
              const bp = budgetAmt && budgetAmt > 0 ? Math.round((amt / budgetAmt) * 100) : null;
              return (
                <div key={item.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground truncate max-w-[55%]">{item.label}</span>
                    <span className="text-foreground font-medium">{fmtDollar(amt)} <span className="text-muted-foreground">{p}%</span></span>
                  </div>
                  <ThinBar value={amt} max={totalIncome} />
                  {bp !== null && budgetAmt && <p className="text-xs text-muted-foreground mt-0.5">Budget: {fmtDollar(budgetAmt)} · {bp}% of budget used</p>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Top 5 Expenses</h2>
          <div className="space-y-3">
            {topExpenses.length === 0 && <p className="text-xs text-muted-foreground">No data for this period.</p>}
            {topExpenses.map((item: any) => {
              const amt = item.amount ?? 0;
              const p = ((amt / totalExp) * 100).toFixed(1);
              const budgetAmt = item.budget_amount ?? null;
              const bp = budgetAmt && budgetAmt > 0 ? Math.round((amt / budgetAmt) * 100) : null;
              const over = bp !== null && bp > 100;
              return (
                <div key={item.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground truncate max-w-[55%]">{item.label}</span>
                    <span className="text-foreground font-medium">{fmtDollar(amt)} <span className="text-muted-foreground">{p}%</span></span>
                  </div>
                  <ThinBar value={amt} max={totalExp} red={over} />
                  {bp !== null && budgetAmt && <p className={`text-xs mt-0.5 ${over ? "text-red-400" : "text-muted-foreground"}`}>Budget: {fmtDollar(budgetAmt)} · {bp}% of budget used</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Revenue vs Budget Chart */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-foreground">{year} Revenue: Actuals vs Budget</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-red-500 inline-block" />Actual Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-yellow-400 inline-block" />Budget Target</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Solid bars = actuals locked in · Dashed line = full-year budget target</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.005 240)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: "oklch(0.14 0.005 240)", border: "1px solid oklch(0.20 0.005 240)", borderRadius: "6px" }}
              labelStyle={{ color: "oklch(0.95 0.005 240)", fontSize: 12 }}
              formatter={(v: number) => [fmtDollar(v)]}
            />
            <Bar dataKey="revenue" fill="oklch(0.62 0.22 25)" radius={[2, 2, 0, 0]} name="Actual Revenue" />
            <Line type="monotone" dataKey="budget" stroke="oklch(0.78 0.16 60)" strokeDasharray="5 5" strokeWidth={2} dot={{ fill: "oklch(0.78 0.16 60)", r: 3 }} name="Budget Target" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue & Profit Trend + Coaching Goals */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Revenue & Profit Trend</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.75 0.15 192)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.75 0.15 192)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.68 0.18 145)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.68 0.18 145)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.005 240)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "oklch(0.14 0.005 240)", border: "1px solid oklch(0.20 0.005 240)", borderRadius: "6px" }}
                formatter={(v: number) => [fmtDollar(v)]}
              />
              <Area type="monotone" dataKey="revenue" stroke="oklch(0.75 0.15 192)" fill="url(#revGrad)" strokeWidth={2} dot={false} name="Revenue" />
              <Area type="monotone" dataKey="profit" stroke="oklch(0.68 0.18 145)" fill="url(#profitGrad)" strokeWidth={2} dot={false} name="Profit" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {year} Q{currentQ} — Coaching Goals
          </h2>
          {quarterGoals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No coaching goals set for this quarter.</p>
          ) : (
            <ul className="space-y-2">
              {quarterGoals.map((goal) => (
                <li key={goal.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 w-3 h-3 rounded-sm border shrink-0 ${goal.completed ? "bg-primary border-primary" : "border-border"}`} />
                  <span className={goal.completed ? "line-through text-muted-foreground" : "text-foreground"}>
                    {goal.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
