import { useEffect, useMemo, useState } from "react";
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePortal } from "@/contexts/PortalContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, Filter, Plus, Pencil, Trash2 } from "lucide-react";

const MEETING_TYPES = ["all", "quarterly_review", "monthly_cfo", "tax_planning", "bookkeeping_review", "other"] as const;
const STATUSES = ["all", "scheduled", "completed", "cancelled"] as const;
const ITEM_STATUSES = ["open", "in_progress", "completed"] as const;

type ItemDraft = {
  id?: number;
  title: string;
  details: string;
  status: "open" | "in_progress" | "completed";
  dueDate: string;
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function normalizeItems(items: ItemDraft[]) {
  return items
    .map((it, idx) => ({
      title: it.title.trim(),
      details: it.details.trim() || null,
      status: it.status,
      dueDate: it.dueDate || null,
      sortOrder: idx,
    }))
    .filter((it) => it.title.length > 0);
}

function safeExportSlug(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function exportDateStamp(input?: string | null): string {
  const raw = String(input || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function fmtItemStatus(status?: string | null): string {
  const normalized = String(status || "open").replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

type CoachingClientMeetingProps = {
  mode?: "clientMeeting" | "checkInCalls";
};

export default function CoachingClientMeeting({ mode = "clientMeeting" }: CoachingClientMeetingProps) {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();
  const tenantSlug = impersonatingTenantSlug ?? undefined;
  const isClientReadOnly = user?.role === "client";
  const meetingMode = mode === "checkInCalls" ? "check_in_call" : "client_meeting";

  const utils = trpc.useUtils();
  const {
    data: meetings = [],
    isLoading: isMeetingsLoading,
    isError: isMeetingsError,
  } = trpc.coaching.meetingsList.useQuery({ tenantSlug, mode: meetingMode });

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingType, setMeetingType] = useState<"quarterly_review" | "monthly_cfo" | "tax_planning" | "bookkeeping_review" | "other">("other");
  const [status, setStatus] = useState<"scheduled" | "completed" | "cancelled">("completed");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);

  const [baselineMeeting, setBaselineMeeting] = useState({ title: "", meetingDate: "", meetingType: "other", status: "completed", notes: "" });
  const [baselineItems, setBaselineItems] = useState<string>("[]");

  const [editMeta, setEditMeta] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [editItems, setEditItems] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const detailQuery = trpc.coaching.meetingsGet.useQuery(
    { id: selectedMeetingId ?? 0, tenantSlug, mode: meetingMode },
    { enabled: !!selectedMeetingId && !isCreating }
  );

  const createMutation = trpc.coaching.meetingsCreate.useMutation({
    onSuccess: async (res) => {
      await utils.coaching.meetingsList.invalidate({ tenantSlug, mode: meetingMode });
      setIsCreating(false);
      setSelectedMeetingId(res.meeting.id);
      setEditMeta(false);
      setEditNotes(false);
      setEditItems(false);
    },
  });

  const updateMutation = trpc.coaching.meetingsUpdate.useMutation({
    onSuccess: async () => {
      await utils.coaching.meetingsGet.invalidate({ id: selectedMeetingId ?? 0, tenantSlug, mode: meetingMode });
      await utils.coaching.meetingsList.invalidate({ tenantSlug, mode: meetingMode });
      setEditMeta(false);
      setEditNotes(false);
    },
  });

  const deleteMutation = trpc.coaching.meetingsDelete.useMutation({
    onSuccess: async () => {
      await utils.coaching.meetingsList.invalidate({ tenantSlug, mode: meetingMode });
      setSelectedMeetingId(null);
      setIsCreating(false);
      setEditMeta(false);
      setEditNotes(false);
      setEditItems(false);
    },
  });

  const upsertItemsMutation = trpc.coaching.meetingActionItemsUpsertBatch.useMutation({
    onSuccess: async () => {
      await utils.coaching.meetingsGet.invalidate({ id: selectedMeetingId ?? 0, tenantSlug, mode: meetingMode });
      await utils.coaching.meetingsList.invalidate({ tenantSlug, mode: meetingMode });
      setEditItems(false);
    },
  });

  const updateItemStatusMutation = trpc.coaching.meetingActionItemsUpdateStatus.useMutation({
    onSuccess: async () => {
      await utils.coaching.meetingsGet.invalidate({ id: selectedMeetingId ?? 0, tenantSlug, mode: meetingMode });
      await utils.coaching.meetingsList.invalidate({ tenantSlug, mode: meetingMode });
    },
  });

  const rows = useMemo(() => meetings as Array<any>, [meetings]);

  const yearOptions = useMemo(() => {
    const y = new Set<string>();
    rows.forEach((m) => {
      const d = m?.meeting_date ? new Date(m.meeting_date) : null;
      if (d && !Number.isNaN(d.getTime())) y.add(String(d.getFullYear()));
    });
    return ["all", ...Array.from(y).sort((a, b) => Number(b) - Number(a))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((m) => {
      const titleMatch = !q || String(m.title || "").toLowerCase().includes(q);
      const typeMatch = typeFilter === "all" || (m.meeting_type ?? "other") === typeFilter;
      const statusMatch = statusFilter === "all" || m.status === statusFilter;
      const yearMatch = yearFilter === "all" || (m.meeting_date && String(new Date(m.meeting_date).getFullYear()) === yearFilter);
      return titleMatch && typeMatch && statusMatch && yearMatch;
    });
  }, [rows, search, typeFilter, statusFilter, yearFilter]);

  useEffect(() => {
    if (isCreating) return;
    if (selectedMeetingId && rows.some((r) => r.id === selectedMeetingId)) return;
    if (rows.length > 0) setSelectedMeetingId(rows[0].id);
  }, [rows, selectedMeetingId, isCreating]);

  useEffect(() => {
    if (!isCreating) return;
    setTitle("");
    setMeetingDate("");
    setMeetingType("other");
    setStatus("completed");
    setNotes("");
    setItems([]);
    setBaselineMeeting({ title: "", meetingDate: "", meetingType: "other", status: "completed", notes: "" });
    setBaselineItems("[]");
    setEditMeta(true);
    setEditNotes(true);
    setEditItems(true);
  }, [isCreating]);

  useEffect(() => {
    if (!detailQuery.data?.meeting || isCreating) return;
    const meeting = detailQuery.data.meeting as any;
    const actionItems = (detailQuery.data.actionItems as Array<any>) || [];

    const nextTitle = meeting.title ?? "";
    const nextDate = String(meeting.meeting_date ?? "");
    const nextType = (meeting.meeting_type ?? "other") as "quarterly_review" | "monthly_cfo" | "tax_planning" | "bookkeeping_review" | "other";
    const nextStatus = (meeting.status ?? "completed") as "scheduled" | "completed" | "cancelled";
    const nextNotes = meeting.notes ?? "";
    const nextItems: ItemDraft[] = actionItems.map((it) => ({
      id: it.id,
      title: it.title,
      details: it.details ?? "",
      status: (it.status ?? "open") as "open" | "in_progress" | "completed",
      dueDate: it.due_date ? String(it.due_date).slice(0, 10) : "",
    }));

    setTitle(nextTitle);
    setMeetingDate(nextDate);
    setMeetingType(nextType);
    setStatus(nextStatus);
    setNotes(nextNotes);
    setItems(nextItems);
    setBaselineMeeting({ title: nextTitle, meetingDate: nextDate, meetingType: nextType, status: nextStatus, notes: nextNotes });
    setBaselineItems(JSON.stringify(normalizeItems(nextItems)));
    setEditMeta(false);
    setEditNotes(false);
    setEditItems(false);
  }, [detailQuery.data, isCreating]);

  const isMeetingDirty =
    title !== baselineMeeting.title ||
    meetingDate !== baselineMeeting.meetingDate ||
    meetingType !== baselineMeeting.meetingType ||
    status !== baselineMeeting.status ||
    notes !== baselineMeeting.notes;

  const serializedItems = JSON.stringify(normalizeItems(items));
  const isItemsDirty = serializedItems !== baselineItems;
  const canSaveMeeting = title.trim().length > 0 && meetingDate.length > 0;

  const handleCreateNew = () => {
    setSelectedMeetingId(null);
    setIsCreating(true);
  };

  const handleSelectMeeting = (id: number) => {
    setIsCreating(false);
    setSelectedMeetingId(id);
  };

  const saveMeeting = () => {
    if (!canSaveMeeting || isClientReadOnly) return;
    if (isCreating) {
      createMutation.mutate({
        tenantSlug,
        mode: meetingMode,
        title: title.trim(),
        meetingDate,
        meetingType,
        status,
        notes: notes.trim() || null,
      });
      return;
    }
    if (!selectedMeetingId) return;
    updateMutation.mutate({
      id: selectedMeetingId,
      tenantSlug,
      mode: meetingMode,
      title: title.trim(),
      meetingDate,
      meetingType,
      status,
      notes: notes.trim() || null,
    });
  };

  const saveItems = () => {
    if (isClientReadOnly || !selectedMeetingId) return;
    upsertItemsMutation.mutate({
      meetingId: selectedMeetingId,
      tenantSlug,
      mode: meetingMode,
      items: normalizeItems(items),
    });
  };

  const hasSelection = isCreating || !!selectedMeetingId;

  const handleExportDocx = async () => {
    if (!selectedMeetingId || isCreating) return;
    const detail = detailQuery.data;
    const meeting = detail?.meeting as any;
    const actionItems = (detail?.actionItems as Array<any>) || [];
    if (!meeting) {
      toast.error("Meeting details are still loading. Please try again.");
      return;
    }

    setIsExportingDocx(true);
    try {
      const kindLabel = mode === "checkInCalls" ? "Check-in Call" : "Client Meeting";
      const heading = `${kindLabel}: ${String(meeting.title || "Untitled")}`;
      const meetingDateText = fmtDate(meeting.meeting_date);
      const meetingTypeText = String(meeting.meeting_type || "other");
      const statusText = String(meeting.status || "completed");
      const notesText = String(meeting.notes || "").trim() || "No meeting notes.";

      const itemParagraphs = actionItems.length
        ? actionItems.flatMap((it: any, idx: number) => {
            const dueRaw = it?.due_date ? String(it.due_date).slice(0, 10) : null;
            const dueText = dueRaw ? fmtDate(dueRaw) : "No due date";
            const detailsText = String(it?.details || "").trim() || "No description.";
            return [
              new Paragraph({
                spacing: { before: 120 },
                children: [
                  new TextRun({ text: `${idx + 1}. ${String(it?.title || "Untitled task")}`, bold: true }),
                ],
              }),
              new Paragraph({ children: [new TextRun({ text: `Description: ${detailsText}` })] }),
              new Paragraph({ children: [new TextRun({ text: `Due date: ${dueText}` })] }),
              new Paragraph({ children: [new TextRun({ text: `Status: ${fmtItemStatus(it?.status)}` })] }),
            ];
          })
        : [new Paragraph({ children: [new TextRun({ text: "No next steps have been assigned yet." })] })];

      const doc = new DocxDocument({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: heading })],
              }),
              new Paragraph({ children: [new TextRun({ text: `Date: ${meetingDateText}` })] }),
              new Paragraph({ children: [new TextRun({ text: `Type: ${meetingTypeText}` })] }),
              new Paragraph({ children: [new TextRun({ text: `Status: ${statusText}` })] }),
              new Paragraph({ text: "" }),
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: "Meeting Notes" })],
              }),
              new Paragraph({ children: [new TextRun({ text: notesText })] }),
              new Paragraph({ text: "" }),
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: "Next Steps" })],
              }),
              ...itemParagraphs,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const titlePart = safeExportSlug(String(meeting.title || "Meeting")) || "Meeting";
      const datePart = exportDateStamp(meeting.meeting_date);
      const prefix = mode === "checkInCalls" ? "Check-in-Call" : "Client-Meeting";
      link.href = url;
      link.download = `${prefix}-${titlePart}-${datePart}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("DOCX export downloaded.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to export DOCX. Please try again.");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const pageTitle = mode === "checkInCalls" ? "Check-in Calls" : "Client Meeting";

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-zinc-100 tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage meeting notes, client homework, and follow-up items.</p>
        </div>
        {!isClientReadOnly && (
          <Button onClick={handleCreateNew} className="bg-emerald-500 hover:bg-emerald-400 text-black">
            <Plus className="w-4 h-4 mr-1" /> New Meeting
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-10 gap-6 min-h-[72vh] xl:h-[calc(100vh-190px)]">
        <aside className="xl:col-span-3 rounded-xl bg-zinc-900/40 p-3 xl:h-full flex flex-col">
          <div className="space-y-2 mb-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings"
              className="bg-zinc-900 border-zinc-700"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start border-zinc-700 text-zinc-300"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="w-4 h-4 mr-2" /> Filters {showFilters ? "▾" : "▸"}
            </Button>
            {showFilters && (
              <div className="grid grid-cols-1 gap-2 pt-1">
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={y}>{y === "all" ? "All Years" : y}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>{MEETING_TYPES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "All Types" : t}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All Status" : s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="overflow-auto space-y-2 pr-1 max-h-[calc(72vh-130px)] xl:max-h-none xl:flex-1">
            {isMeetingsLoading ? (
              <div className="text-sm text-zinc-400 p-3">Loading meetings...</div>
            ) : isMeetingsError ? (
              <div className="text-sm text-red-300 p-3">Unable to load meetings. Please refresh or try again.</div>
            ) : filteredRows.length === 0 ? (
              <div className="text-sm text-zinc-400 p-3">No meetings found.</div>
            ) : (
              filteredRows.map((m) => {
                const active = !isCreating && selectedMeetingId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMeeting(m.id)}
                    className="w-full text-left rounded-xl px-3 py-3 transition border"
                    style={active
                      ? { borderColor: "rgba(0,212,170,0.55)", backgroundColor: "rgba(0,212,170,0.09)" }
                      : { borderColor: "rgba(63,63,70,0.8)", backgroundColor: "rgba(24,24,27,0.45)" }
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-100 truncate">{m.title}</p>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300 whitespace-nowrap text-[10px]">{m.status}</Badge>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{fmtDate(m.meeting_date)} • {m.meeting_type ?? "other"}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>Open items: {m.open_action_items ?? 0}</span>
                      <span>Created by: {m.created_by_user_id ?? "—"}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="xl:col-span-7 rounded-xl bg-zinc-900/35 p-5 md:p-6 xl:h-full xl:flex xl:flex-col">
          {!hasSelection ? (
            <div className="h-full min-h-[360px] flex items-center justify-center text-center">
              <div>
                <p className="text-zinc-200 text-lg font-medium">Select a meeting or create a new one.</p>
                <p className="text-sm text-zinc-500 mt-2">This workspace will show notes, homework, and follow-up context.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8 xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:pr-2">
              {/* Meeting document header */}
              <div className="space-y-4 xl:sticky xl:top-0 xl:z-10 xl:bg-zinc-900/80 xl:backdrop-blur-sm xl:pb-3">
                {editMeta || isCreating ? (
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isClientReadOnly} placeholder="Meeting Title" className="bg-zinc-900 border-zinc-700 text-xl font-semibold h-12" />
                ) : (
                  <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 break-words">{title || "Untitled Meeting"}</h2>
                )}

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {editMeta || isCreating ? (
                    <>
                      <div className="min-w-[180px]"><Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} disabled={isClientReadOnly} className="bg-zinc-900 border-zinc-700" /></div>
                      <Select value={meetingType} onValueChange={(v) => setMeetingType(v as any)} disabled={isClientReadOnly}>
                        <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                        <SelectContent>{MEETING_TYPES.filter((t) => t !== "all").map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={status} onValueChange={(v) => setStatus(v as any)} disabled={isClientReadOnly}>
                        <SelectTrigger className="w-[170px] bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUSES.filter((s) => s !== "all").map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 border border-zinc-700 text-zinc-300"><CalendarDays className="w-3.5 h-3.5" /> {fmtDate(meetingDate)}</span>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">{meetingType}</Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">{status}</Badge>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isCreating && selectedMeetingId ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="border-zinc-700 text-zinc-200">
                          Export <ChevronDown className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="bg-zinc-950 border-zinc-800 text-zinc-100">
                        <DropdownMenuItem onClick={() => toast.info("Export coming soon.")}>Export as PDF</DropdownMenuItem>
                        <DropdownMenuItem disabled={isExportingDocx} onClick={() => void handleExportDocx()}>
                          {isExportingDocx ? "Exporting DOCX..." : "Export as DOCX"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}

                  {!isClientReadOnly && (
                    <>
                      {isCreating ? (
                        <>
                          <Button className="bg-emerald-500 hover:bg-emerald-400 text-black" disabled={!canSaveMeeting || createMutation.isPending} onClick={saveMeeting}>
                            {createMutation.isPending ? "Creating..." : "Save Meeting"}
                          </Button>
                          <Button variant="outline" className="border-zinc-700" onClick={() => setIsCreating(false)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" className="border-zinc-700" onClick={() => setEditMeta((v) => !v)}>
                            <Pencil className="w-3.5 h-3.5 mr-1" /> {editMeta ? "Done" : "Edit Details"}
                          </Button>
                          <Button className="bg-emerald-500 hover:bg-emerald-400 text-black" disabled={!canSaveMeeting || !isMeetingDirty || updateMutation.isPending} onClick={saveMeeting}>
                            {updateMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-red-300 hover:text-red-200"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (!selectedMeetingId) return;
                              if (!window.confirm("Delete this meeting? This cannot be undone.")) return;
                              deleteMutation.mutate({ id: selectedMeetingId, tenantSlug, mode: meetingMode });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Notes */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-100">Meeting Notes</h3>
                  {!isClientReadOnly && !isCreating && (
                    <Button variant="outline" className="border-zinc-700" onClick={() => setEditNotes((v) => !v)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> {editNotes ? "Done" : "Edit Notes"}
                    </Button>
                  )}
                </div>

                {editNotes || isCreating ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isClientReadOnly}
                    className="w-full min-h-[220px] rounded-xl bg-zinc-900 border border-zinc-700 p-4 text-sm leading-7"
                    placeholder="Document the discussion, decisions, and recommendations."
                  />
                ) : (
                  <div className="min-h-[160px] rounded-xl bg-zinc-950/40 px-5 py-4 text-[15px] leading-8 text-zinc-300 whitespace-pre-wrap">
                    {notes?.trim() ? notes : "No meeting notes yet."}
                  </div>
                )}
              </section>

              {/* Action items */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-100">Next Steps</h3>
                  {!isClientReadOnly && !isCreating && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="border-zinc-700" onClick={() => setEditItems((v) => !v)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" /> {editItems ? "Done" : "Edit Items"}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-zinc-700"
                        onClick={() => {
                          setEditItems(true);
                          setItems((prev) => [...prev, { title: "", details: "", status: "open", dueDate: "" }]);
                        }}
                      >
                        + Add Action Item
                      </Button>
                    </div>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="rounded-xl bg-zinc-950/40 px-5 py-6 text-sm text-zinc-400">
                    No next steps have been assigned yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((it, idx) => (
                      <article key={it.id ?? `draft-${idx}`} className="rounded-xl bg-zinc-950/45 border border-zinc-800/80 p-4 space-y-3">
                        {editItems && !isClientReadOnly ? (
                          <>
                            <Input
                              value={it.title}
                              onChange={(e) => setItems((prev) => prev.map((row, i) => i === idx ? { ...row, title: e.target.value } : row))}
                              placeholder="Task title"
                              className="bg-zinc-900 border-zinc-700"
                            />
                            <Input
                              value={it.details}
                              onChange={(e) => setItems((prev) => prev.map((row, i) => i === idx ? { ...row, details: e.target.value } : row))}
                              placeholder="Details"
                              className="bg-zinc-900 border-zinc-700"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <Select
                                value={it.status}
                                onValueChange={(v) => setItems((prev) => prev.map((row, i) => i === idx ? { ...row, status: v as any } : row))}
                              >
                                <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                                <SelectContent>{ITEM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                              </Select>
                              <Input
                                type="date"
                                value={it.dueDate}
                                onChange={(e) => setItems((prev) => prev.map((row, i) => i === idx ? { ...row, dueDate: e.target.value } : row))}
                                className="bg-zinc-900 border-zinc-700"
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button variant="ghost" className="text-red-300 hover:text-red-200" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>Delete</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-semibold text-zinc-100">{it.title || "Untitled task"}</h4>
                              <div className="flex items-center gap-2">
                                {isClientReadOnly && selectedMeetingId ? (
                                  <Select
                                    value={it.status}
                                    onValueChange={(v) => {
                                      const nextStatus = v as "open" | "in_progress" | "completed";
                                      setItems((prev) => prev.map((row, i) => i === idx ? { ...row, status: nextStatus } : row));
                                      if (it.id) {
                                        updateItemStatusMutation.mutate({ id: it.id, status: nextStatus, tenantSlug, mode: meetingMode });
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-[150px] h-8 bg-zinc-900 border-zinc-700 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="open">🟡 Open</SelectItem>
                                      <SelectItem value="in_progress">🟠 In Progress</SelectItem>
                                      <SelectItem value="completed">🟢 Completed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant="outline" className="border-zinc-700 text-zinc-300">{it.status.replace("_", " ")}</Badge>
                                )}
                              </div>
                            </div>
                            {it.details ? <p className="text-sm text-zinc-400 leading-6">{it.details}</p> : null}
                            <p className="text-xs text-zinc-500">Due: {it.dueDate ? fmtDate(it.dueDate) : "No due date"}</p>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                {!isClientReadOnly && !isCreating && (
                  <Button
                    className="bg-emerald-500 hover:bg-emerald-400 text-black"
                    disabled={!selectedMeetingId || !isItemsDirty || upsertItemsMutation.isPending}
                    onClick={saveItems}
                  >
                    {upsertItemsMutation.isPending ? "Saving..." : "Save Action Items"}
                  </Button>
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
