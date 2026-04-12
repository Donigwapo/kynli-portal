import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownRight, ArrowUpRight, Minus, Target } from "lucide-react";
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
import { trpc } from "../../lib/trpc";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function TrendIcon({ current, previous, lowerIsBetter = false }: { current: number; previous: number; lowerIsBetter?: boolean }) {
  if (current === previous) return <Minus size={14} className="text-muted-foreground" />;
  const improved = lowerIsBetter ? current < previous : current > previous;
  return improved
    ? <ArrowUpRight size={14} className="text-emerald-400" />
    : <ArrowDownRight size={14} className="text-red-400" />;
}

export default function KpiDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: kpiData, isLoading } = trpc.kpi.get.useQuery({
    year,
    tenantId: undefined,
  });

  const sorted = [...(kpiData ?? [])].sort((a, b) => a.month - b.month);
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  const chartData = sorted.map((row) => ({
    month: MONTHS[row.month - 1],
    CAC: row.cac ? parseFloat(row.cac) : null,
    "Churn %": row.churnRate ? parseFloat(row.churnRate) : null,
    LTV: row.ltv ? parseFloat(row.ltv) : null,
  }));

  const fmt$ = (v: string | null | undefined) =>
    v ? `$${parseFloat(v).toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "—";
  const fmtPct = (v: string | null | undefined) =>
    v ? `${parseFloat(v).toFixed(1)}%` : "—";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Target size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">KPI Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Customer Acquisition Cost, Churn Rate, and Lifetime Value</p>
          </div>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CAC */}
        <Card className="bg-card border-border metric-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Customer Acquisition Cost</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold text-foreground">{fmt$(latest?.cac)}</p>
              {latest && prev && (
                <div className="flex items-center gap-1 mb-1">
                  <TrendIcon
                    current={parseFloat(latest.cac ?? "0")}
                    previous={parseFloat(prev.cac ?? "0")}
                    lowerIsBetter
                  />
                  <span className="text-xs text-muted-foreground">vs last month</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Lower is better — cost to acquire one new client</p>
          </CardContent>
        </Card>

        {/* Churn Rate */}
        <Card className="bg-card border-border metric-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Churn Rate</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold text-foreground">{fmtPct(latest?.churnRate)}</p>
              {latest && prev && (
                <div className="flex items-center gap-1 mb-1">
                  <TrendIcon
                    current={parseFloat(latest.churnRate ?? "0")}
                    previous={parseFloat(prev.churnRate ?? "0")}
                    lowerIsBetter
                  />
                  <span className="text-xs text-muted-foreground">vs last month</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Percentage of clients lost per month</p>
          </CardContent>
        </Card>

        {/* LTV */}
        <Card className="bg-card border-border metric-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Lifetime Value</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold text-foreground">{fmt$(latest?.ltv)}</p>
              {latest && prev && (
                <div className="flex items-center gap-1 mb-1">
                  <TrendIcon
                    current={parseFloat(latest.ltv ?? "0")}
                    previous={parseFloat(prev.ltv ?? "0")}
                  />
                  <span className="text-xs text-muted-foreground">vs last month</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average revenue per client over their lifetime</p>
          </CardContent>
        </Card>
      </div>

      {/* LTV vs CAC trend */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">LTV vs. CAC Trend — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No KPI data for {year}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 220)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.01 220)", border: "1px solid oklch(0.25 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="LTV" stroke="oklch(0.72 0.14 195)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="CAC" stroke="oklch(0.60 0.22 25)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Churn trend */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Churn Rate Trend — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data for {year}</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 220)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 220)" }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.01 220)", border: "1px solid oklch(0.25 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, undefined]}
                />
                <Line type="monotone" dataKey="Churn %" stroke="oklch(0.65 0.20 310)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
