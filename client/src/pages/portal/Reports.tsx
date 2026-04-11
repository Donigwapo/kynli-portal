import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const fmt = (val: string | null | undefined) =>
  val ? `$${parseFloat(val).toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "—";

const fmtNum = (val: string | null | undefined) => (val ? parseFloat(val) : 0);

export default function Reports() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { impersonatingTenantId } = usePortal();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const { data: yearlyData, isLoading } = trpc.financials.get.useQuery({
    year,
    tenantId: impersonatingTenantId ?? undefined,
  });

  const chartData = (yearlyData ?? []).map((row) => ({
    month: MONTHS[(row.month ?? 1) - 1]?.slice(0, 3),
    Revenue: fmtNum(row.revenue),
    Budget: fmtNum(row.budgetRevenue),
    Expenses: fmtNum(row.expenses),
    "Net Profit": fmtNum(row.netProfit),
    "Margin %": fmtNum(row.margin),
  }));

  // Annual totals
  const totals = (yearlyData ?? []).reduce(
    (acc, row) => ({
      revenue: acc.revenue + fmtNum(row.revenue),
      expenses: acc.expenses + fmtNum(row.expenses),
      netProfit: acc.netProfit + fmtNum(row.netProfit),
    }),
    { revenue: 0, expenses: 0, netProfit: 0 }
  );

  const avgMargin =
    yearlyData && yearlyData.length > 0
      ? (yearlyData ?? []).reduce((s, r) => s + fmtNum(r.margin), 0) / yearlyData.length
      : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Historical financial data and annual summaries</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24 bg-card border-border text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {years.map((y) => (
              <SelectItem key={y} value={String(y)} className="text-sm">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Annual summary */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Annual Revenue", value: `$${totals.revenue.toLocaleString()}`, color: "text-emerald-400" },
          { label: "Annual Expenses", value: `$${totals.expenses.toLocaleString()}`, color: "text-red-400" },
          { label: "Annual Net Profit", value: `$${totals.netProfit.toLocaleString()}`, color: "text-primary" },
          { label: "Avg. Margin", value: `${avgMargin.toFixed(1)}%`, color: "text-violet-400" },
        ].map((item) => (
          <Card key={item.label} className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue vs Budget vs Expenses line chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">
            Revenue vs. Budget vs. Expenses — {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
              No data for {year}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 220)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.01 220)", border: "1px solid oklch(0.25 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Revenue" stroke="oklch(0.72 0.14 195)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Budget" stroke="oklch(0.65 0.18 155)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="Expenses" stroke="oklch(0.60 0.22 25)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Net Profit trend */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Net Profit Trend — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data for {year}</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 220)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.01 220)", border: "1px solid oklch(0.25 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                />
                <Line type="monotone" dataKey="Net Profit" stroke="oklch(0.72 0.14 195)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.72 0.14 195)" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Monthly breakdown table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Monthly Breakdown — {year}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs text-muted-foreground font-medium">Month</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Revenue</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Budget</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Expenses</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Net Profit</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {(yearlyData ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 text-foreground">{MONTHS[(row.month ?? 1) - 1]}</td>
                  <td className="py-2.5 text-right text-emerald-400">{fmt(row.revenue)}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{fmt(row.budgetRevenue)}</td>
                  <td className="py-2.5 text-right text-red-400">{fmt(row.expenses)}</td>
                  <td className="py-2.5 text-right text-primary font-medium">{fmt(row.netProfit)}</td>
                  <td className="py-2.5 text-right text-violet-400">{row.margin ? `${parseFloat(row.margin).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
              {(yearlyData ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">No data available for {year}</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
