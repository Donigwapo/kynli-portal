import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Save, Target, ChevronDown, Info } from "lucide-react";

// ─── Quarter helpers ──────────────────────────────────────────────────────────
const QUARTERS = [
  { value: 1, label: "Q1 (Jan–Mar)" },
  { value: 2, label: "Q2 (Apr–Jun)" },
  { value: 3, label: "Q3 (Jul–Sep)" },
  { value: 4, label: "Q4 (Oct–Dec)" },
];

function currentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Coaching() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { impersonatingTenantSlug } = usePortal();
  const { user } = useAuth();
  const tslug = impersonatingTenantSlug ?? undefined;

  // Year options: 2 years back, current, 1 year forward
  const yearOptions = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const { data: note, isLoading } = trpc.coaching.getNote.useQuery(
    { year, quarter, tenantSlug: tslug },
    { enabled: !!user }
  );

  const saveMutation = trpc.coaching.saveNote.useMutation({
    onSuccess: () => {
      setSavedContent(content);
      setLastSaved(new Date());
      setSaving(false);
    },
    onError: () => {
      setSaving(false);
    },
  });

  // Load note when query resolves or quarter/year changes
  useEffect(() => {
    const c = note?.content ?? "";
    setContent(c);
    setSavedContent(c);
    setLastSaved(null);
  }, [note, year, quarter]);

  const isDirty = content !== savedContent;

  const handleSave = useCallback(() => {
    if (!isDirty || saving) return;
    setSaving(true);
    saveMutation.mutate({ year, quarter, content, tenantSlug: tslug });
  }, [isDirty, saving, saveMutation, year, quarter, content, tslug]);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Line and char count
  const lines = content.split("\n").length;
  const chars = content.length;

  const selectedQ = QUARTERS.find(q => q.value === quarter)!;
  const isCurrent = now.getFullYear() === year && currentQuarter() === quarter;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Target size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Quarterly Coaching Goals</h1>
          </div>
          <p className="text-sm text-muted-foreground">Your north star for the quarter. Review weekly, update as needed.</p>
        </div>
        {/* Q + Year selectors */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <select
              value={quarter}
              onChange={e => setQuarter(Number(e.target.value))}
              className="appearance-none bg-card border border-border rounded-lg px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {QUARTERS.map(q => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="appearance-none bg-card border border-border rounded-lg px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Current quarter badge */}
      <div className="flex items-center gap-2">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold"
          style={{
            backgroundColor: "oklch(0.75 0.15 192 / 0.12)",
            border: "1px solid oklch(0.75 0.15 192 / 0.3)",
            color: "oklch(0.75 0.15 192)",
          }}
        >
          <Target size={13} />
          {selectedQ.label} · {year}
        </div>
        {isCurrent && (
          <span className="text-xs text-muted-foreground">· Current Quarter</span>
        )}
      </div>

      {/* Goals editor card */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
      >
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Goals &amp; Focus Areas</h2>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
            style={{
              backgroundColor: isDirty ? "oklch(0.75 0.15 192 / 0.15)" : "transparent",
              border: `1px solid ${isDirty ? "oklch(0.75 0.15 192 / 0.4)" : "var(--border)"}`,
              color: isDirty ? "oklch(0.75 0.15 192)" : "var(--muted-foreground)",
            }}
          >
            <Save size={12} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {/* Textarea */}
        {isLoading ? (
          <div className="px-5 py-8 text-center">
            <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={`Write your Q${quarter} ${year} goals here…\n\nExamples:\n- Sign 12 new clients\n- Launch the new website\n- Hit $50k MRR`}
            className="w-full resize-none bg-transparent px-5 py-5 text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 font-mono leading-relaxed"
            style={{ minHeight: "360px" }}
            spellCheck={false}
          />
        )}

        {/* Footer: line/char count + keyboard hint */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {lines} {lines === 1 ? "line" : "lines"} · {chars} {chars === 1 ? "character" : "characters"}
          </span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {lastSaved && (
              <span>Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            )}
            <span>Ctrl+S to save</span>
          </div>
        </div>
      </div>

      {/* How to use this */}
      <div
        className="rounded-2xl border p-5 space-y-3"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
      >
        <div className="flex items-center gap-2">
          <Info size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">How to use this</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Write your quarterly goals in any format — bullet points, numbered lists, or paragraphs. This is your personal reference, not a formal document.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Switch between quarters using the selectors above. Each quarter saves independently, so you can track how your focus evolves over time.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A summary of your current quarter's goals also appears on the main Overview dashboard for quick reference.
        </p>
      </div>
    </div>
  );
}
