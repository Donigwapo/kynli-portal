import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import {
  Clock, Zap, BarChart2, Lightbulb, Plus, Upload, Download,
  X, Check, UserPlus, Trash2, ChevronDown,
} from "lucide-react";

type TimeLog = {
  id: number; year: number; month: number;
  logDate: string | null; teamMember: string | null;
  taskCategory: string | null; focusArea: string;
  hours: string; minutes: number | null;
  notes: string | null; createdAt?: Date | null;
};
type TeamMember = { id: number; tenantId: number; name: string; createdAt?: Date | null };
type FocusArea = { id: number; tenantId: number; label: string; createdAt?: Date | null };

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const AMBER = "oklch(0.78 0.16 60)";
const MUTED_FG = "oklch(0.50 0.008 240)";
const CHART_COLORS = [
  "oklch(0.75 0.15 192)","oklch(0.68 0.18 145)","oklch(0.78 0.16 60)",
  "oklch(0.65 0.20 310)","oklch(0.62 0.22 25)","oklch(0.72 0.14 240)",
];

function isStrategic(area: string): boolean {
  const strategic = ["strategy","planning","vision","leadership","growth","business dev","client","sales","marketing","product","innovation","consulting"];
  return strategic.some(k => area.toLowerCase().includes(k));
}

function totalDecimalHours(hours: string | number, minutes: number | null): number {
  return parseFloat(String(hours)) + (minutes ?? 0) / 60;
}

// ─── Add Entry Modal ──────────────────────────────────────────────────────────
function AddEntryModal({
  onClose, onSave, teamMembers, focusAreas,
}: {
  onClose: () => void;
  onSave: (data: {
    logDate: string; teamMember: string; taskCategory: string;
    focusArea: string; hours: number; minutes: number; delegationNote: string;
    year: number; month: number;
  }) => void;
  teamMembers: TeamMember[];
  focusAreas: FocusArea[];
}) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [logDate, setLogDate] = useState(defaultDate);
  const [teamMember, setTeamMember] = useState(teamMembers[0]?.name ?? "");
  const [taskCategory, setTaskCategory] = useState("");
  const [focusArea, setFocusArea] = useState(focusAreas[0]?.label ?? "");
  const [showAddFocus, setShowAddFocus] = useState(false);
  const [newFocusLabel, setNewFocusLabel] = useState("");
  const addFocusMutation = trpc.time.addFocusArea.useMutation();
  const utils = trpc.useUtils();

  const handleAddFocus = () => {
    if (!newFocusLabel.trim()) return;
    addFocusMutation.mutate(
      { label: newFocusLabel.trim() },
      {
        onSuccess: () => {
          utils.time.getFocusAreas.invalidate();
          setFocusArea(newFocusLabel.trim());
          setNewFocusLabel("");
          setShowAddFocus(false);
        },
      }
    );
  };

  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [delegationNote, setDelegationNote] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);

  const addMemberMutation = trpc.time.addTeamMember.useMutation();
  function handleAddMember() {
    if (!newMemberName.trim()) return;
    addMemberMutation.mutate(
      { name: newMemberName.trim() },
      {
        onSuccess: () => {
          utils.time.getTeamMembers.invalidate();
          setTeamMember(newMemberName.trim());
          setNewMemberName("");
          setShowAddMember(false);
        },
      }
    );
  }

  function handleSave() {
    const d = new Date(logDate);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    onSave({ logDate, teamMember, taskCategory, focusArea, hours, minutes, delegationNote, year, month });
  }

  const inputCls = "w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground";
  const labelCls = "block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111111] border border-[#222] rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#222]">
          <h2 className="text-lg font-bold text-foreground">Add Time Entry</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Date */}
          <div>
            <label className={labelCls}>Date</label>
            <input
              type="date"
              value={logDate}
              onChange={e => setLogDate(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Team Member */}
          <div>
            <label className={labelCls}>Team Member</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={teamMember}
                  onChange={e => setTeamMember(e.target.value)}
                  className={`${inputCls} appearance-none pr-8`}
                >
                  {teamMembers.length === 0 && (
                    <option value="">— No members yet —</option>
                  )}
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <button
                onClick={() => setShowAddMember(v => !v)}
                className="px-3 py-2 rounded-xl border border-[#2a2a2a] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                title="Add new team member"
              >
                <UserPlus size={16} />
              </button>
            </div>
            {showAddMember && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  placeholder="Enter name..."
                  className={`${inputCls} flex-1`}
                  onKeyDown={e => e.key === "Enter" && handleAddMember()}
                />
                <button
                  onClick={handleAddMember}
                  disabled={addMemberMutation.isPending}
                  className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {addMemberMutation.isPending ? "…" : "Add"}
                </button>
              </div>
            )}
          </div>

          {/* Task Category */}
          <div>
            <label className={labelCls}>Task Category</label>
            <input
              type="text"
              value={taskCategory}
              onChange={e => setTaskCategory(e.target.value)}
              placeholder="e.g. Sales Activities"
              className={inputCls}
            />
          </div>

          {/* Focus Area */}
          <div>
            <label className={labelCls}>Focus Area</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={focusArea}
                  onChange={e => setFocusArea(e.target.value)}
                  className={`${inputCls} appearance-none pr-8`}
                >
                  {focusAreas.length === 0 && <option value="">— No focus areas yet —</option>}
                  {focusAreas.map(a => <option key={a.id} value={a.label}>{a.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <button
                onClick={() => setShowAddFocus(v => !v)}
                className="px-3 py-2 rounded-xl border border-[#2a2a2a] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                title="Add new focus area"
              >
                <Plus size={16} />
              </button>
            </div>
            {showAddFocus && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newFocusLabel}
                  onChange={e => setNewFocusLabel(e.target.value)}
                  placeholder="e.g. Product Development"
                  className={`${inputCls} flex-1`}
                  onKeyDown={e => e.key === "Enter" && handleAddFocus()}
                />
                <button
                  onClick={handleAddFocus}
                  disabled={addFocusMutation.isPending}
                  className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {addFocusMutation.isPending ? "…" : "Add"}
                </button>
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className={labelCls}>Duration</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  min={0}
                  value={hours}
                  onChange={e => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className={inputCls}
                />
                <p className="text-xs text-muted-foreground text-center mt-1.5">Hours</p>
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={e => setMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className={inputCls}
                />
                <p className="text-xs text-muted-foreground text-center mt-1.5">Minutes</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (Optional)</label>
            <textarea
              value={delegationNote}
              onChange={e => setDelegationNote(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Delegation notes, context..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#222]">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-[#2a2a2a] text-sm font-semibold text-foreground hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={hours === 0 && minutes === 0}
            className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            style={{ backgroundColor: TEAL, color: "#000" }}
          >
            <Check size={16} />
            Add Entry
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Team Members Manager Modal ───────────────────────────────────────────────
function TeamMembersModal({
  onClose, teamMembers,
}: {
  onClose: () => void;
  teamMembers: TeamMember[];
}) {
  const [newName, setNewName] = useState("");
  const addMutation = trpc.time.addTeamMember.useMutation();
  const deleteMutation = trpc.time.deleteTeamMember.useMutation();
  const utils = trpc.useUtils();

  function handleAdd() {
    if (!newName.trim()) return;
    addMutation.mutate(
      { name: newName.trim() },
      { onSuccess: () => { utils.time.getTeamMembers.invalidate(); setNewName(""); } }
    );
  }

  function handleDelete(id: number) {
    deleteMutation.mutate(
      { id },
      { onSuccess: () => utils.time.getTeamMembers.invalidate() }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111111] border border-[#222] rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#222]">
          <h2 className="text-base font-bold text-foreground">Manage Team Members</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Add team member name..."
              className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={addMutation.isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: TEAL, color: "#000" }}
            >
              {addMutation.isPending ? "…" : "Add"}
            </button>
          </div>
          {teamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No team members yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {teamMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5">
                  <span className="text-sm text-foreground">{m.name}</span>
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deleteMutation.isPending}
                    className="text-muted-foreground hover:text-red-400 p-1 rounded disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#222]">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-[#2a2a2a] text-sm font-semibold text-foreground hover:bg-white/5"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TimeIntelligence() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const { data: logs = [], isLoading, refetch } = trpc.time.get.useQuery(
    { year, month },
    { staleTime: 30_000 }
  );

  const { data: teamMembers = [], refetch: refetchMembers } = trpc.time.getTeamMembers.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const { data: focusAreas = [] } = trpc.time.getFocusAreas.useQuery(
    undefined,
    { staleTime: 60_000 }
  );

  const addMutation = trpc.time.add.useMutation({ onSuccess: () => refetch() });
  const addBulkMutation = trpc.time.addBulk.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.time.deleteEntry.useMutation({ onSuccess: () => refetch() });

  // Computed stats
  const totalHours = useMemo(() =>
    (logs as TimeLog[]).reduce((s, l) => s + totalDecimalHours(l.hours, l.minutes), 0), [logs]);
  const strategicHours = useMemo(() =>
    (logs as TimeLog[]).filter(l => isStrategic(l.focusArea))
      .reduce((s, l) => s + totalDecimalHours(l.hours, l.minutes), 0), [logs]);
  const operationalHours = totalHours - strategicHours;
  const strategicPct = totalHours > 0 ? (strategicHours / totalHours) * 100 : 0;
  const operationalPct = totalHours > 0 ? (operationalHours / totalHours) * 100 : 0;
  const delegationItems = (logs as TimeLog[]).filter(l => l.notes);

  const radarData = (logs as TimeLog[]).slice(0, 8).map(l => ({
    area: l.focusArea.length > 14 ? l.focusArea.slice(0, 14) + "…" : l.focusArea,
    hours: totalDecimalHours(l.hours, l.minutes),
  }));

  const sortedLogs = [...(logs as TimeLog[])].sort((a, b) =>
    totalDecimalHours(b.hours, b.minutes) - totalDecimalHours(a.hours, a.minutes));

  // ─── Add Entry handler ────────────────────────────────────────────────────
  function handleAddEntry(data: {
    logDate: string; teamMember: string; taskCategory: string;
    focusArea: string; hours: number; minutes: number; delegationNote: string;
    year: number; month: number;
  }) {
    addMutation.mutate({
      year: data.year, month: data.month,
      logDate: data.logDate,
      teamMember: data.teamMember || null,
      taskCategory: data.taskCategory || null,
      focusArea: data.focusArea,
      hours: data.hours,
      minutes: data.minutes,
      delegationNote: data.delegationNote || null,
    });
    setShowAddModal(false);
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────
  function handleExport() {
    const header = "Date,Team Member,Task Category,Focus Area,Hours,Minutes,Notes";
    const rows = (logs as TimeLog[]).map(l => [
      l.logDate ?? `${l.year}-${String(l.month).padStart(2, "0")}-01`,
      l.teamMember ?? "",
      l.taskCategory ?? "",
      l.focusArea,
      l.hours,
      l.minutes ?? 0,
      (l.notes ?? "").replace(/,/g, ";"),
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time_logs_${year}_${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Import CSV ───────────────────────────────────────────────────────────
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(Boolean);
      const header = lines[0].toLowerCase();
      const cols = header.split(",").map(c => c.trim().replace(/"/g, ""));
      const idx = (name: string) => cols.findIndex(c => c.includes(name));
      const iDate = idx("date");
      const iMember = idx("member");
      const iCategory = idx("category");
      const iFocus = idx("focus");
      const iHours = idx("hour");
      const iMinutes = idx("minute");
      const iNote = idx("note");

      const entries = lines.slice(1).map(line => {
        const parts = line.split(",").map(p => p.trim().replace(/^"|"$/g, ""));
        const dateStr = iDate >= 0 ? parts[iDate] : "";
        const d = dateStr ? new Date(dateStr) : new Date();
        const yr = isNaN(d.getTime()) ? year : d.getFullYear();
        const mo = isNaN(d.getTime()) ? month : d.getMonth() + 1;
        return {
          year: yr, month: mo,
          logDate: dateStr || null,
          teamMember: iMember >= 0 ? parts[iMember] || null : null,
          taskCategory: iCategory >= 0 ? parts[iCategory] || null : null,
          focusArea: iFocus >= 0 ? parts[iFocus] || "Other" : "Other",
          hours: iHours >= 0 ? parseFloat(parts[iHours]) || 0 : 0,
          minutes: iMinutes >= 0 ? parseInt(parts[iMinutes]) || null : null,
          delegationNote: iNote >= 0 ? parts[iNote] || null : null,
        };
      }).filter(e => e.focusArea && (e.hours > 0 || (e.minutes ?? 0) > 0));

      if (entries.length > 0) {
        addBulkMutation.mutate({ entries });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Time Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {MONTHS_LONG[month - 1]} {year} — time allocation analysis
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Month / Year selectors */}
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {MONTHS_SHORT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
              title="Export CSV"
            >
              <Download size={14} />
              Export
            </button>

            {/* Import */}
            <input
              ref={importRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={() => importRef.current?.click()}
              disabled={addBulkMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-50"
              title="Import CSV"
            >
              <Upload size={14} />
              {addBulkMutation.isPending ? "Importing…" : "Import"}
            </button>

            {/* Add Entry */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={{ backgroundColor: TEAL, color: "#000" }}
            >
              <Plus size={14} />
              Add Entry
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Clock size={36} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No time logs for this period</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use "Add Entry" to log time, or import a CSV file.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: TEAL, color: "#000" }}
            >
              <Plus size={14} /> Add Entry
            </button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Hours", value: `${totalHours.toFixed(1)}h`, sub: "this month", color: TEAL, icon: <Clock size={16} /> },
                { label: "Strategic", value: `${strategicHours.toFixed(1)}h`, sub: `${strategicPct.toFixed(1)}% of total`, color: GREEN, icon: <Zap size={16} /> },
                { label: "Operational", value: `${operationalHours.toFixed(1)}h`, sub: `${operationalPct.toFixed(1)}% of total`, color: AMBER, icon: <BarChart2 size={16} /> },
                { label: "Focus Areas", value: String(logs.length), sub: `${delegationItems.length} delegation flags`, color: MUTED_FG, icon: <Lightbulb size={16} /> },
              ].map(card => (
                <div key={card.label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
                    <span className="text-muted-foreground">{card.icon}</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Strategic vs Operational Split */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Strategic vs Operational Split</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-foreground">Strategic</span>
                    <span className="font-medium" style={{ color: GREEN }}>{strategicHours.toFixed(1)}h ({strategicPct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-3 rounded-full" style={{ width: `${strategicPct}%`, backgroundColor: GREEN }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-foreground">Operational</span>
                    <span className="font-medium" style={{ color: AMBER }}>{operationalHours.toFixed(1)}h ({operationalPct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-3 rounded-full" style={{ width: `${operationalPct}%`, backgroundColor: AMBER }} />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Target: 60%+ strategic time. {strategicPct >= 60
                  ? "You're on track."
                  : `${(60 - strategicPct).toFixed(1)}% more strategic time needed.`}
              </p>
            </div>

            {/* Radar + Focus Area Table */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Focus Area Distribution</h2>
                {radarData.length < 3 ? (
                  <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                    Not enough data for radar chart (need 3+ areas)
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="area" tick={{ fill: MUTED_FG, fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, Math.max(...radarData.map(d => d.hours))]}
                        tick={{ fill: MUTED_FG, fontSize: 9 }} />
                      <Radar name="Hours" dataKey="hours" stroke={TEAL} fill={TEAL} fillOpacity={0.2} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                        formatter={(v: number) => [`${v.toFixed(1)}h`]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">Hours by Focus Area</h2>
                </div>
                <div className="divide-y divide-border">
                  {sortedLogs.map((log, i) => {
                    const h = totalDecimalHours(log.hours, log.minutes);
                    const pct = totalHours > 0 ? (h / totalHours) * 100 : 0;
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    return (
                      <div key={log.id} className="px-5 py-3 group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <div className="min-w-0">
                              <span className="text-xs text-foreground block truncate">{log.focusArea}</span>
                              {(log.teamMember || log.taskCategory) && (
                                <span className="text-xs text-muted-foreground">
                                  {[log.teamMember, log.taskCategory].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold" style={{ color }}>
                              {h.toFixed(1)}h
                              <span className="text-muted-foreground font-normal ml-1.5">{pct.toFixed(0)}%</span>
                            </span>
                            <button
                              onClick={() => deleteMutation.mutate({ id: log.id })}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 p-0.5 rounded transition-opacity"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Delegation / Notes */}
            {delegationItems.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
                  <Lightbulb size={14} style={{ color: AMBER }} />
                  <h2 className="text-sm font-semibold text-foreground">Delegation Suggestions</h2>
                </div>
                <div className="divide-y divide-border">
                  {delegationItems.map(log => (
                    <div key={log.id} className="px-5 py-4">
                      <p className="text-sm font-medium text-foreground">{log.focusArea}</p>
                      {log.teamMember && <p className="text-xs text-muted-foreground mt-0.5">{log.teamMember}</p>}
                      <p className="text-xs mt-1" style={{ color: AMBER }}>{log.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Team Members quick manage link */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowTeamModal(true)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <UserPlus size={12} />
            Manage Team Members
          </button>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddEntryModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddEntry}
          teamMembers={teamMembers as TeamMember[]}
          focusAreas={focusAreas as FocusArea[]}
        />
      )}
      {showTeamModal && (
        <TeamMembersModal
          onClose={() => { setShowTeamModal(false); refetchMembers(); }}
          teamMembers={teamMembers as TeamMember[]}
        />
      )}
    </>
  );
}
