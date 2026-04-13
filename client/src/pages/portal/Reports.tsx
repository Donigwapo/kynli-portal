import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtD(val: number | string | null | undefined) {
  const n = typeof val === "number" ? val : parseFloat(val ?? "0");
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}
function fmtN(val: number | string | null | undefined) { return (typeof val === "number" ? val : parseFloat(val ?? "0")) || 0; }

const TOOLTIP = {
  contentStyle: { backgroundColor: "oklch(0.14 0.005 240)", border: "1px solid oklch(0.20 0.005 240)", borderRadius: "6px", fontSize: 12 },
  labelStyle: { color: "oklch(0.95 0.005 240)" },
  formatter: (v: number) => [fmtD(String(v))],
};
const TICK = { fill: "oklch(0.50 0.008 240)", fontSize: 11 };
const GRID = "oklch(0.20 0.005 240)";

export default function Reports() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { impersonatingTenantSlug } = usePortal();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const { data: yearlyData, isLoading } = trpc.financials.get.useQuery({
    year,
    tenantSlug: impersonatingTenantSlug ?? undefined,
  });

  const chartData = (yearlyData ?? []).map((row) => ({
    month: MONTHS_SHORT[(row.month ?? 1) - 1],
    Revenue: fmtN(row.revenue),
    Budget: fmtN(row.budget_revenue),
    Expenses: fmtN(row.expenses),
    "Net Profit": fmtN(row.net_profit),
  }));

  const totals = (yearlyData ?? []).reduce(
    (acc, row) => ({
      revenue: acc.revenue + fmtN(row.revenue),
      expenses: acc.expenses + fmtN(row.expenses),
      netProfit: acc.netProfit + fmtN(row.net_profit),
    }),
    { revenue: 0, expenses: 0, netProfit: 0 }
  );

  const avgMargin =
    yearlyData && yearlyData.length > 0
      ? (yearlyData ?? []).reduce((s, r) => s + fmtN(r.net_profit_margin) * 100, 0) / yearlyData.length
      : 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Annual financial summary — {year}</p>
        </div>
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

      {/* Annual summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Annual Revenue", value: fmtD(String(totals.revenue)), color: "text-primary" },
          { label: "Annual Expenses", value: fmtD(String(totals.expenses)), color: "text-red-400" },
          { label: "Annual Net Profit", value: fmtD(String(totals.netProfit)), color: totals.netProfit >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Avg. Profit Margin", value: `${avgMargin.toFixed(1)}%`, color: avgMargin >= 35 ? "text-green-400" : "text-red-400" },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            {isLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse" />
            ) : (
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Revenue vs Budget vs Expenses */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-foreground">Revenue vs. Budget vs. Expenses — {year}</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-primary inline-block" />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-green-500 inline-block" />Budget</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-red-500 inline-block" />Expenses</span>
          </div>
        </div>
        {isLoading ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data for {year}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip {...TOOLTIP} />
              <Line type="monotone" dataKey="Revenue" stroke="oklch(0.75 0.15 192)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Budget" stroke="oklch(0.68 0.18 145)" strokeWidth={2} dot={false} strokeDasharray="5 3" />
              <Line type="monotone" dataKey="Expenses" stroke="oklch(0.62 0.22 25)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Net Profit trend */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Net Profit Trend — {year}</h2>
        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data for {year}</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip {...TOOLTIP} />
              <Line type="monotone" dataKey="Net Profit" stroke="oklch(0.75 0.15 192)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.75 0.15 192)" }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Monthly breakdown table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Monthly Breakdown — {year}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Month","Revenue","Budget","Expenses","Net Profit","Margin"].map((h) => (
                  <th key={h} className={`py-2.5 px-4 text-xs text-muted-foreground font-medium ${h === "Month" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(yearlyData ?? []).map((row) => {
                const np = fmtN(row.net_profit);
                const mg = fmtN(row.net_profit_margin) * 100;
                return (
                  <tr key={row.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                    <td className="py-2.5 px-4 text-foreground">{MONTHS_LONG[(row.month ?? 1) - 1]}</td>
                    <td className="py-2.5 px-4 text-right text-primary">{fmtD(row.revenue)}</td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">{fmtD(row.budget_revenue)}</td>
                    <td className="py-2.5 px-4 text-right text-red-400">{fmtD(row.expenses)}</td>
                    <td className={`py-2.5 px-4 text-right font-medium ${np >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtD(row.net_profit)}</td>
                    <td className={`py-2.5 px-4 text-right ${mg >= 35 ? "text-green-400" : "text-muted-foreground"}`}>{row.net_profit_margin != null ? `${mg.toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
              {(yearlyData ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">No data available for {year}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
