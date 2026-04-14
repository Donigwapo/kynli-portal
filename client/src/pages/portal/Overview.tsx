import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Percent, Users,
  ArrowUpRight, ArrowDownRight, CheckCircle2, Circle,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Link } from "wouter";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const AMBER = "oklch(0.78 0.16 60)";
const MUTED_FG = "oklch(0.50 0.008 240)";

function fmtD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function KpiCard({
  label, value, budget, variance, variancePct, icon, invertGood = false,
}: {
  label: string; value: string; budget?: string; variance?: number;
  variancePct?: number; icon: React.ReactNode; invertGood?: boolean;
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
  const { impersonatingTenantSlug } = usePortal();
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const { data: tenant } = trpc.tenant.me.useQuery(undefined, { enabled: !impersonatingTenantSlug });
  const tslug = impersonatingTenantSlug ?? tenant?.slug ?? null;

  const { data: financials = [] } = trpc.financials.get.useQuery(
    { year, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug, staleTime: 30_000 }
  );
  const { data: salesList = [] } = trpc.sales.getByYear.useQuery(
    { year, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug, staleTime: 30_000 }
  );
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const { data: coachingItems = [] } = trpc.coaching.list.useQuery(
    { year, quarter: currentQ, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug, staleTime: 30_000 }
  );
  const { data: rosterData = [] } = trpc.roster.list.useQuery(
    { tenantSlug: tslug ?? undefined },
    { enabled: !!tslug, staleTime: 30_000 }
  );

  const latestPeriod = useMemo(() => {
    const withData = financials.filter(f => (f.revenue ?? 0) > 0 || (f.expenses ?? 0) > 0);
    return withData[withData.length - 1] ?? financials[financials.length - 1] ?? null;
  }, [financials]);

  const { data: lineItemsData = [] } = trpc.financials.lineItems.useQuery(
    { year, month: latestPeriod?.month ?? now.getMonth() + 1, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug && !!latestPeriod, staleTime: 30_000 }
  );

  const ytdRevenue = useMemo(() => financials.reduce((s, f) => s + (f.revenue ?? 0), 0), [financials]);
  const ytdExpenses = useMemo(() => financials.reduce((s, f) => s + (f.expenses ?? 0), 0), [financials]);
  const ytdProfit = ytdRevenue - ytdExpenses;
  const ytdMargin = ytdRevenue > 0 ? (ytdProfit / ytdRevenue) * 100 : 0;
  const ytdBudgetRevenue = useMemo(() => financials.reduce((s, f) => s + (f.budget_revenue ?? 0), 0), [financials]);
  const ytdBudgetExpenses = useMemo(() => financials.reduce((s, f) => s + (f.budget_expenses ?? 0), 0), [financials]);
  const ytdBudgetProfit = ytdBudgetRevenue - ytdBudgetExpenses;

  const ytdGoal = salesList.reduce((s, m) => s + (m.goal_clients ?? 0), 0);
  const ytdActual = salesList.reduce((s, m) => s + (m.signed_clients ?? 0), 0);
  const ytdReferrals = salesList.reduce((s, m) => s + (m.referral_count ?? 0), 0);
  const ytdOutbound = salesList.reduce((s, m) => s + (m.outbound_count ?? 0), 0);
  const salesAchievement = ytdGoal > 0 ? Math.min((ytdActual / ytdGoal) * 100, 100) : 0;
  const referralRate = ytdActual > 0 ? (ytdReferrals / ytdActual) * 100 : 0;

  const activeClients = rosterData.filter(c => c.status === "active").length;
  const churnedClients = rosterData.filter(c => c.status === "churned").length;

  // Active clients by package for donut chart
  const TIER_COLORS: Record<string, string> = {
    "Video Production": "oklch(0.68 0.18 145)",
    "Social Media":     "oklch(0.75 0.15 192)",
    "Brand Strategy":   "oklch(0.72 0.18 280)",
    "Content + Photo":  "oklch(0.78 0.16 60)",
    "Full Service":     "oklch(0.62 0.22 25)",
  };
  const TIER_FALLBACK = "oklch(0.35 0.005 240)";
  const tierBreakdown = useMemo(() => {
    const active = rosterData.filter(c => c.status === "active");
    const counts: Record<string, number> = {};
    active.forEach(c => { counts[c.package] = (counts[c.package] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rosterData]);

  const incomeItems = lineItemsData.filter(li => li.type === "income");
  const expenseItems = lineItemsData.filter(li => li.type === "expense");
  const totalIncome = incomeItems.reduce((s, li) => s + (li.amount ?? 0), 0) || 1;
  const totalExp = expenseItems.reduce((s, li) => s + (li.amount ?? 0), 0) || 1;
  const topIncome = [...incomeItems].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5);
  const topExpenses = [...expenseItems].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5);

  const chartData = MONTHS.map((month, i) => {
    const rec = financials.find(f => f.month === i + 1);
    return {
      month,
      Revenue: rec?.revenue ?? 0,
      Profit: rec?.net_profit ?? 0,
      Budget: rec?.budget_revenue ?? 0,
      Expenses: rec?.expenses ?? 0,
    };
  });

  const periodLabel = latestPeriod
    ? `${MONTHS[(latestPeriod.month - 1)]} ${latestPeriod.year}`
    : `${MONTHS[now.getMonth()]} ${year}`;

  const revVariancePct = ytdBudgetRevenue > 0 ? ((ytdRevenue / ytdBudgetRevenue) * 100 - 100) : 0;
  const expVariancePct = ytdBudgetExpenses > 0 ? ((ytdExpenses / ytdBudgetExpenses) * 100 - 100) : 0;
  const profitVariancePct = ytdBudgetProfit > 0 ? ((ytdProfit / ytdBudgetProfit) * 100 - 100) : 0;

  const completedGoals = coachingItems.filter(g => g.completed).length;
  const totalGoals = coachingItems.length;
  const goalPct = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
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

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Revenue YTD" value={fmtD(ytdRevenue)} budget={fmtD(ytdBudgetRevenue)}
            variance={ytdRevenue - ytdBudgetRevenue} variancePct={revVariancePct} icon={<DollarSign size={16} />} />
          <KpiCard label="Expenses YTD" value={fmtD(ytdExpenses)} budget={fmtD(ytdBudgetExpenses)}
            variance={ytdExpenses - ytdBudgetExpenses} variancePct={expVariancePct} icon={<TrendingDown size={16} />} invertGood />
          <KpiCard label="Net Profit YTD" value={fmtD(ytdProfit)} budget={fmtD(ytdBudgetProfit)}
            variance={ytdProfit - ytdBudgetProfit} variancePct={profitVariancePct} icon={<TrendingUp size={16} />} />
          <KpiCard label="Net Margin" value={fmtPct(ytdMargin)} budget="35% target"
            variance={ytdMargin - 35} variancePct={ytdMargin - 35} icon={<Percent size={16} />} />
        </div>

        {/* Sales Target + Client Snapshot */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Sales Target — {year} YTD</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ytdActual} of {ytdGoal} clients signed · {fmtPct(salesAchievement)} achieved
                </p>
              </div>
              <Link href="/portal/sales" className="text-xs text-primary hover:underline">View Sales →</Link>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Progress</span>
                <span className="font-medium" style={{ color: salesAchievement >= 100 ? GREEN : TEAL }}>{fmtPct(salesAchievement)}</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-3 rounded-full transition-all duration-500"
                  style={{ width: `${salesAchievement}%`, backgroundColor: salesAchievement >= 100 ? GREEN : TEAL }} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Signed", value: ytdActual, color: TEAL },
                { label: "Goal", value: ytdGoal, color: MUTED_FG },
                { label: "Referrals", value: ytdReferrals, color: GREEN },
                { label: "Outbound", value: ytdOutbound, color: AMBER },
              ].map(item => (
                <div key={item.label} className="bg-background border border-border rounded-lg p-3 text-center">
                  <div className="text-xl font-bold" style={{ color: item.color }}>{item.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Client Roster</h2>
              <Link href="/portal/clients" className="text-xs text-primary hover:underline">View All →</Link>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Active</span>
                <span className="text-sm font-bold" style={{ color: GREEN }}>{activeClients}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-1.5 rounded-full" style={{
                  width: rosterData.length > 0 ? `${(activeClients / rosterData.length) * 100}%` : "0%",
                  backgroundColor: GREEN,
                }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Churned</span>
                <span className="text-sm font-bold" style={{ color: RED }}>{churnedClients}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-1.5 rounded-full" style={{
                  width: rosterData.length > 0 ? `${(churnedClients / rosterData.length) * 100}%` : "0%",
                  backgroundColor: RED,
                }} />
              </div>
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-sm font-bold text-foreground">{rosterData.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Referral Rate</span>
                <span className="text-sm font-bold" style={{ color: TEAL }}>{fmtPct(referralRate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Income + Top Expenses */}
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

        {/* Revenue vs Budget vs Expenses Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">{year} — Revenue vs Budget vs Expenses</h2>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: TEAL }} />Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: GREEN }} />Budget
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: RED }} />Expenses
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)" }}
                formatter={(v: number) => [fmtD(v)]}
              />
              <Bar dataKey="Revenue" fill={TEAL} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Budget" fill={GREEN} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill={RED} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue & Profit Trend + Active Clients by Tier + Coaching Goals */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Revenue & Profit Trend</h2>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={TEAL} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GREEN} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: MUTED_FG, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: MUTED_FG, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [fmtD(v)]}
                />
                <Area type="monotone" dataKey="Revenue" stroke={TEAL} fill="url(#revGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Profit" stroke={GREEN} fill="url(#profitGrad)" strokeWidth={2} dot={false} />
                <Legend wrapperStyle={{ fontSize: 11, color: MUTED_FG }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Active Clients by Tier — donut chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Active Clients by Tier</h2>
            {tierBreakdown.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-xs">
                No active clients yet
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <PieChart width={160} height={160}>
                    <Pie
                      data={tierBreakdown}
                      cx={75}
                      cy={75}
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {tierBreakdown.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={TIER_COLORS[entry.name] ?? TIER_FALLBACK}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 11 }}
                      formatter={(v: number, name: string) => [v, name]}
                    />
                  </PieChart>
                </div>
                <div className="space-y-2 mt-2">
                  {tierBreakdown.map(entry => (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: TIER_COLORS[entry.name] ?? TIER_FALLBACK }}
                        />
                        <span className="text-muted-foreground truncate max-w-[110px]">{entry.name}</span>
                      </div>
                      <span className="font-semibold text-foreground">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Q{currentQ} {year} — Coaching Goals</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{completedGoals}/{totalGoals} completed</p>
              </div>
              <Link href="/portal/coaching" className="text-xs text-primary hover:underline">View All →</Link>
            </div>
            {totalGoals > 0 && (
              <div className="mb-4">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? GREEN : TEAL }} />
                </div>
              </div>
            )}
            {coachingItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No coaching goals set for this quarter.</p>
            ) : (
              <ul className="space-y-2.5">
                {coachingItems.slice(0, 6).map((goal) => (
                  <li key={goal.id} className="flex items-start gap-2.5 text-sm">
                    {goal.completed ? (
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: TEAL }} />
                    ) : (
                      <Circle size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <p className={`text-xs ${goal.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {goal.title}
                      </p>
                      {goal.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{goal.description}</p>
                      )}
                    </div>
                  </li>
                ))}
                {coachingItems.length > 6 && (
                  <li className="text-xs text-muted-foreground pl-6">+{coachingItems.length - 6} more goals</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
