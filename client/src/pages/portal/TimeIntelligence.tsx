import { Clock, Lightbulb, Timer } from "lucide-react";
import { useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const AREA_COLORS = [
  "oklch(0.72 0.14 195)",  // teal
  "oklch(0.65 0.18 155)",  // green
  "oklch(0.75 0.18 85)",   // yellow
  "oklch(0.65 0.20 310)",  // purple
  "oklch(0.60 0.22 25)",   // orange
  "oklch(0.70 0.12 240)",  // blue
];

export default function TimeIntelligence() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: logs, isLoading } = trpc.time.get.useQuery({ year, month, tenantId: undefined });

  const totalHours = (logs ?? []).reduce((s, l) => s + parseFloat(l.hours), 0);
  const pieData = (logs ?? []).map((l) => ({ name: l.focusArea, value: parseFloat(l.hours) }));
  const delegationItems = (logs ?? []).filter((l) => l.delegationSuggestion);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Clock size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Time Intelligence</h1>
          </div>
          <p className="text-sm text-muted-foreground">Monthly hours breakdown and delegation insights</p>
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
      ) : (logs ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <Clock size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No time data for {MONTHS[month - 1]} {year}</p>
          <p className="text-xs text-muted-foreground/60">Your advisor will enter your time breakdown here.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Hours</p>
              <p className="text-3xl font-bold text-primary">{totalHours.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">this month</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Focus Areas</p>
              <p className="text-3xl font-bold text-foreground">{(logs ?? []).length}</p>
              <p className="text-xs text-muted-foreground mt-1">categories tracked</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Delegation Flags</p>
              <p className={`text-3xl font-bold ${delegationItems.length > 0 ? "text-amber-400" : "text-foreground"}`}>
                {delegationItems.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">items to consider</p>
            </div>
          </div>

          {/* Pie chart + breakdown table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Time by Focus Area</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "oklch(0.14 0.01 220)", border: "1px solid oklch(0.22 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                    formatter={(v: number) => [`${v.toFixed(1)} hrs`, undefined]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Hours Breakdown</h3>
              </div>
              <div className="divide-y divide-border/50">
                {(logs ?? []).map((log, i) => {
                  const pct = totalHours > 0 ? ((parseFloat(log.hours) / totalHours) * 100) : 0;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: AREA_COLORS[i % AREA_COLORS.length] }} />
                        <span className="flex-1 text-sm text-foreground">{log.focusArea}</span>
                        <span className="text-sm font-semibold text-foreground">{parseFloat(log.hours).toFixed(1)}h</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="ml-5 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: AREA_COLORS[i % AREA_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Delegation suggestions */}
          {delegationItems.length > 0 && (
            <div className="bg-card border border-amber-500/20 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Lightbulb size={14} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-foreground">Delegation Suggestions</h3>
                <span className="ml-auto text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {delegationItems.length} item{delegationItems.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {delegationItems.map((log) => (
                  <div key={log.id} className="px-4 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Timer size={13} className="text-amber-400 shrink-0" />
                      <p className="text-sm font-medium text-foreground">{log.focusArea}</p>
                      <span className="ml-auto text-xs text-muted-foreground">{parseFloat(log.hours).toFixed(1)}h/mo</span>
                    </div>
                    <p className="text-xs text-amber-300/80 ml-5">{log.delegationSuggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
