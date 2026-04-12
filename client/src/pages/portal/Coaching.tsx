import { useState, useEffect } from "react";
import { Target } from "lucide-react";
import { trpc } from "../../lib/trpc";

const QUARTERS = [
  { label: "Q1 (Jan–Mar)", value: "Q1" },
  { label: "Q2 (Apr–Jun)", value: "Q2" },
  { label: "Q3 (Jul–Sep)", value: "Q3" },
  { label: "Q4 (Oct–Dec)", value: "Q4" },
];

function getCurrentQuarter(): string {
  const m = new Date().getMonth();
  if (m < 3) return "Q1";
  if (m < 6) return "Q2";
  if (m < 9) return "Q3";
  return "Q4";
}

export default function Coaching() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(getCurrentQuarter());
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() + 1 - i);
  const quarterKey = `${year}-${quarter}`;
  const isCurrentQuarter = year === now.getFullYear() && quarter === getCurrentQuarter();

  const { data: items, isLoading } = trpc.coaching.list.useQuery({
    quarter: quarterKey,
    tenantId: undefined,
  });

  // Combine all items into a single text block for display
  const text = (items ?? []).map((i) => i.title).join("\n");
  const lineCount = text ? text.split("\n").filter(Boolean).length : 0;
  const charCount = text.length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Target size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Quarterly Coaching Goals</h1>
          </div>
          <p className="text-sm text-muted-foreground">Your north star for the quarter. Review weekly, update as needed.</p>
        </div>
        {/* Quarter + Year selectors */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="bg-card border border-border rounded-md text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {QUARTERS.map((q) => (
              <option key={q.value} value={q.value}>{q.label}</option>
            ))}
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

      {/* Quarter badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full border border-primary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {QUARTERS.find((q) => q.value === quarter)?.label} · {year}
          {isCurrentQuarter && (
            <span className="ml-1 bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full">Current Quarter</span>
          )}
        </span>
      </div>

      {/* Goals display */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Goals &amp; Focus Areas</h2>
        </div>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : text ? (
          <div className="p-4">
            <pre className="text-sm text-foreground font-mono leading-relaxed whitespace-pre-wrap">{text}</pre>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center gap-2 text-center px-6">
            <Target size={32} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No goals set for this quarter yet.</p>
            <p className="text-xs text-muted-foreground/60">Your advisor will update your quarterly goals here.</p>
          </div>
        )}
        {text && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 text-[11px] text-muted-foreground">
            <span>{lineCount} {lineCount === 1 ? "goal" : "goals"} · {charCount} characters</span>
            <span className="text-muted-foreground/50">Updated by your advisor</span>
          </div>
        )}
      </div>

      {/* How to use */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">How to use this</h3>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p>Your quarterly goals are set by your KynLi advisor based on your strategy sessions. Review them weekly to stay on track.</p>
          <p>Switch between quarters using the selectors above to review how your focus has evolved over time.</p>
          <p>A summary of your current quarter's goals also appears on the main Overview dashboard for quick reference.</p>
        </div>
      </div>
    </div>
  );
}
