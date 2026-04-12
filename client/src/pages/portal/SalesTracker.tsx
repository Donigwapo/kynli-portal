import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Users } from "lucide-react";
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

  const { data: sales, isLoading } = trpc.sales.get.useQuery({
    year,
    month,
    tenantId: undefined,
  });

  const pct = sales && sales.goalClients > 0
    ? Math.min(100, Math.round((sales.signedClients / sales.goalClients) * 100))
    : 0;

  const pieData = sales
    ? [
        { name: "Referral", value: sales.referralCount },
        { name: "Outbound", value: sales.outboundCount },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sales Tracker</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monthly sales targets, signed clients, and pipeline breakdown</p>
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
      ) : !sales ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <FileText size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No sales data for this period</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your accountant will enter sales data for {MONTHS[month - 1]} {year}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Goal progress */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">Monthly Goal Progress</CardTitle>
                <Badge
                  variant="outline"
                  className={`text-xs ${pct >= 100 ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-primary/30 text-primary bg-primary/10"}`}
                >
                  {pct >= 100 ? "Goal Achieved!" : `${pct}% of goal`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-5xl font-bold text-foreground">{sales.signedClients}</p>
                  <p className="text-sm text-muted-foreground mt-1">clients signed</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-muted-foreground">{sales.goalClients}</p>
                  <p className="text-sm text-muted-foreground">goal</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-700 ${pct >= 100 ? "bg-emerald-400" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {sales.goalClients - sales.signedClients > 0
                  ? `${sales.goalClients - sales.signedClients} more to reach goal`
                  : "Goal reached! 🎉"}
              </p>
            </CardContent>
          </Card>

          {/* Referral vs Outbound */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">Pipeline Source Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {sales.referralCount === 0 && sales.outboundCount === 0 ? (
                  <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No pipeline data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        <Cell fill="oklch(0.72 0.14 195)" />
                        <Cell fill="oklch(0.65 0.20 310)" />
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "oklch(0.16 0.01 220)", border: "1px solid oklch(0.25 0.01 220)", borderRadius: "8px", fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">Source Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-sm font-medium text-foreground">Referral</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary">{sales.referralCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {sales.signedClients > 0 ? `${Math.round((sales.referralCount / sales.signedClients) * 100)}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-violet-400" />
                    <span className="text-sm font-medium text-foreground">Outbound</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-violet-400">{sales.outboundCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {sales.signedClients > 0 ? `${Math.round((sales.outboundCount / sales.signedClients) * 100)}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Total Signed</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{sales.signedClients}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
