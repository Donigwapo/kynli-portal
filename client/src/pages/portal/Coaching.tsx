import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, Circle, Plus, Trash2, BookOpen, Target,
} from "lucide-react";
import { toast } from "sonner";

type CoachingItem = {
  id: number; year: number; quarter: number; title: string;
  description: string | null; completed: boolean; sort_order: number;
};

const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const MUTED_FG = "oklch(0.50 0.008 240)";

export default function Coaching() {
  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(currentQ);
  const { impersonatingTenantSlug } = usePortal();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const tslug = impersonatingTenantSlug ?? undefined;
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: items = [], isLoading, refetch } = trpc.coaching.list.useQuery(
    { year, quarter, tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  const toggle = trpc.coaching.toggle.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to update goal"),
  });
  const add = trpc.coaching.add.useMutation({
    onSuccess: () => { refetch(); setAddOpen(false); setNewTitle(""); setNewDesc(""); toast.success("Goal added"); },
    onError: () => toast.error("Failed to add goal"),
  });
  const del = trpc.coaching.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Goal removed"); },
    onError: () => toast.error("Failed to delete goal"),
  });

  const completed = items.filter(i => i.completed).length;
  const total = items.length;
  const pct = total > 0 ? (completed / total) * 100 : 0;

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    add.mutate({
      tenantSlug: tslug ?? "",
      year, quarter,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
    });
  };

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Coaching Goals</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Q{quarter} {year} — {completed}/{total} completed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={quarter}
              onChange={e => setQuarter(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {isAdmin && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                Add Goal
              </button>
            )}
          </div>
        </div>

        {/* Progress Summary */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={16} style={{ color: TEAL }} />
              <h2 className="text-sm font-semibold text-foreground">Quarter Progress</h2>
            </div>
            <span className="text-lg font-bold" style={{ color: pct >= 100 ? GREEN : TEAL }}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-3 rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? GREEN : TEAL }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{completed} completed</span>
            <span>{total - completed} remaining</span>
          </div>
        </div>

        {/* Goals List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <BookOpen size={36} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No goals for Q{quarter} {year}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isAdmin ? "Add goals using the button above." : "Your advisor will set goals for this quarter."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item: CoachingItem) => (
              <div
                key={item.id}
                className={`bg-card border rounded-xl p-4 flex items-start gap-3 transition-all ${
                  item.completed ? "border-border/50 opacity-75" : "border-border"
                }`}
              >
                <button
                  onClick={() => toggle.mutate({ id: item.id, completed: !item.completed, tenantSlug: tslug })}
                  className="mt-0.5 shrink-0 hover:opacity-80 transition-opacity"
                >
                  {item.completed ? (
                    <CheckCircle2 size={20} style={{ color: TEAL }} />
                  ) : (
                    <Circle size={20} className="text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => del.mutate({ id: item.id, tenantSlug: tslug ?? "" })}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Goals", value: total, color: MUTED_FG },
              { label: "Completed", value: completed, color: GREEN },
              { label: "Remaining", value: total - completed, color: TEAL },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-xl p-4 text-center">
                <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Goal Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Coaching Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Goal Title *</Label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g., Increase referral rate to 60%"
                className="bg-background border-border"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Description (optional)</Label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Additional context or action steps..."
                className="bg-background border-border resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newTitle.trim() || add.isPending}>
              {add.isPending ? "Adding..." : "Add Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
