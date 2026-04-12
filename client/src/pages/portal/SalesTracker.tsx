import { BarChart2, Users, TrendingUp, Award } from "lucide-react";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function SalesTracker() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: sales, isLoading } = trpc.sales.get.useQuery({ year, month, tenantId: undefined });

  const pct = sales && sales.goalClients > 0
    ? Math.min(100, Math.round((sales.signedClients / sales.goalClients) * 100))
    : 0;

  const pieData = sales
    ? [
        { name: "Referral", value: sales.referralCount },
        { name: "Outbound", value: sales.outboundCount },
      ]
    : [];

  const remaining = sales ? Math.max(0, sales.goalClients - sales.signedClients) : 0;
  const goalReached = pct >= 100;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart2 size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Sales Tracker</h1>
          </div>
          <p className="text-sm text-muted-foreground">Monthly sales targets, signed clients, and pipeline breakdown</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-card border border-border rounded-md text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-card border border-border rounded-md text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !sales ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <BarChart2 size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No sales data for {MONTHS[month - 1]} {year}</p>
          <p className="text-xs text-muted-foreground/60">Your advisor will enter sales data here.</p>
        </div>
      ) : (
        <>
          {/* Goal Progress Card */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Monthly Goal Progress</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{MONTHS[month - 1]} {year}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                goalReached
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-primary/10 text-primary border-primary/20"
              }`}>
                {goalReached ? "🎉 Goal Achieved!" : `${pct}% of goal`}
              </span>
            </div>

            {/* Big numbers */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-5xl font-bold text-foreground leading-none">{sales.signedClients}</p>
                <p className="text-xs text-muted-foreground mt-1.5">clients signed</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-muted-foreground leading-none">{sales.goalClients}</p>
                <p className="text-xs text-muted-foreground mt-1.5">monthly goal</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-muted/30 rounded-full h-3 overflow-hidden mb-2">
              <div
                className={`h-3 rounded-full transition-all duration-700 ${goalReached ? "bg-emerald-400" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {remaining > 0
                ? `${remaining} more client${remaining !== 1 ? "s" : ""} to reach goal`
                : "Goal reached — great work!"}
            </p>
          </div>

          {/* Summary metric cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Award size={14} className="text-primary" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Signed</p>
              </div>
              <p className="text-2xl font-bold text-foreground">{sales.signedClients}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-teal-400" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Referral</p>
              </div>
              <p className="text-2xl font-bold text-foreground">{sales.referralCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sales.signedClients > 0 ? `${Math.round((sales.referralCount / sales.signedClients) * 100)}% of signed` : "—"}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-violet-400" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Outbound</p>
              </div>
              <p className="text-2xl font-bold text-foreground">{sales.outboundCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sales.signedClients > 0 ? `${Math.round((sales.outboundCount / sales.signedClients) * 100)}% of signed` : "—"}
              </p>
            </div>
          </div>

          {/* Pipeline source breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline Source</h3>
              {sales.referralCount === 0 && sales.outboundCount === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No pipeline data</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      <Cell fill="oklch(0.72 0.14 195)" />
                      <Cell fill="oklch(0.65 0.20 310)" />
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "oklch(0.14 0.01 220)", border: "1px solid oklch(0.22 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Source Details</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    <span className="text-sm font-medium text-foreground">Referral</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary">{sales.referralCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {sales.signedClients > 0 ? `${Math.round((sales.referralCount / sales.signedClients) * 100)}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-violet-500/5 border border-violet-500/15">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                    <span className="text-sm font-medium text-foreground">Outbound</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-violet-400">{sales.outboundCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {sales.signedClients > 0 ? `${Math.round((sales.outboundCount / sales.signedClients) * 100)}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border">
                  <div className="flex items-center gap-2.5">
                    <Users size={13} className="text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Total Signed</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{sales.signedClients}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
