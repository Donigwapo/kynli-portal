import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { Clock, Zap, BarChart2, Lightbulb } from "lucide-react";

type TimeLog = { id: number; year: number; month: number; focus_area: string; hours: number; delegation_note: string | null; created_at?: string };

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const AMBER = "oklch(0.78 0.16 60)";
const MUTED_FG = "oklch(0.50 0.008 240)";

const CHART_COLORS = [
  "oklch(0.75 0.15 192)",
  "oklch(0.68 0.18 145)",
  "oklch(0.78 0.16 60)",
  "oklch(0.65 0.20 310)",
  "oklch(0.62 0.22 25)",
  "oklch(0.72 0.14 240)",
];

// Classify focus areas as strategic vs operational
function isStrategic(area: string): boolean {
  const strategic = ["strategy", "planning", "vision", "leadership", "growth", "business dev", "client", "sales", "marketing", "product", "innovation"];
  const lower = area.toLowerCase();
  return strategic.some(k => lower.includes(k));
}

export default function TimeIntelligence() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { impersonatingTenantSlug } = usePortal();
  const tslug = impersonatingTenantSlug ?? undefined;
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: logs = [], isLoading } = trpc.time.get.useQuery(
    { year, month, tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  const totalHours = useMemo(() => logs.reduce((s: number, l: TimeLog) => s + (l.hours ?? 0), 0), [logs]);
  const strategicHours = useMemo(
    () => logs.filter((l: TimeLog) => isStrategic(l.focus_area)).reduce((s: number, l: TimeLog) => s + (l.hours ?? 0), 0),
    [logs]
  );
  const operationalHours = totalHours - strategicHours;
  const strategicPct = totalHours > 0 ? (strategicHours / totalHours) * 100 : 0;
  const operationalPct = totalHours > 0 ? (operationalHours / totalHours) * 100 : 0;
  const delegationItems = logs.filter((l: TimeLog) => l.delegation_note);

  // Radar chart data
  const radarData = logs.slice(0, 8).map((l: TimeLog) => ({
    area: l.focus_area.length > 14 ? l.focus_area.slice(0, 14) + "…" : l.focus_area,
    hours: l.hours ?? 0,
    pct: totalHours > 0 ? Math.round(((l.hours ?? 0) / totalHours) * 100) : 0,
  }));

  // Sorted by hours desc
  const sortedLogs = [...logs].sort((a: TimeLog, b: TimeLog) => (b.hours ?? 0) - (a.hours ?? 0));

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Time Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {MONTHS_LONG[month - 1]} {year} — time allocation analysis
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {MONTHS_LONG.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Clock size={36} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No time logs for this period</p>
            <p className="text-xs text-muted-foreground mt-1">Your advisor will add time tracking data after review.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Hours", value: `${totalHours.toFixed(1)}h`, sub: "this month", color: TEAL, icon: <Clock size={16} /> },
                { label: "Strategic", value: `${strategicHours.toFixed(1)}h`, sub: `${strategicPct.toFixed(1)}% of total`, color: GREEN, icon: <Zap size={16} /> },
                { label: "Operational", value: `${operationalHours.toFixed(1)}h`, sub: `${operationalPct.toFixed(1)}% of total`, color: AMBER, icon: <BarChart2 size={16} /> },
                { label: "Focus Areas", value: logs.length, sub: `${delegationItems.length} delegation flags`, color: MUTED_FG, icon: <Lightbulb size={16} /> },
              ].map(card => (
                <div key={card.label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
                    <span className="text-muted-foreground">{card.icon}</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Strategic vs Operational Split */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Strategic vs Operational Split</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-foreground">Strategic</span>
                    <span className="font-medium" style={{ color: GREEN }}>{strategicHours.toFixed(1)}h ({strategicPct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-3 rounded-full" style={{ width: `${strategicPct}%`, backgroundColor: GREEN }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-foreground">Operational</span>
                    <span className="font-medium" style={{ color: AMBER }}>{operationalHours.toFixed(1)}h ({operationalPct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-3 rounded-full" style={{ width: `${operationalPct}%`, backgroundColor: AMBER }} />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Target: 60%+ strategic time. {strategicPct >= 60
                  ? "You're on track."
                  : `${(60 - strategicPct).toFixed(1)}% more strategic time needed.`}
              </p>
            </div>

            {/* Radar Chart + Focus Area Table */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Focus Area Distribution</h2>
                {radarData.length < 3 ? (
                  <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                    Not enough data for radar chart (need 3+ areas)
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="area" tick={{ fill: MUTED_FG, fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, Math.max(...radarData.map((d: { hours: number }) => d.hours))]}
                        tick={{ fill: MUTED_FG, fontSize: 9 }} />
                      <Radar name="Hours" dataKey="hours" stroke={TEAL} fill={TEAL} fillOpacity={0.2} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                        formatter={(v: number) => [`${v.toFixed(1)}h`]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">Hours by Focus Area</h2>
                </div>
                <div className="divide-y divide-border">
                  {sortedLogs.map((log: TimeLog, i: number) => {
                    const pct = totalHours > 0 ? ((log.hours ?? 0) / totalHours) * 100 : 0;
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    return (
                      <div key={log.id} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs text-foreground">{log.focus_area}</span>
                          </div>
                          <span className="text-xs font-semibold" style={{ color }}>
                            {(log.hours ?? 0).toFixed(1)}h
                            <span className="text-muted-foreground font-normal ml-1.5">{pct.toFixed(0)}%</span>
                          </span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Delegation Suggestions */}
            {delegationItems.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
                  <Lightbulb size={14} style={{ color: AMBER }} />
                  <h2 className="text-sm font-semibold text-foreground">Delegation Suggestions</h2>
                </div>
                <div className="divide-y divide-border">
                  {delegationItems.map((log: TimeLog) => (
                    <div key={log.id} className="px-5 py-4">
                      <p className="text-sm font-medium text-foreground">{log.focus_area}</p>
                      <p className="text-xs mt-1" style={{ color: AMBER }}>{log.delegation_note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
