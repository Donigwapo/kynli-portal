import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const AMBER = "oklch(0.78 0.16 60)";
const MUTED_FG = "oklch(0.50 0.008 240)";

function fmtD(n: number | string | null | undefined) {
  const v = typeof n === "number" ? n : parseFloat(n ?? "0");
  if (isNaN(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toLocaleString()}`;
}
function fmtN(n: number | string | null | undefined) {
  return typeof n === "number" ? n : parseFloat(n ?? "0") || 0;
}

export default function Reports() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { impersonatingTenantSlug } = usePortal();
  const tslug = impersonatingTenantSlug ?? undefined;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const { data: yearlyData = [], isLoading } = trpc.financials.get.useQuery(
    { year, tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  const chartData = yearlyData.map(row => ({
    month: MONTHS_SHORT[(row.month ?? 1) - 1],
    Revenue: fmtN(row.revenue),
    Budget: fmtN(row.budget_revenue),
    Expenses: fmtN(row.expenses),
    "Net Profit": fmtN(row.net_profit),
  }));

  const totals = useMemo(() => yearlyData.reduce(
    (acc, row) => ({
      revenue: acc.revenue + fmtN(row.revenue),
      expenses: acc.expenses + fmtN(row.expenses),
      netProfit: acc.netProfit + fmtN(row.net_profit),
      budgetRevenue: acc.budgetRevenue + fmtN(row.budget_revenue),
    }),
    { revenue: 0, expenses: 0, netProfit: 0, budgetRevenue: 0 }
  ), [yearlyData]);

  const avgMargin = yearlyData.length > 0
    ? yearlyData.reduce((s, r) => s + fmtN(r.net_profit_margin) * 100, 0) / yearlyData.length
    : 0;

  const revVsBudgetPct = totals.budgetRevenue > 0
    ? ((totals.revenue / totals.budgetRevenue) * 100 - 100)
    : 0;

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Annual Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Financial summary — {year}</p>
          </div>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: "Total Revenue",
              value: fmtD(totals.revenue),
              sub: `vs budget: ${revVsBudgetPct >= 0 ? "+" : ""}${revVsBudgetPct.toFixed(1)}%`,
              color: TEAL,
              icon: <DollarSign size={16} />,
            },
            {
              label: "Total Expenses",
              value: fmtD(totals.expenses),
              sub: `${totals.revenue > 0 ? ((totals.expenses / totals.revenue) * 100).toFixed(1) : "0"}% of revenue`,
              color: RED,
              icon: <TrendingDown size={16} />,
            },
            {
              label: "Net Profit",
              value: fmtD(totals.netProfit),
              sub: totals.netProfit >= 0 ? "Profitable year" : "Net loss",
              color: totals.netProfit >= 0 ? GREEN : RED,
              icon: <TrendingUp size={16} />,
            },
            {
              label: "Avg Net Margin",
              value: `${avgMargin.toFixed(1)}%`,
              sub: avgMargin >= 35 ? "Above 35% target" : "Below 35% target",
              color: avgMargin >= 35 ? GREEN : AMBER,
              icon: <Percent size={16} />,
            },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
                <span className="text-muted-foreground">{card.icon}</span>
              </div>
              <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Revenue vs Budget vs Expenses Line Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">{year} — Revenue vs Budget vs Expenses</h2>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: TEAL }} />Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 inline-block border-t-2 border-dashed" style={{ borderColor: GREEN }} />Budget
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: RED }} />Expenses
              </span>
            </div>
          </div>
          {isLoading ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : chartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data for {year}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                  labelStyle={{ color: "var(--foreground)" }}
                  formatter={(v: number) => [fmtD(v)]}
                />
                <Line type="monotone" dataKey="Revenue" stroke={TEAL} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Budget" stroke={GREEN} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                <Line type="monotone" dataKey="Expenses" stroke={RED} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Net Profit Trend */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{year} — Net Profit Trend</h2>
          {chartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data for {year}</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                  labelStyle={{ color: "var(--foreground)" }}
                  formatter={(v: number) => [fmtD(v)]}
                />
                <Bar dataKey="Net Profit" radius={[3, 3, 0, 0]}
                  fill={TEAL}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly Breakdown Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Monthly Breakdown — {year}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Month","Revenue","Budget","Expenses","Net Profit","Margin"].map(h => (
                    <th key={h} className={`py-3 px-5 text-xs text-muted-foreground font-medium ${h === "Month" ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearlyData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">No data available for {year}</td>
                  </tr>
                ) : yearlyData.map(row => {
                  const np = fmtN(row.net_profit);
                  const mg = fmtN(row.net_profit_margin) * 100;
                  return (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="py-3 px-5 text-foreground font-medium">{MONTHS_LONG[(row.month ?? 1) - 1]}</td>
                      <td className="py-3 px-5 text-right" style={{ color: TEAL }}>{fmtD(row.revenue)}</td>
                      <td className="py-3 px-5 text-right text-muted-foreground">{fmtD(row.budget_revenue)}</td>
                      <td className="py-3 px-5 text-right" style={{ color: RED }}>{fmtD(row.expenses)}</td>
                      <td className="py-3 px-5 text-right font-medium" style={{ color: np >= 0 ? GREEN : RED }}>{fmtD(row.net_profit)}</td>
                      <td className="py-3 px-5 text-right" style={{ color: mg >= 35 ? GREEN : MUTED_FG }}>
                        {row.net_profit_margin != null ? `${mg.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {yearlyData.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td className="py-3 px-5 font-semibold text-foreground text-xs uppercase tracking-wider">Total</td>
                    <td className="py-3 px-5 text-right font-bold" style={{ color: TEAL }}>{fmtD(totals.revenue)}</td>
                    <td className="py-3 px-5 text-right font-semibold text-muted-foreground">{fmtD(totals.budgetRevenue)}</td>
                    <td className="py-3 px-5 text-right font-semibold" style={{ color: RED }}>{fmtD(totals.expenses)}</td>
                    <td className="py-3 px-5 text-right font-bold" style={{ color: totals.netProfit >= 0 ? GREEN : RED }}>{fmtD(totals.netProfit)}</td>
                    <td className="py-3 px-5 text-right font-semibold" style={{ color: avgMargin >= 35 ? GREEN : MUTED_FG }}>
                      {avgMargin.toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
