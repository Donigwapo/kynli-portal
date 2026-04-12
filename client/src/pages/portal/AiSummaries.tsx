import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Sparkles } from "lucide-react";
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Brain size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Financial Summaries</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monthly AI-generated insights for your business</p>
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

      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <CardTitle className="text-sm font-semibold text-foreground">
              {MONTHS[month - 1]} {year} — Financial Summary
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${85 - i * 10}%` }} />
              ))}
            </div>
          ) : !summary ? (
            <div className="py-12 text-center">
              <Brain size={40} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No summary available</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your accountant will generate an AI summary for {MONTHS[month - 1]} {year} once the financial data is ready.
              </p>
            </div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none text-foreground/90 leading-relaxed">
              <Streamdown>{summary.content}</Streamdown>
              <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
                Generated on {new Date(summary.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
