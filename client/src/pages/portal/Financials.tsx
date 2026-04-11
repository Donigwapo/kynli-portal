import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fmt = (val: string | null | undefined) =>
  val ? `$${parseFloat(val).toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "—";

const fmtNum = (val: string | null | undefined) =>
  val ? parseFloat(val) : 0;

export default function Financials() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { impersonatingTenantId } = usePortal();

  const { data: financials, isLoading: loadingFinancials } = trpc.financials.get.useQuery({
    year,
    month,
    tenantId: impersonatingTenantId ?? undefined,
  });

  const { data: lineItems, isLoading: loadingItems } = trpc.financials.lineItems.useQuery({
    year,
    month,
    tenantId: impersonatingTenantId ?? undefined,
  });

  const { data: yearlyData } = trpc.financials.get.useQuery({
    year,
    tenantId: impersonatingTenantId ?? undefined,
  });

  const current = financials?.[0];

  const chartData = (yearlyData ?? []).map((row) => ({
    month: MONTHS[(row.month ?? 1) - 1]?.slice(0, 3),
    Revenue: fmtNum(row.revenue),
    Budget: fmtNum(row.budgetRevenue),
    Expenses: fmtNum(row.expenses),
  }));

  const topIncome = (lineItems ?? [])
    .filter((i) => i.type === "income")
    .slice(0, 5);

  const topExpenses = (lineItems ?? [])
    .filter((i) => i.type === "expense")
    .slice(0, 5);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financials</h1>
          <p className="text-sm text-muted-foreground mt-1">Monthly financial overview and breakdown</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36 bg-card border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="text-sm">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 bg-card border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-sm">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Revenue", value: fmt(current?.revenue), color: "text-emerald-400" },
          { label: "Expenses", value: fmt(current?.expenses), color: "text-red-400" },
          { label: "Net Profit", value: fmt(current?.netProfit), color: "text-primary" },
          { label: "Margin", value: current?.margin ? `${parseFloat(current.margin).toFixed(1)}%` : "—", color: "text-violet-400" },
        ].map((item) => (
          <Card key={item.label} className="bg-card border-border">
            <CardContent className="p-5">
              {loadingFinancials ? (
                <Skeleton className="h-12 w-full bg-muted" />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
                  {item.label === "Revenue" && current?.budgetRevenue && (
                    <p className="text-xs text-muted-foreground mt-1">Budget: {fmt(current.budgetRevenue)}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue vs Budget chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Revenue vs. Budget vs. Expenses — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No data available for {year}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 220)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.01 220)", border: "1px solid oklch(0.25 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Revenue" fill="oklch(0.72 0.14 195)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Budget" fill="oklch(0.65 0.18 155)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Expenses" fill="oklch(0.60 0.22 25)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top 5 Income & Expenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Top 5 Income Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingItems ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 bg-muted" />)}</div>
            ) : topIncome.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No income data for this period</p>
            ) : (
              <div className="space-y-2">
                {topIncome.map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400">{fmt(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Top 5 Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingItems ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 bg-muted" />)}</div>
            ) : topExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No expense data for this period</p>
            ) : (
              <div className="space-y-2">
                {topExpenses.map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-red-400">{fmt(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
