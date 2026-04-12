import { useState, useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { trpc } from "../../lib/trpc";
import { BarChart2, TrendingUp, TrendingDown } from "lucide-react";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(val: string | number | null | undefined, showSign = false): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  let str: string;
  if (abs >= 1_000_000) str = `$${(abs / 1_000_000).toFixed(1)}M`;
  else str = `$${abs.toLocaleString()}`;
  if (showSign && n > 0) return `+${str}`;
  if (n < 0) return `-${str}`;
  return str;
}
function num(val: string | number | null | undefined): number {
  return parseFloat(String(val ?? "0")) || 0;
}

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "oklch(0.14 0.005 240)", border: "1px solid oklch(0.20 0.005 240)", borderRadius: "6px", fontSize: 12 },
  labelStyle: { color: "oklch(0.95 0.005 240)" },
  formatter: (v: number) => [fmt(v)],
};
const TICK = { fill: "oklch(0.50 0.008 240)", fontSize: 11 };
const GRID = "oklch(0.20 0.005 240)";

const QUARTERS = [
  { label: "Q1 (Jan–Mar)", months: [1, 2, 3] },
  { label: "Q2 (Apr–Jun)", months: [4, 5, 6] },
  { label: "Q3 (Jul–Sep)", months: [7, 8, 9] },
  { label: "Q4 (Oct–Dec)", months: [10, 11, 12] },
];

type PeriodMode = "year" | "quarter" | "month";

export default function Reports() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [mode, setMode] = useState<PeriodMode>("year");
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const { data: yearlyData, isLoading } = trpc.financials.get.useQuery({ year, tenantId: undefined });
  // Fetch all line items for the year for top income/expense lists
  const { data: lineItems } = trpc.financials.lineItemsByYear.useQuery({ year, tenantId: undefined });

  // Filter rows based on mode
  const filteredRows = useMemo(() => {
    const rows = yearlyData ?? [];
    if (mode === "year") return rows;
    if (mode === "quarter") return rows.filter((r) => QUARTERS[quarter].months.includes(r.month ?? 0));
    if (mode === "month") return rows.filter((r) => r.month === month);
    return rows;
  }, [yearlyData, mode, quarter, month]);

  // Totals
  const totals = filteredRows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + num(r.revenue),
      budgetRevenue: acc.budgetRevenue + num(r.budgetRevenue),
      expenses: acc.expenses + num(r.expenses),
      budgetExpenses: acc.budgetExpenses + num(r.budgetExpenses),
      netProfit: acc.netProfit + num(r.netProfit),
    }),
    { revenue: 0, budgetRevenue: 0, expenses: 0, budgetExpenses: 0, netProfit: 0 }
  );
  const totalMargin = totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0;
  const budgetProfit = totals.budgetRevenue - totals.budgetExpenses;

  // Chart data (always yearly for the chart)
  const chartData = (yearlyData ?? []).map((r) => ({
    month: MONTHS_SHORT[(r.month ?? 1) - 1],
    Revenue: num(r.revenue),
    Budget: num(r.budgetRevenue),
    Expenses: num(r.expenses),
  }));

  // Top income/expense line items
  const incomeItems = (lineItems ?? []).filter((i) => i.type === "income");
  const expenseItems = (lineItems ?? []).filter((i) => i.type === "expense");
  const totalIncome = incomeItems.reduce((s, i) => s + num(i.amount), 0) || 1;
  const totalExpense = expenseItems.reduce((s, i) => s + num(i.amount), 0) || 1;

  // Period label
  const periodLabel = mode === "year"
    ? `Full Year ${year}`
    : mode === "quarter"
    ? `${QUARTERS[quarter].label} · ${year}`
    : `${MONTHS_SHORT[month - 1]} ${year}`;

  // Build monthly table rows for the selected period
  const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  const tableMonths = mode === "year" ? allMonths
    : mode === "quarter" ? QUARTERS[quarter].months
    : [month];

  const rowLookup: Record<number, typeof filteredRows[0]> = {};
  (yearlyData ?? []).forEach((r) => { rowLookup[r.month ?? 0] = r; });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart2 size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Reports &amp; Analytics</h1>
          </div>
          <p className="text-sm text-muted-foreground">Slice every metric by Year, Quarter, or Month</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Report Period:</span>
        <div className="flex gap-1 bg-background rounded-lg p-0.5">
          {(["year", "quarter", "month"] as PeriodMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-background border border-border rounded-md text-xs text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {mode === "quarter" && (
          <select
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value))}
            className="bg-background border border-border rounded-md text-xs text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {QUARTERS.map((q, i) => <option key={i} value={i}>{q.label}</option>)}
          </select>
        )}
        {mode === "month" && (
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-background border border-border rounded-md text-xs text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {MONTHS_SHORT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        )}
      </div>

      {/* Period label */}
      <div className="flex items-center gap-2">
        <span className="w-6 h-0.5 bg-primary rounded" />
        <h2 className="text-base font-semibold text-foreground">{periodLabel}</h2>
      </div>

      {/* 4 summary metric cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Total Revenue",
            icon: <span className="text-primary text-xs">$</span>,
            value: fmt(totals.revenue),
            sub: totals.budgetRevenue > 0 ? `Budget: ${fmt(totals.budgetRevenue)}` : undefined,
            vs: totals.budgetRevenue > 0 ? ((totals.revenue / totals.budgetRevenue - 1) * 100) : null,
          },
          {
            label: "Total Expenses",
            icon: <TrendingDown size={12} className="text-red-400" />,
            value: fmt(totals.expenses),
            sub: totals.budgetExpenses > 0 ? `Budget: ${fmt(totals.budgetExpenses)}` : undefined,
            vs: totals.budgetExpenses > 0 ? ((totals.expenses / totals.budgetExpenses - 1) * 100) : null,
            vsInvert: true,
          },
          {
            label: "Net Profit",
            icon: <TrendingUp size={12} className="text-green-400" />,
            value: fmt(totals.netProfit),
            sub: budgetProfit > 0 ? `Budget: ${fmt(budgetProfit)}` : undefined,
            vs: budgetProfit > 0 ? ((totals.netProfit / budgetProfit - 1) * 100) : null,
          },
          {
            label: "Net Margin",
            icon: <BarChart2 size={12} className="text-primary" />,
            value: `${totalMargin.toFixed(1)}%`,
            sub: "Target: 35%",
            vs: totalMargin - 35,
            vsLabel: "vs target",
          },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              {card.icon}
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
            </div>
            {isLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                {card.vs !== null && card.vs !== undefined && (
                  <p className={`text-xs font-medium mt-1 flex items-center gap-0.5 ${
                    (card.vsInvert ? card.vs <= 0 : card.vs >= 0) ? "text-green-400" : "text-red-400"
                  }`}>
                    {card.vs >= 0 ? "+" : ""}{card.vs.toFixed(1)}% {card.vsLabel ?? "vs target"}
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Monthly P&L Breakdown table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Monthly P&amp;L Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-muted-foreground font-medium px-4 py-2.5">Month</th>
                <th className="text-right text-muted-foreground font-medium px-4 py-2.5">Revenue</th>
                <th className="text-right text-muted-foreground font-medium px-4 py-2.5">Budget</th>
                <th className="text-right text-muted-foreground font-medium px-4 py-2.5">Variance</th>
                <th className="text-right text-muted-foreground font-medium px-4 py-2.5">Expenses</th>
                <th className="text-right text-muted-foreground font-medium px-4 py-2.5">Net Profit</th>
                <th className="text-right text-muted-foreground font-medium px-4 py-2.5">Margin</th>
                <th className="text-right text-muted-foreground font-medium px-4 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {tableMonths.map((m) => {
                const r = rowLookup[m];
                const rev = num(r?.revenue);
                const bud = num(r?.budgetRevenue);
                const exp = num(r?.expenses);
                const profit = num(r?.netProfit);
                const margin = num(r?.margin);
                const variance = rev - bud;
                const isActual = rev > 0;
                return (
                  <tr key={m} className="border-b border-border/20 hover:bg-white/[0.015]">
                    <td className="px-4 py-2.5 text-foreground font-medium">{MONTHS_SHORT[m - 1]} {year}</td>
                    <td className="px-4 py-2.5 text-right text-foreground">{isActual ? fmt(rev) : "$0"}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{bud > 0 ? fmt(bud) : "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${variance >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {bud > 0 ? fmt(variance, true) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-foreground">{isActual ? fmt(exp) : "$0"}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${profit < 0 ? "text-red-400" : profit > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                      {isActual ? fmt(profit) : "$0"}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${margin >= 30 ? "text-green-400" : margin > 0 ? "text-yellow-400" : "text-muted-foreground"}`}>
                      {margin.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {isActual ? "Actual" : "Projection"}
                    </td>
                  </tr>
                );
              })}
              {/* Total row */}
              <tr className="border-t border-border bg-white/[0.02]">
                <td className="px-4 py-3 font-bold text-foreground">TOTAL</td>
                <td className="px-4 py-3 text-right font-bold text-foreground">{fmt(totals.revenue)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{totals.budgetRevenue > 0 ? fmt(totals.budgetRevenue) : "—"}</td>
                <td className={`px-4 py-3 text-right font-bold ${totals.revenue - totals.budgetRevenue >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {totals.budgetRevenue > 0 ? fmt(totals.revenue - totals.budgetRevenue, true) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-bold text-foreground">{fmt(totals.expenses)}</td>
                <td className={`px-4 py-3 text-right font-bold ${totals.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(totals.netProfit)}</td>
                <td className={`px-4 py-3 text-right font-bold ${totalMargin >= 30 ? "text-green-400" : "text-yellow-400"}`}>{totalMargin.toFixed(1)}%</td>
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue vs Budget chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Revenue vs Budget</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Bar dataKey="Revenue" fill="oklch(0.75 0.15 192)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Budget" fill="oklch(0.68 0.18 145)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Expenses" fill="oklch(0.62 0.22 25)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-primary inline-block" />Revenue</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-green-500 inline-block" />Budget</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-red-500 inline-block" />Expenses</span>
        </div>
      </div>

      {/* Top Income + Top Expenses */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Top Income Sources</h2>
          {incomeItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No income data for this period.</p>
          ) : (
            <div className="space-y-2">
              {incomeItems.slice(0, 8).map((item) => {
                const amt = num(item.amount);
                const pct = ((amt / totalIncome) * 100).toFixed(1);
                return (
                  <div key={item.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-foreground truncate flex-1">{item.label}</span>
                    <span className="text-muted-foreground shrink-0">{fmt(amt)}</span>
                    <span className="text-muted-foreground shrink-0 w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Top Expense Categories</h2>
          {expenseItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No expense data for this period.</p>
          ) : (
            <div className="space-y-2">
              {expenseItems.slice(0, 8).map((item) => {
                const amt = num(item.amount);
                const pct = ((amt / totalExpense) * 100).toFixed(1);
                return (
                  <div key={item.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-foreground truncate flex-1">{item.label}</span>
                    <span className="text-muted-foreground shrink-0">{fmt(amt)}</span>
                    <span className="text-muted-foreground shrink-0 w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
