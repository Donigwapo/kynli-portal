import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const MUTED = "oklch(0.50 0.008 240)";

function fmtD(val: number | string | null | undefined) {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  const prefix = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(0)}k`;
  return `${prefix}$${abs.toLocaleString()}`;
}
function fmtN(val: number | string | null | undefined): number {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  return isNaN(n) ? 0 : n;
}
function variance(actual: number, budget: number) {
  const v = actual - budget;
  const pct = budget !== 0 ? ((actual / budget) * 100 - 100) : 0;
  return { v, pct, isGood: v >= 0 };
}
function varianceExpense(actual: number, budget: number) {
  const v = actual - budget;
  const pct = budget !== 0 ? ((actual / budget) * 100 - 100) : 0;
  return { v, pct, isGood: v <= 0 };
}

function VarianceBadge({ v, pct, isGood }: { v: number; pct: number; isGood: boolean }) {
  const color = isGood ? GREEN : RED;
  const sign = v >= 0 ? "+" : "";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {sign}{fmtD(v)} ({sign}{pct.toFixed(1)}%)
    </span>
  );
}

function MonthlySummaryPanel({ summary, month, year }: { summary?: string | null; month: number; year: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2 text-foreground font-medium">
          <FileText className="w-4 h-4 text-primary" />
          {MONTHS_LONG[month - 1]} {year} — Monthly Summary
        </div>
        <div className="flex items-center gap-2">
          {!summary && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">No summary yet</span>}
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-border">
          {summary ? (
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic py-2">
              Your KynLi advisor hasn't added a summary for this month yet. Check back after your next review session.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PeriodRow({
  period, onExpand, isExpanded,
}: {
  period: { year: number; month: number; revenue: number; expenses: number; net_profit: number; net_profit_margin: number; budget_revenue: number; budget_expenses: number; summary?: string | null };
  onExpand: () => void;
  isExpanded: boolean;
}) {
  const rev = fmtN(period.revenue);
  const exp = fmtN(period.expenses);
  const profit = fmtN(period.net_profit);
  const margin = fmtN(period.net_profit_margin) * 100;
  const budRev = fmtN(period.budget_revenue);
  const budExp = fmtN(period.budget_expenses);
  const revVar = variance(rev, budRev);
  const expVar = varianceExpense(exp, budExp);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={onExpand}
        className="w-full flex items-center justify-between px-5 py-4 bg-card hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="font-semibold text-foreground text-sm">
            {MONTHS_LONG[period.month - 1]} {period.year}
          </span>
        </div>
        <div className="flex items-center gap-8 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Revenue</div>
            <div className="font-semibold text-foreground">{fmtD(rev)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Expenses</div>
            <div className="font-semibold text-foreground">{fmtD(exp)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Net Profit</div>
            <div className="font-semibold" style={{ color: profit >= 0 ? GREEN : RED }}>{fmtD(profit)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Margin</div>
            <div className="font-semibold" style={{ color: margin >= 35 ? GREEN : RED }}>{margin.toFixed(1)}%</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Rev vs Budget</div>
            <VarianceBadge {...revVar} />
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Exp vs Budget</div>
            <VarianceBadge {...expVar} />
          </div>
        </div>
      </button>
    </div>
  );
}

function ExpandedPeriodDetail({
  period, lineItems,
}: {
  period: { year: number; month: number; revenue: number; expenses: number; net_profit: number; net_profit_margin: number; budget_revenue: number; budget_expenses: number; summary?: string | null };
  lineItems: { id: number; label: string; type: string; amount: number; budget_amount?: number | null }[];
}) {
  const income = lineItems.filter(i => i.type === "income");
  const expenses = lineItems.filter(i => i.type === "expense");
  const totalRev = fmtN(period.revenue);
  const totalExp = fmtN(period.expenses);
  const profit = fmtN(period.net_profit);
  const margin = fmtN(period.net_profit_margin) * 100;
  const budRev = fmtN(period.budget_revenue);
  const budExp = fmtN(period.budget_expenses);

  return (
    <div className="border border-t-0 border-border rounded-b-xl bg-background px-5 py-5 space-y-5">
      {/* Summary */}
      <MonthlySummaryPanel summary={period.summary} month={period.month} year={period.year} />

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Revenue", value: fmtD(totalRev), budget: fmtD(budRev), var: variance(totalRev, budRev), icon: <DollarSign size={14} /> },
          { label: "Total Expenses", value: fmtD(totalExp), budget: fmtD(budExp), var: varianceExpense(totalExp, budExp), icon: <TrendingDown size={14} /> },
          { label: "Net Profit", value: fmtD(profit), budget: fmtD(budRev - budExp), var: variance(profit, budRev - budExp), icon: <TrendingUp size={14} /> },
          { label: "Net Margin", value: `${margin.toFixed(1)}%`, budget: "35% target", var: { v: margin - 35, pct: margin - 35, isGood: margin >= 35 }, icon: <Percent size={14} /> },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <span className="text-muted-foreground">{card.icon}</span>
            </div>
            <div className="text-xl font-bold text-foreground mb-1">{card.value}</div>
            <div className="text-xs text-muted-foreground mb-1">Budget: {card.budget}</div>
            <VarianceBadge {...card.var} />
          </div>
        ))}
      </div>

      {/* Income + Expense tables */}
      <div className="grid grid-cols-2 gap-4">
        {/* Income table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Income Breakdown</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Source</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Actual</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Budget</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {income.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No income data</td></tr>
              ) : income.map(item => {
                const amt = fmtN(item.amount);
                const bud = fmtN(item.budget_amount);
                const v = variance(amt, bud);
                return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-foreground">{item.label}</td>
                    <td className="px-4 py-2.5 text-right font-medium" style={{ color: TEAL }}>{fmtD(amt)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{bud > 0 ? fmtD(bud) : "—"}</td>
                    <td className="px-4 py-2.5 text-right">{bud > 0 ? <VarianceBadge {...v} /> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/20">
                <td className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: TEAL }}>{fmtD(totalRev)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">{budRev > 0 ? fmtD(budRev) : "—"}</td>
                <td className="px-4 py-2.5 text-right">{budRev > 0 ? <VarianceBadge {...variance(totalRev, budRev)} /> : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Expense table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Expense Breakdown</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Category</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Actual</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Budget</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No expense data</td></tr>
              ) : expenses.map(item => {
                const amt = fmtN(item.amount);
                const bud = fmtN(item.budget_amount);
                const v = varianceExpense(amt, bud);
                return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-foreground">{item.label}</td>
                    <td className="px-4 py-2.5 text-right font-medium" style={{ color: RED }}>{fmtD(amt)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{bud > 0 ? fmtD(bud) : "—"}</td>
                    <td className="px-4 py-2.5 text-right">{bud > 0 ? <VarianceBadge {...v} /> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/20">
                <td className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: RED }}>{fmtD(totalExp)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">{budExp > 0 ? fmtD(budExp) : "—"}</td>
                <td className="px-4 py-2.5 text-right">{budExp > 0 ? <VarianceBadge {...varianceExpense(totalExp, budExp)} /> : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Financials() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number | null>(now.getMonth() + 1);
  const { impersonatingTenantSlug } = usePortal();
  const tslug = impersonatingTenantSlug ?? undefined;

  const { data: financials = [], isLoading } = trpc.financials.get.useQuery({ year, tenantSlug: tslug });
  const { data: lineItems = [] } = trpc.financials.lineItems.useQuery(
    { year, month: expandedMonth ?? now.getMonth() + 1, tenantSlug: tslug },
    { enabled: expandedMonth != null }
  );

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  // Chart data for the year
  const chartData = MONTHS_SHORT.map((month, i) => {
    const rec = financials.find(f => f.month === i + 1);
    return {
      month,
      Revenue: fmtN(rec?.revenue),
      Budget: fmtN(rec?.budget_revenue),
      Expenses: fmtN(rec?.expenses),
    };
  });

  // YTD summary
  const ytdRevenue = useMemo(() => financials.reduce((s, f) => s + fmtN(f.revenue), 0), [financials]);
  const ytdExpenses = useMemo(() => financials.reduce((s, f) => s + fmtN(f.expenses), 0), [financials]);
  const ytdProfit = ytdRevenue - ytdExpenses;
  const ytdMargin = ytdRevenue > 0 ? (ytdProfit / ytdRevenue) * 100 : 0;

  // Periods sorted newest first
  const periods = useMemo(() => [...financials].sort((a, b) => b.month - a.month), [financials]);

  const expandedPeriod = expandedMonth != null ? financials.find(f => f.month === expandedMonth) : null;

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Financials</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Year: {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* YTD Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Revenue YTD", value: fmtD(ytdRevenue), icon: <DollarSign size={14} />, color: TEAL },
            { label: "Expenses YTD", value: fmtD(ytdExpenses), icon: <TrendingDown size={14} />, color: RED },
            { label: "Net Profit YTD", value: fmtD(ytdProfit), icon: <TrendingUp size={14} />, color: ytdProfit >= 0 ? GREEN : RED },
            { label: "Avg Net Margin", value: `${ytdMargin.toFixed(1)}%`, icon: <Percent size={14} />, color: ytdMargin >= 35 ? GREEN : RED },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
                <span className="text-muted-foreground">{card.icon}</span>
              </div>
              <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Revenue vs Budget vs Expenses Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{year} — Revenue vs Budget vs Expenses</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)" }}
                formatter={(v: number) => [fmtD(v)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: MUTED }} />
              <Bar dataKey="Revenue" fill={TEAL} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Budget" fill={GREEN} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill={RED} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Period History — collapsible rows */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Period History</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)}
            </div>
          ) : periods.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              No financial data for {year}.
            </div>
          ) : (
            <div className="space-y-2">
              {periods.map(period => (
                <div key={period.month}>
                  <PeriodRow
                    period={{
                      year: period.year,
                      month: period.month,
                      revenue: fmtN(period.revenue),
                      expenses: fmtN(period.expenses),
                      net_profit: fmtN(period.net_profit),
                      net_profit_margin: fmtN(period.net_profit_margin),
                      budget_revenue: fmtN(period.budget_revenue),
                      budget_expenses: fmtN(period.budget_expenses),
                      summary: period.summary,
                    }}
                    isExpanded={expandedMonth === period.month}
                    onExpand={() => setExpandedMonth(expandedMonth === period.month ? null : period.month)}
                  />
                  {expandedMonth === period.month && expandedPeriod && (
                    <ExpandedPeriodDetail
                      period={{
                        year: expandedPeriod.year,
                        month: expandedPeriod.month,
                        revenue: fmtN(expandedPeriod.revenue),
                        expenses: fmtN(expandedPeriod.expenses),
                        net_profit: fmtN(expandedPeriod.net_profit),
                        net_profit_margin: fmtN(expandedPeriod.net_profit_margin),
                        budget_revenue: fmtN(expandedPeriod.budget_revenue),
                        budget_expenses: fmtN(expandedPeriod.budget_expenses),
                        summary: expandedPeriod.summary,
                      }}
                      lineItems={lineItems.map(li => ({
                        id: li.id,
                        label: li.label,
                        type: li.type,
                        amount: fmtN(li.amount),
                        budget_amount: li.budget_amount != null ? fmtN(li.budget_amount) : null,
                      }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
