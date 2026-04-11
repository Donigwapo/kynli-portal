import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, ComposedChart,
} from "recharts";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtD(val: string | null | undefined) {
  const n = parseFloat(val ?? "0");
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}
function fmtN(val: string | null | undefined) { return parseFloat(val ?? "0") || 0; }

function ThinBar({ value, max, red = false }: { value: number; max: number; red?: boolean }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${red ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Financials() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { impersonatingTenantId } = usePortal();

  const tid = impersonatingTenantId ?? undefined;

  const { data: financials, isLoading } = trpc.financials.get.useQuery({ year, month, tenantId: tid });
  const { data: lineItems } = trpc.financials.lineItems.useQuery({ year, month, tenantId: tid });
  const { data: yearlyData } = trpc.financials.get.useQuery({ year, tenantId: tid });

  const current = financials?.[0];
  const revenue = fmtN(current?.revenue);
  const expenses = fmtN(current?.expenses);
  const profit = fmtN(current?.netProfit);
  const margin = fmtN(current?.margin);
  const budgetRev = fmtN(current?.budgetRevenue);
  const budgetExp = fmtN(current?.budgetExpenses);
  const revPct = budgetRev > 0 ? Math.round((revenue / budgetRev) * 100) : null;
  const expPct = budgetExp > 0 ? Math.round((expenses / budgetExp) * 100) : null;

  const chartData = (yearlyData ?? []).map((row) => ({
    month: MONTHS_SHORT[(row.month ?? 1) - 1],
    revenue: fmtN(row.revenue),
    budget: fmtN(row.budgetRevenue),
    expenses: fmtN(row.expenses),
  }));

  const topIncome = (lineItems ?? []).filter((i) => i.type === "income").slice(0, 5);
  const topExpenses = (lineItems ?? []).filter((i) => i.type === "expense").slice(0, 5);
  const totalIncome = topIncome.reduce((s, i) => s + fmtN(i.amount), 0) || 1;
  const totalExp = topExpenses.reduce((s, i) => s + fmtN(i.amount), 0) || 1;

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const tooltipStyle = {
    contentStyle: { backgroundColor: "oklch(0.14 0.005 240)", border: "1px solid oklch(0.20 0.005 240)", borderRadius: "6px", fontSize: 12 },
    labelStyle: { color: "oklch(0.95 0.005 240)" },
    formatter: (v: number) => [fmtD(String(v))],
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financials</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {MONTHS_LONG[month - 1]} {year}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36 bg-card border-border text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {MONTHS_LONG.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="text-sm">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 bg-card border-border text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-sm">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 4 metric cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Revenue", value: fmtD(current?.revenue), sub: budgetRev > 0 ? `Budget: ${fmtD(current?.budgetRevenue)}` : undefined, badge: revPct !== null ? `${revPct}% of budget` : undefined, badgeGood: revPct !== null && revPct >= 90 },
          { label: "Expenses", value: fmtD(current?.expenses), sub: budgetExp > 0 ? `Budget: ${fmtD(current?.budgetExpenses)}` : undefined, badge: expPct !== null ? `${expPct}% of budget` : undefined, badgeGood: expPct !== null && expPct <= 100 },
          { label: "Net Profit", value: fmtD(current?.netProfit), sub: undefined, badge: profit >= 0 ? "Positive" : "Negative", badgeGood: profit >= 0 },
          { label: "Net Profit Margin", value: current?.margin ? `${parseFloat(current.margin).toFixed(1)}%` : "—", sub: "Target: 35%+", badge: margin >= 35 ? "On Target" : "Below Target", badgeGood: margin >= 35 },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              {card.badge && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${card.badgeGood ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                  {card.badge}
                </span>
              )}
            </div>
            {isLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Revenue vs Budget vs Expenses chart */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-foreground">Revenue vs. Budget vs. Expenses — {year}</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-primary inline-block" />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-green-500 inline-block" />Budget</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-red-500 inline-block" />Expenses</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.005 240)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.50 0.008 240)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="revenue" fill="oklch(0.75 0.15 192)" radius={[2, 2, 0, 0]} name="Revenue" />
            <Bar dataKey="budget" fill="oklch(0.68 0.18 145)" radius={[2, 2, 0, 0]} name="Budget" />
            <Bar dataKey="expenses" fill="oklch(0.62 0.22 25)" radius={[2, 2, 0, 0]} name="Expenses" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 5 Income + Top 5 Expenses */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Top 5 Income Sources</h2>
          {topIncome.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No income data for this period.</p>
          ) : (
            <div className="space-y-3">
              {topIncome.map((item, i) => {
                const amt = fmtN(item.amount);
                const pct = ((amt / totalIncome) * 100).toFixed(1);
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                      <span className="text-foreground flex-1 truncate mx-2">{item.label}</span>
                      <span className="text-foreground font-medium">{fmtD(item.amount)}</span>
                      <span className="text-muted-foreground ml-2 w-10 text-right">{pct}%</span>
                    </div>
                    <ThinBar value={amt} max={totalIncome} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Top 5 Expenses</h2>
          {topExpenses.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No expense data for this period.</p>
          ) : (
            <div className="space-y-3">
              {topExpenses.map((item, i) => {
                const amt = fmtN(item.amount);
                const pct = ((amt / totalExp) * 100).toFixed(1);
                const over = false; // budgetAmount not tracked at line-item level
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                      <span className="text-foreground flex-1 truncate mx-2">{item.label}</span>
                      <span className={`font-medium ${over ? "text-red-400" : "text-foreground"}`}>{fmtD(item.amount)}</span>
                      <span className="text-muted-foreground ml-2 w-10 text-right">{pct}%</span>
                    </div>
                    <ThinBar value={amt} max={totalExp} red={over} />
                    {over && null}
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
