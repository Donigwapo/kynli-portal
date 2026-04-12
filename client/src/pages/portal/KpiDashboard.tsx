import { ArrowDownRight, ArrowUpRight, Minus, Target, TrendingUp, TrendingDown } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { trpc } from "../../lib/trpc";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function TrendBadge({ current, previous, lowerIsBetter = false, formatter }: {
  current: number; previous: number; lowerIsBetter?: boolean; formatter: (v: number) => string;
}) {
  if (!previous || current === previous) return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Minus size={12} /> No change
    </span>
  );
  const diff = current - previous;
  const pct = Math.abs((diff / previous) * 100).toFixed(1);
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${improved ? "text-emerald-400" : "text-red-400"}`}>
      {improved ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {pct}% vs last month
    </span>
  );
}

interface MetricCardProps {
  label: string;
  sublabel: string;
  value: string;
  current: number;
  previous: number;
  lowerIsBetter?: boolean;
  formatter: (v: number) => string;
  icon: React.ReactNode;
  color: string;
}

function MetricCard({ label, sublabel, value, current, previous, lowerIsBetter, formatter, icon, color }: MetricCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sublabel}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground mb-2">{value}</p>
      <TrendBadge current={current} previous={previous} lowerIsBetter={lowerIsBetter} formatter={formatter} />
    </div>
  );
}

export default function KpiDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: kpiData, isLoading } = trpc.kpi.get.useQuery({ year, tenantId: undefined });

  const sorted = [...(kpiData ?? [])].sort((a, b) => a.month - b.month);
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  const chartData = sorted.map((row) => ({
    month: MONTHS[row.month - 1],
    LTV: row.ltv ? parseFloat(row.ltv) : null,
    CAC: row.cac ? parseFloat(row.cac) : null,
    "Churn %": row.churnRate ? parseFloat(row.churnRate) : null,
  }));

  const fmt$ = (v: string | null | undefined) =>
    v ? `$${parseFloat(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";
  const fmtPct = (v: string | null | undefined) =>
    v ? `${parseFloat(v).toFixed(1)}%` : "—";

  const latestCAC = parseFloat(latest?.cac ?? "0");
  const prevCAC = parseFloat(prev?.cac ?? "0");
  const latestChurn = parseFloat(latest?.churnRate ?? "0");
  const prevChurn = parseFloat(prev?.churnRate ?? "0");
  const latestLTV = parseFloat(latest?.ltv ?? "0");
  const prevLTV = parseFloat(prev?.ltv ?? "0");

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Target size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">KPI Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground">Customer Acquisition Cost, Churn Rate & Lifetime Value</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-card border border-border rounded-md text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-32 animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <Target size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No KPI data for {year}</p>
          <p className="text-xs text-muted-foreground/60">Your advisor will add KPI metrics here.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Customer Acquisition Cost"
              sublabel="Cost to acquire one new client"
              value={fmt$(latest?.cac)}
              current={latestCAC}
              previous={prevCAC}
              lowerIsBetter
              formatter={(v) => `$${v.toLocaleString()}`}
              icon={<TrendingDown size={16} className="text-orange-400" />}
              color="bg-orange-500/10"
            />
            <MetricCard
              label="Churn Rate"
              sublabel="% of clients lost per month"
              value={fmtPct(latest?.churnRate)}
              current={latestChurn}
              previous={prevChurn}
              lowerIsBetter
              formatter={(v) => `${v.toFixed(1)}%`}
              icon={<TrendingDown size={16} className="text-red-400" />}
              color="bg-red-500/10"
            />
            <MetricCard
              label="Lifetime Value"
              sublabel="Avg revenue per client lifetime"
              value={fmt$(latest?.ltv)}
              current={latestLTV}
              previous={prevLTV}
              formatter={(v) => `$${v.toLocaleString()}`}
              icon={<TrendingUp size={16} className="text-emerald-400" />}
              color="bg-emerald-500/10"
            />
          </div>

          {/* LTV vs CAC Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">LTV vs. CAC Trend — {year}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.01 220)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 220)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 220)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.14 0.01 220)", border: "1px solid oklch(0.22 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: "8px" }} />
                <Line type="monotone" dataKey="LTV" stroke="oklch(0.72 0.14 195)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.72 0.14 195)" }} connectNulls />
                <Line type="monotone" dataKey="CAC" stroke="oklch(0.65 0.18 35)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.65 0.18 35)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Churn Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Churn Rate Trend — {year}</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.01 220)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 220)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 220)" }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.14 0.01 220)", border: "1px solid oklch(0.22 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, undefined]}
                />
                <Line type="monotone" dataKey="Churn %" stroke="oklch(0.65 0.20 310)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.65 0.20 310)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly breakdown table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Monthly KPI Breakdown — {year}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Month</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2.5">CAC</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2.5">Churn Rate</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2.5">LTV</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2.5">LTV:CAC Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const cac = parseFloat(row.cac ?? "0");
                    const ltv = parseFloat(row.ltv ?? "0");
                    const ratio = cac > 0 ? (ltv / cac).toFixed(1) : "—";
                    return (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5 text-xs font-medium text-foreground">{MONTHS[row.month - 1]} {year}</td>
                        <td className="px-4 py-2.5 text-xs text-right text-foreground">{fmt$(row.cac)}</td>
                        <td className="px-4 py-2.5 text-xs text-right">
                          <span className={`font-medium ${parseFloat(row.churnRate ?? "0") > 5 ? "text-red-400" : "text-emerald-400"}`}>
                            {fmtPct(row.churnRate)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-right text-foreground">{fmt$(row.ltv)}</td>
                        <td className="px-4 py-2.5 text-xs text-right">
                          <span className={`font-medium ${parseFloat(ratio as string) >= 3 ? "text-emerald-400" : "text-orange-400"}`}>
                            {ratio}x
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
