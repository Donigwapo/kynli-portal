import { Brain, Sparkles, Calendar } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function AiSummaries() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: summary, isLoading } = trpc.aiSummary.get.useQuery({
    year,
    month,
    tenantId: undefined,
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Brain size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">AI Financial Summaries</h1>
          </div>
          <p className="text-sm text-muted-foreground">Monthly AI-generated insights for your business</p>
        </div>
        {/* Month + Year selectors */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-card border border-border rounded-md text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
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

      {/* Period badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full border border-primary/20">
          <Calendar size={11} />
          {MONTHS[month - 1]} {year}
        </span>
        {summary && (
          <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-400 text-xs font-medium px-3 py-1 rounded-full border border-green-500/20">
            <Sparkles size={11} />
            Summary available
          </span>
        )}
      </div>

      {/* Summary card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Sparkles size={14} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            {MONTHS[month - 1]} {year} — Financial Summary
          </h2>
        </div>
        <div className="p-5">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3.5 bg-muted/40 rounded animate-pulse"
                  style={{ width: `${90 - i * 8}%` }}
                />
              ))}
            </div>
          ) : !summary ? (
            <div className="py-14 text-center">
              <div className="w-14 h-14 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
                <Brain size={28} className="text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No summary available</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Your advisor will generate an AI summary for {MONTHS[month - 1]} {year} once the financial data is ready.
              </p>
            </div>
          ) : (
            <div>
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90 leading-relaxed">
                <Streamdown>{summary.content}</Streamdown>
              </div>
              <div className="mt-5 pt-4 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles size={11} className="text-primary" />
                Generated on {new Date(summary.generatedAt).toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric"
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">About AI Summaries</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Each month, your KynLi advisor generates an AI-powered summary of your financial performance. 
          These summaries highlight key trends, flag areas of concern, and provide context for the numbers 
          in your Financials tab. Use the selectors above to browse previous months.
        </p>
      </div>
    </div>
  );
}
