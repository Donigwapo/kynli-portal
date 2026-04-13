import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Lightbulb } from "lucide-react";
import { useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const COLORS = [
  "oklch(0.72 0.14 195)",
  "oklch(0.65 0.18 155)",
  "oklch(0.75 0.18 85)",
  "oklch(0.65 0.20 310)",
  "oklch(0.60 0.22 25)",
  "oklch(0.70 0.12 240)",
];

export default function TimeIntelligence() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { impersonatingTenantSlug } = usePortal();
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: logs, isLoading } = trpc.time.get.useQuery({
    year,
    month,
    tenantSlug: impersonatingTenantSlug ?? undefined,
  });

  const totalHours = (logs ?? []).reduce((s, l) => s + (l.hours ?? 0), 0);

  const pieData = (logs ?? []).map((l) => ({
    name: l.focus_area,
    value: l.hours ?? 0,
  }));

  const delegationItems = (logs ?? []).filter((l) => l.delegation_note);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Clock size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Time Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monthly hours breakdown and delegation insights</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36 bg-card border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="text-sm">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (logs ?? []).length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <Clock size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No time data for this period</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your accountant will enter your time breakdown for {MONTHS[month - 1]} {year}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Hours</p>
                <p className="text-3xl font-bold text-primary mt-1">{totalHours.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-1">this month</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Focus Areas</p>
                <p className="text-3xl font-bold text-foreground mt-1">{(logs ?? []).length}</p>
                <p className="text-xs text-muted-foreground mt-1">categories tracked</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Delegation Flags</p>
                <p className="text-3xl font-bold text-amber-400 mt-1">{delegationItems.length}</p>
                <p className="text-xs text-muted-foreground mt-1">items to consider</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie chart */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">Time by Focus Area</CardTitle>
              </CardHeader>
              <CardContent>
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
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "oklch(0.16 0.01 220)", border: "1px solid oklch(0.25 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                      formatter={(v: number) => [`${v.toFixed(1)} hrs`, undefined]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Breakdown table */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">Hours Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {(logs ?? []).map((log, i) => (
                    <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <span className="flex-1 text-sm text-foreground">{log.focus_area}</span>
                      <span className="text-sm font-semibold text-primary">{(log.hours ?? 0).toFixed(1)}h</span>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {totalHours > 0 ? `${(((log.hours ?? 0) / totalHours) * 100).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Delegation suggestions */}
          {delegationItems.length > 0 && (
            <Card className="bg-card border-border border-amber-500/20">
              <CardHeader className="pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Lightbulb size={14} className="text-amber-400" />
                  <CardTitle className="text-sm font-semibold text-foreground">Delegation Suggestions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {delegationItems.map((log) => (
                    <div key={log.id} className="px-5 py-4">
                      <p className="text-sm font-medium text-foreground">{log.focus_area}</p>
                      <p className="text-xs text-amber-300/80 mt-1">{log.delegation_note}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
