import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

function getQuarters(year: number): string[] {
  return [`${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`];
}

export default function Coaching() {
  const now = new Date();
  const currentQuarterNum = Math.ceil((now.getMonth() + 1) / 3);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(`${now.getFullYear()}-Q${currentQuarterNum}`);
  const { impersonatingTenantId } = usePortal();
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: items, isLoading, refetch } = trpc.coaching.list.useQuery({
    quarter,
    tenantId: impersonatingTenantId ?? undefined,
  });

  const toggle = trpc.coaching.toggle.useMutation({ onSuccess: () => refetch() });

  const completed = (items ?? []).filter((i) => i.isCompleted).length;
  const total = (items ?? []).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Coaching & Accountability</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Quarterly goals and 90-day action items</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select
            value={quarter}
            onValueChange={(v) => setQuarter(v)}
          >
            <SelectTrigger className="w-28 bg-card border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {getQuarters(year).map((q) => (
                <SelectItem key={q} value={q} className="text-sm">{q.split("-")[1]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setQuarter(`${v}-Q${currentQuarterNum}`); }}>
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

      {/* Progress bar */}
      {total > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Quarter Progress</span>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10">
                {completed}/{total} completed
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {total > 0 ? Math.round((completed / total) * 100) : 0}% of goals completed for {quarter}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Items list */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 border-b border-border">
          <CardTitle className="text-sm font-semibold text-foreground">
            Goals & Action Items — {quarter}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (items ?? []).length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 size={40} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No items for {quarter}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your coach will add goals and action items for this quarter.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(items ?? []).map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-4 px-5 py-4 transition-colors ${item.isCompleted ? "opacity-60" : "hover:bg-muted/20"}`}
                >
                  <Checkbox
                    checked={item.isCompleted}
                    onCheckedChange={(checked) =>
                      toggle.mutate({ id: item.id, isCompleted: !!checked })
                    }
                    className="mt-0.5 border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${item.isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {item.title}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                    )}
                    {item.completedAt && (
                      <p className="text-xs text-primary/70 mt-1">
                        Completed {new Date(item.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
