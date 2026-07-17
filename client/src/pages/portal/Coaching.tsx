import { useState, useEffect, useRef, useCallback, useMemo, type ClipboardEvent as ReactClipboardEvent } from "react";
import { trpc } from "@/lib/trpc";
import { htmlWithListsToMarkdown, insertTextAtSelection } from "@/lib/markdownPaste";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Save, Target, ChevronDown, Info, CheckCircle2, Circle, Plus, MoreHorizontal, Pencil, Trash2, Download } from "lucide-react";
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType } from "docx";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const QUARTERS = [
  { value: 1, label: "Q1 (Jan–Mar)" },
  { value: 2, label: "Q2 (Apr–Jun)" },
  { value: 3, label: "Q3 (Jul–Sep)" },
  { value: 4, label: "Q4 (Oct–Dec)" },
];

const NEXT_STEP_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
] as const;

const NEXT_STEP_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

function currentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function statusLabel(status?: string | null): string {
  return NEXT_STEP_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? "Not Started";
}

function priorityLabel(priority?: string | null): string {
  return NEXT_STEP_PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? "Medium";
}

function statusBadgeClass(status?: string | null): string {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "in_progress") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  if (status === "waiting") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "blocked") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-zinc-600 bg-zinc-800/80 text-zinc-200";
}

function formatDate(value?: string | null): string {
  if (!value) return "No due date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No due date";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeExportSlug(input: string): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function exportDateStamp(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

const KYNLI_LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663280358154/DHoPFRmeekJSRWmQf4bAQb/kynli-logo_c9409708.png";

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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
  const canManageNextSteps = user?.role !== "client";
  const tslug = impersonatingTenantSlug ?? undefined;
  const utils = trpc.useUtils();

  const [nextStepModalOpen, setNextStepModalOpen] = useState(false);
  const [editingNextStepId, setEditingNextStepId] = useState<number | null>(null);
  const [nextStepTitle, setNextStepTitle] = useState("");
  const [nextStepDescription, setNextStepDescription] = useState("");
  const [nextStepDueDate, setNextStepDueDate] = useState("");
  const [nextStepPriority, setNextStepPriority] = useState<(typeof NEXT_STEP_PRIORITY_OPTIONS)[number]["value"]>("medium");
  const [nextStepStatus, setNextStepStatus] = useState<(typeof NEXT_STEP_STATUS_OPTIONS)[number]["value"]>("not_started");
  const [nextStepAssignedTo, setNextStepAssignedTo] = useState<string>("unassigned");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const yearOptions = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const { data: note, isLoading } = trpc.coaching.getNote.useQuery(
    { year, quarter, tenantSlug: tslug },
    { enabled: !!user }
  );

  const { data: tenant } = trpc.tenant.me.useQuery(undefined, { enabled: !!user });

  const { data: nextSteps = [], isLoading: nextStepsLoading } = trpc.coaching.nextStepsList.useQuery(
    { year, quarter, tenantSlug: tslug },
    { enabled: !!user }
  );

  const membersQuery = trpc.chat.mentionCandidates.useQuery(
    { tenantSlug: tslug },
    { enabled: !!user && canManageNextSteps }
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

  const createNextStepMutation = trpc.coaching.nextStepsCreate.useMutation({
    onSuccess: async () => {
      await utils.coaching.nextStepsList.invalidate({ year, quarter, tenantSlug: tslug });
      toast.success("Next step created");
      closeNextStepModal();
    },
    onError: (e) => toast.error(e.message || "Failed to create next step"),
  });

  const updateNextStepMutation = trpc.coaching.nextStepsUpdate.useMutation({
    onSuccess: async () => {
      await utils.coaching.nextStepsList.invalidate({ year, quarter, tenantSlug: tslug });
      toast.success("Next step updated");
      closeNextStepModal();
    },
    onError: (e) => toast.error(e.message || "Failed to update next step"),
  });

  const deleteNextStepMutation = trpc.coaching.nextStepsDelete.useMutation({
    onSuccess: async () => {
      await utils.coaching.nextStepsList.invalidate({ year, quarter, tenantSlug: tslug });
      toast.success("Next step deleted");
    },
    onError: (e) => toast.error(e.message || "Failed to delete next step"),
  });

  useEffect(() => {
    const c = note?.content ?? "";
    setContent(c);
    setSavedContent(c);
    setLastSaved(null);
  }, [note, year, quarter]);

  const isDirty = content !== savedContent;

  const handleGoalsPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html?.trim()) return;

    const markdownFromHtml = htmlWithListsToMarkdown(html);
    if (!markdownFromHtml) return;

    e.preventDefault();

    const textarea = e.currentTarget;
    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;

    const { value, cursor } = insertTextAtSelection({
      currentValue: content,
      insertText: markdownFromHtml,
      selectionStart,
      selectionEnd,
    });

    setContent(value);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleSave = useCallback(() => {
    if (!isDirty || saving) return;
    setSaving(true);
    saveMutation.mutate({ year, quarter, content, tenantSlug: tslug });
  }, [isDirty, saving, saveMutation, year, quarter, content, tslug]);

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

  const lines = content.split("\n").length;
  const chars = content.length;

  const selectedQ = QUARTERS.find(q => q.value === quarter)!;
  const isCurrent = now.getFullYear() === year && currentQuarter() === quarter;

  const completedCount = nextSteps.filter((s: any) => s.status === "completed").length;
  const totalCount = nextSteps.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const memberOptions = useMemo(() => {
    const rows = (membersQuery.data ?? []) as Array<any>;
    const seen = new Set<string>();
    return rows
      .map((m) => ({ id: Number(m.id), name: String(m.displayName || m.email || `User ${m.id}`), role: String(m.role || "") }))
      .filter((m) => {
        if (!Number.isFinite(m.id)) return false;
        const key = String(m.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [membersQuery.data]);

  const memberNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of memberOptions) map.set(Number(m.id), m.name);
    return map;
  }, [memberOptions]);

  function closeNextStepModal() {
    setNextStepModalOpen(false);
    setEditingNextStepId(null);
    setNextStepTitle("");
    setNextStepDescription("");
    setNextStepDueDate("");
    setNextStepPriority("medium");
    setNextStepStatus("not_started");
    setNextStepAssignedTo("unassigned");
  }

  function openCreateNextStep() {
    setEditingNextStepId(null);
    setNextStepTitle("");
    setNextStepDescription("");
    setNextStepDueDate("");
    setNextStepPriority("medium");
    setNextStepStatus("not_started");
    setNextStepAssignedTo("unassigned");
    setNextStepModalOpen(true);
  }

  function openEditNextStep(step: any) {
    setEditingNextStepId(Number(step.id));
    setNextStepTitle(String(step.title ?? ""));
    setNextStepDescription(String(step.description ?? ""));
    setNextStepDueDate(step.due_date ? String(step.due_date).slice(0, 10) : "");
    setNextStepPriority((step.priority ?? "medium") as any);
    setNextStepStatus((step.status ?? "not_started") as any);
    setNextStepAssignedTo(step.assigned_to != null ? String(step.assigned_to) : "unassigned");
    setNextStepModalOpen(true);
  }

  async function saveNextStep() {
    const title = nextStepTitle.trim();
    if (!title) {
      toast.error("Task name is required");
      return;
    }

    const assignedTo = nextStepAssignedTo === "unassigned" ? null : Number(nextStepAssignedTo);

    if (editingNextStepId) {
      await updateNextStepMutation.mutateAsync({
        id: editingNextStepId,
        tenantSlug: tslug,
        title,
        description: nextStepDescription.trim() || null,
        status: nextStepStatus,
        priority: nextStepPriority,
        assignedTo,
        dueDate: nextStepDueDate || null,
      });
    } else {
      await createNextStepMutation.mutateAsync({
        tenantSlug: tslug,
        year,
        quarter,
        title,
        description: nextStepDescription.trim() || null,
        status: nextStepStatus,
        priority: nextStepPriority,
        assignedTo,
        dueDate: nextStepDueDate || null,
      });
    }
  }

  async function updateStatus(stepId: number, status: (typeof NEXT_STEP_STATUS_OPTIONS)[number]["value"]) {
    await updateNextStepMutation.mutateAsync({ id: stepId, status, tenantSlug: tslug });
  }

  const buildExportRows = () => {
    return (nextSteps as Array<any>).map((step) => ({
      task: String(step.title || "Untitled"),
      status: statusLabel(step.status),
      priority: priorityLabel(step.priority),
      dueDate: formatDate(step.due_date),
      assignedTo: step.assigned_to != null ? (memberNameById.get(Number(step.assigned_to)) || `User ${step.assigned_to}`) : "Unassigned",
      completedAt: step.completed_at ? formatDate(step.completed_at) : null,
    }));
  };

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const nowDate = new Date();
      const rows = buildExportRows();
      const completed = (nextSteps as Array<any>).filter((s) => s.status === "completed").length;
      const total = (nextSteps as Array<any>).length;
      const remaining = Math.max(total - completed, 0);
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      const clientName = String(tenant?.company_name || tenant?.contact_name || tenant?.email || "Client");
      const goalsText = String(content || "").trim() || "No quarterly goals entered.";
      const dateGenerated = formatDateTime(nowDate);

      const tableRows = [
        new TableRow({
          children: ["Task", "Status", "Priority", "Due Date", "Assigned To"].map((h) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] }),
          ),
        }),
        ...rows.map((r) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(r.task)] }),
              new TableCell({ children: [new Paragraph(r.completedAt ? `${r.status} (${r.completedAt})` : r.status)] }),
              new TableCell({ children: [new Paragraph(r.priority)] }),
              new TableCell({ children: [new Paragraph(r.dueDate)] }),
              new TableCell({ children: [new Paragraph(r.assignedTo)] }),
            ],
          }),
        ),
      ];

      const doc = new DocxDocument({
        sections: [
          {
            children: [
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Kynli Coaching Report")] }),
              new Paragraph(`Client: ${clientName}`),
              new Paragraph(`Quarter: Q${quarter}`),
              new Paragraph(`Year: ${year}`),
              new Paragraph(`Date Generated: ${dateGenerated}`),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Quarterly Goals")] }),
              new Paragraph(goalsText),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Next Steps")] }),
              new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Progress Summary")] }),
              new Paragraph(`Progress: ${pct}%`),
              new Paragraph(`Completed: ${completed}`),
              new Paragraph(`Remaining: ${remaining}`),
              new Paragraph(`Total Tasks: ${total}`),
              new Paragraph({ text: "" }),
              new Paragraph({ children: [new TextRun({ text: "Generated by Kynli Portal", italics: true })] }),
              new Paragraph({ children: [new TextRun({ text: `Generated on: ${dateGenerated}`, italics: true })] }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const titlePart = safeExportSlug(`${clientName}-Q${quarter}-${year}`) || `Deep-Dive-Q${quarter}-${year}`;
      link.href = url;
      link.download = `Deep-Dive-${titlePart}-${exportDateStamp(nowDate)}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Word export downloaded.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to export Word file.");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const nowDate = new Date();
      const rows = buildExportRows();
      const completed = (nextSteps as Array<any>).filter((s) => s.status === "completed").length;
      const total = (nextSteps as Array<any>).length;
      const remaining = Math.max(total - completed, 0);
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const clientName = String(tenant?.company_name || tenant?.contact_name || tenant?.email || "Client");
      const goalsText = String(content || "").trim() || "No quarterly goals entered.";
      const dateGenerated = formatDateTime(nowDate);

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      const maxWidth = pageWidth - margin * 2;
      const lineH = 15;
      let y = 48;

      const ensure = (need = lineH) => {
        if (y + need > pageHeight - 48) {
          doc.addPage();
          y = 48;
        }
      };

      const write = (text: string, opts?: { size?: number; bold?: boolean; after?: number }) => {
        doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
        doc.setFontSize(opts?.size ?? 11);
        const lines = doc.splitTextToSize(text, maxWidth) as string[];
        for (const ln of lines) {
          ensure(lineH);
          doc.text(ln, margin, y);
          y += lineH;
        }
        y += opts?.after ?? 3;
      };

      const logoData = await loadImageDataUrl(KYNLI_LOGO_URL);
      if (logoData) {
        try {
          doc.addImage(logoData, "PNG", margin, y - 8, 120, 28);
          y += 34;
        } catch {
          // continue without logo
        }
      }

      write("Kynli Coaching Report", { size: 18, bold: true, after: 8 });
      write(`Client: ${clientName}`);
      write(`Quarter: Q${quarter}`);
      write(`Year: ${year}`);
      write(`Date Generated: ${dateGenerated}`, { after: 8 });

      write("Quarterly Goals", { size: 13, bold: true, after: 2 });
      write(goalsText, { after: 8 });

      write("Next Steps", { size: 13, bold: true, after: 4 });
      if (!rows.length) {
        write("No next steps available.");
      } else {
        const headers = ["Task", "Status", "Priority", "Due Date", "Assigned To"];
        write(headers.join("  |  "), { bold: true, after: 2 });
        write("-".repeat(120), { after: 2 });
        for (const r of rows) {
          write(`${r.task} | ${r.completedAt ? `${r.status} (${r.completedAt})` : r.status} | ${r.priority} | ${r.dueDate} | ${r.assignedTo}`);
        }
      }

      write("Progress Summary", { size: 13, bold: true, after: 2 });
      write(`Progress: ${pct}%`);
      write(`Completed: ${completed}`);
      write(`Remaining: ${remaining}`);
      write(`Total Tasks: ${total}`, { after: 8 });

      write("Generated by Kynli Portal", { size: 10, bold: true, after: 2 });
      write(`Generated on: ${dateGenerated}`, { size: 10 });

      const titlePart = safeExportSlug(`${clientName}-Q${quarter}-${year}`) || `Deep-Dive-Q${quarter}-${year}`;
      doc.save(`Deep-Dive-${titlePart}-${exportDateStamp(nowDate)}.pdf`);
      toast.success("PDF export downloaded.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to export PDF file.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 xl:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Target size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Quarterly Coaching Goals</h1>
          </div>
          <p className="text-sm text-muted-foreground">Your north star for the quarter. Review weekly, update as needed.</p>
        </div>
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5" disabled={isExportingPdf || isExportingDocx}>
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <DropdownMenuItem disabled={isExportingPdf} onClick={() => void handleExportPdf()}>
                📄 {isExportingPdf ? "Exporting PDF..." : "Export as PDF"}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isExportingDocx} onClick={() => void handleExportDocx()}>
                📝 {isExportingDocx ? "Exporting Word..." : "Export as Word (.docx)"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
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

        {isLoading ? (
          <div className="px-5 py-8 text-center">
            <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onPaste={handleGoalsPaste}
            placeholder={`Write your Q${quarter} ${year} goals here…\n\nExamples:\n- Sign 12 new clients\n- Launch the new website\n- Hit $50k MRR`}
            className="w-full resize-none bg-transparent px-5 py-5 text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 font-mono leading-relaxed"
            style={{ minHeight: "360px" }}
            spellCheck={false}
          />
        )}

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

      <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Next Steps</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Break down your quarterly goals into actionable steps. Track progress between coaching sessions.</p>
          </div>
          {canManageNextSteps && (
            <Button size="sm" className="gap-1.5" onClick={openCreateNextStep}>
              <Plus className="w-3.5 h-3.5" />
              Add Next Step
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border p-3 bg-background/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-medium">Progress</span>
            <span>{completionPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{completedCount} of {totalCount} completed</p>
        </div>

        <div className="space-y-2">
          {nextStepsLoading ? (
            <p className="text-sm text-muted-foreground">Loading next steps...</p>
          ) : nextSteps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No next steps yet.</p>
          ) : (
            (nextSteps as Array<any>).map((step) => {
              const isCompleted = step.status === "completed";
              return (
                <div key={step.id} className="rounded-lg border border-border bg-background/20 px-3 py-2.5 hover:bg-background/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => void updateStatus(Number(step.id), isCompleted ? "in_progress" : "completed")}
                      className="mt-0.5 text-zinc-300 hover:text-emerald-300 transition-colors"
                      aria-label={isCompleted ? "Mark incomplete" : "Mark completed"}
                    >
                      {isCompleted ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" /> : <Circle className="w-4.5 h-4.5" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium break-words ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>{step.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Due: {formatDate(step.due_date)}</span>
                        <Badge className={statusBadgeClass(step.status)}>{statusLabel(step.status)}</Badge>
                        <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-300">{priorityLabel(step.priority)}</Badge>
                      </div>
                      {step.description ? (
                        <p className={`text-xs mt-1.5 ${isCompleted ? "text-muted-foreground/70" : "text-muted-foreground"}`}>{step.description}</p>
                      ) : null}
                    </div>

                    <div className="w-[170px]">
                      <Select
                        value={String(step.status ?? "not_started")}
                        onValueChange={(value) => void updateStatus(Number(step.id), value as any)}
                      >
                        <SelectTrigger className="h-8 bg-zinc-900/60 border-zinc-700 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NEXT_STEP_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {canManageNextSteps && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="mt-0.5 p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" aria-label="More actions">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800 text-zinc-100">
                          <DropdownMenuItem onClick={() => openEditNextStep(step)} className="gap-2">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-rose-300 focus:text-rose-200"
                            onClick={() => {
                              if (confirm("Delete this next step?")) {
                                deleteNextStepMutation.mutate({ id: Number(step.id), tenantSlug: tslug });
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
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

      <Dialog open={nextStepModalOpen} onOpenChange={(open) => (open ? setNextStepModalOpen(true) : closeNextStepModal())}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingNextStepId ? "Edit Next Step" : "Add Next Step"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Task Name</Label>
              <Input
                value={nextStepTitle}
                onChange={(e) => setNextStepTitle(e.target.value)}
                placeholder="e.g. Upload missing tax documents"
                className="mt-1 bg-zinc-900 border-zinc-700"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveNextStep();
                  }
                }}
              />
            </div>

            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={nextStepDescription}
                onChange={(e) => setNextStepDescription(e.target.value)}
                placeholder="Add details for the client..."
                className="mt-1 bg-zinc-900 border-zinc-700 min-h-[90px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={nextStepDueDate} onChange={(e) => setNextStepDueDate(e.target.value)} className="mt-1 bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={nextStepPriority} onValueChange={(v) => setNextStepPriority(v as any)}>
                  <SelectTrigger className="mt-1 bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NEXT_STEP_PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={nextStepStatus} onValueChange={(v) => setNextStepStatus(v as any)}>
                  <SelectTrigger className="mt-1 bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NEXT_STEP_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign To (optional)</Label>
                <Select value={nextStepAssignedTo} onValueChange={(v) => setNextStepAssignedTo(v)}>
                  <SelectTrigger className="mt-1 bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {memberOptions.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeNextStepModal}>Cancel</Button>
            <Button onClick={() => void saveNextStep()} disabled={createNextStepMutation.isPending || updateNextStepMutation.isPending}>
              {createNextStepMutation.isPending || updateNextStepMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
