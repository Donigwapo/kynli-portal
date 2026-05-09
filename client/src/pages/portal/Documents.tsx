import { useMemo, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FolderOpen,
  FileText,
  Upload,
  Download,
  ExternalLink,
  Trash2,
  CheckSquare,
  Square,
  Calendar,
  HardDrive,
  X,
  Image as ImageIcon,
  FileSpreadsheet,
  File,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const DOC_TYPES = ["All Types", "Financials", "Tax Returns", "W-2 / 1099", "Other"] as const;
type DocType = (typeof DOC_TYPES)[number];

const DOC_TYPE_COLORS: Record<string, string> = {
  Financials: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Tax Returns": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "W-2 / 1099": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Chat Attachment": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function getMimeCategory(mimeType?: string | null): "image" | "pdf" | "spreadsheet" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  ) return "spreadsheet";
  return "other";
}

function DocIcon({ mimeType }: { mimeType?: string | null }) {
  const cat = getMimeCategory(mimeType);
  if (cat === "image") return <ImageIcon className="w-5 h-5 text-cyan-400" />;
  if (cat === "spreadsheet") return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
  if (cat === "pdf") return <FileText className="w-5 h-5 text-red-400" />;
  return <File className="w-5 h-5 text-zinc-400" />;
}

function openButtonLabel(mimeType?: string | null): string {
  const cat = getMimeCategory(mimeType);
  if (cat === "image") return "Open Image";
  if (cat === "pdf") return "Open PDF";
  return "Open File";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateFileName(name: string, max = 22): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf(".");
  if (ext > 0) {
    const base = name.slice(0, ext);
    const extension = name.slice(ext);
    return base.slice(0, max - extension.length - 3) + "..." + extension;
  }
  return name.slice(0, max) + "...";
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
const MAX_UPLOAD_FILES = 10;

type UploadItemStatus = "pending" | "uploading" | "uploaded" | "failed";
type UploadItem = {
  id: string;
  file: File;
  status: UploadItemStatus;
  error?: string;
};

export default function Documents() {
  const { user } = useAuth();

  // Filters
  const [selectedType, setSelectedType] = useState<DocType>("All Types");
  const [selectedYear, setSelectedYear] = useState<string>("All Years");
  const [selectedMonth, setSelectedMonth] = useState<string>("All Months");

  // Upload dialog
  const [showUpload, setShowUpload] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadDocType, setUploadDocType] = useState("Financials");
  const [uploadYear, setUploadYear] = useState(String(CURRENT_YEAR));
  const [uploadMonth, setUploadMonth] = useState(String(CURRENT_MONTH));
  const [uploading, setUploading] = useState(false);
  const [uploadProgressIndex, setUploadProgressIndex] = useState(0);
  const [uploadTotalCount, setUploadTotalCount] = useState(0);
  const [selectedDocIds, setSelectedDocIds] = useState<Array<string | number>>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: docs = [], isLoading } = trpc.documents.list.useQuery({
    year: selectedYear !== "All Years" ? Number(selectedYear) : undefined,
    month: selectedMonth !== "All Months" ? Number(selectedMonth) : undefined,
    docType: selectedType !== "All Types" ? selectedType : undefined,
    tenantSlug: undefined, // resolved server-side from session
  });

  const uploadMutation = trpc.documents.upload.useMutation();

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      toast.success("Document deleted");
    },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  const bulkDeleteMutation = trpc.documents.bulkDelete.useMutation();

  function resetUploadForm() {
    setUploadItems([]);
    setUploadName("");
    setUploadDesc("");
    setUploadDocType("Financials");
    setUploadYear(String(CURRENT_YEAR));
    setUploadMonth(String(CURRENT_MONTH));
    setUploadProgressIndex(0);
    setUploadTotalCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openUploadDialog() {
    if (selectedType !== "All Types") {
      setUploadDocType(selectedType);
    } else {
      setUploadDocType("Financials");
    }
    setShowUpload(true);
  }

  function applySelectedFiles(files: File[]) {
    if (files.length === 0) return;
    if (files.length > MAX_UPLOAD_FILES) {
      toast.error(`You can upload up to ${MAX_UPLOAD_FILES} files at once. Keeping the first ${MAX_UPLOAD_FILES}.`);
    }

    const limited = files.slice(0, MAX_UPLOAD_FILES);
    const nextItems: UploadItem[] = limited.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}-${file.size}`,
      file,
      status: "pending",
    }));

    setUploadItems(nextItems);
    setUploadProgressIndex(0);
    setUploadTotalCount(0);

    if (nextItems.length === 1) {
      setUploadName((prev) => prev || nextItems[0].file.name.replace(/\.[^.]+$/, ""));
    } else {
      setUploadName("");
    }
  }

  function removeUploadFileAt(index: number) {
    setUploadItems((prev) => {
      const item = prev[index];
      if (!item) return prev;
      if (item.status === "uploading") return prev;

      const next = prev.filter((_, i) => i !== index);
      if (next.length !== 1) {
        setUploadName("");
      } else if (!uploadName) {
        setUploadName(next[0].file.name.replace(/\.[^.]+$/, ""));
      }
      return next;
    });
  }

  async function fileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  }

  const uploadFiles = uploadItems.map((item) => item.file);
  const uploadedCount = uploadItems.filter((item) => item.status === "uploaded").length;
  const failedCount = uploadItems.filter((item) => item.status === "failed").length;
  const pendingOrFailedCount = uploadItems.filter(
    (item) => item.status === "pending" || item.status === "failed",
  ).length;
  const effectiveTotal = uploadTotalCount > 0 ? uploadTotalCount : pendingOrFailedCount;
  const overallProgressText = uploading
    ? `Uploading ${Math.min(uploadProgressIndex, Math.max(1, effectiveTotal))} of ${Math.max(1, effectiveTotal)}...`
    : failedCount > 0
      ? `${uploadedCount} uploaded, ${failedCount} failed`
      : uploadedCount > 0
        ? `${uploadedCount} uploaded`
        : null;

  async function handleUpload() {
    if (uploadItems.length === 0) return;
    if (uploadItems.length === 1 && !uploadName.trim()) return;

    setUploading(true);

    let working = uploadItems.map((item) => ({ ...item }));

    try {
      const pendingIndexes = working
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.status === "pending" || item.status === "failed")
        .map(({ idx }) => idx);

      setUploadTotalCount(pendingIndexes.length);

      for (let step = 0; step < pendingIndexes.length; step++) {
        const index = pendingIndexes[step];
        const current = working[index];
        if (!current) continue;

        setUploadProgressIndex(step + 1);

        working[index] = { ...current, status: "uploading", error: undefined };
        setUploadItems([...working]);

        const file = working[index].file;

        try {
          const base64 = await fileToBase64(file);
          const derivedName = uploadItems.length === 1
            ? uploadName.trim()
            : file.name.replace(/\.[^.]+$/, "");

          await uploadMutation.mutateAsync({
            name: derivedName,
            description: uploadDesc.trim() || undefined,
            fileBase64: base64,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
            fileSize: file.size,
            docType: uploadDocType,
            year: Number(uploadYear),
            month: Number(uploadMonth),
          });

          working[index] = { ...working[index], status: "uploaded", error: undefined };
          setUploadItems([...working]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          working[index] = { ...working[index], status: "failed", error: message };
          setUploadItems([...working]);
          toast.error(`Failed: ${file.name} — ${message}`);
        }
      }

      await utils.documents.list.invalidate();

      const finalUploaded = working.filter((item) => item.status === "uploaded").length;
      const finalFailed = working.filter((item) => item.status === "failed").length;

      if (finalUploaded > 0 && finalFailed === 0) {
        toast.success(`${finalUploaded} document${finalUploaded === 1 ? "" : "s"} uploaded`);
        setShowUpload(false);
        resetUploadForm();
      } else if (finalUploaded > 0 && finalFailed > 0) {
        toast.success(`${finalUploaded} uploaded, ${finalFailed} failed`);
        setUploadItems(working.filter((item) => item.status !== "uploaded"));
        setUploadTotalCount(0);
      }
    } finally {
      setUploading(false);
      setUploadProgressIndex(0);
    }
  }

  const selectedCount = selectedDocIds.length;
  const selectedSet = useMemo(() => new Set(selectedDocIds.map((id) => String(id))), [selectedDocIds]);

  const toggleSelect = (id: string | number) => {
    const key = String(id);
    setSelectedDocIds((prev) => {
      const exists = prev.some((p) => String(p) === key);
      if (exists) return prev.filter((p) => String(p) !== key);
      return [...prev, id];
    });
  };

  const clearSelection = () => setSelectedDocIds([]);

  const selectableIds = docs.map((d) => d.id);
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(String(id)));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedDocIds((prev) => prev.filter((id) => !selectableIds.some((sid) => String(sid) === String(id))));
      return;
    }

    setSelectedDocIds((prev) => {
      const map = new Map(prev.map((id) => [String(id), id] as const));
      for (const id of selectableIds) map.set(String(id), id);
      return Array.from(map.values());
    });
  };

  async function handleBulkDeleteConfirm() {
    if (selectedDocIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteMutation.mutateAsync({ ids: selectedDocIds });
      await utils.documents.list.invalidate();
      clearSelection();
      setShowBulkDeleteConfirm(false);
      toast.success(`${result.deleted} document${result.deleted === 1 ? "" : "s"} deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk delete failed";
      toast.error(message);
    } finally {
      setBulkDeleting(false);
    }
  }

  // Group docs by year → month
  type DocRow = (typeof docs)[0];
  const docsByYearMonth = docs.reduce<Record<number, Record<number, DocRow[]>>>((acc, doc) => {
    const y = doc.year ?? 0;
    const m = doc.month ?? 0;
    if (!acc[y]) acc[y] = {};
    if (!acc[y][m]) acc[y][m] = [];
    acc[y][m].push(doc);
    return acc;
  }, {});

  const sortedYears = Object.keys(docsByYearMonth).map(Number).sort((a, b) => b - a);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-emerald-400" />
            Document Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial statements, tax documents, and reports — all in one place.
          </p>
        </div>
        <Button
          onClick={openUploadDialog}
          className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold gap-2"
        >
          <Upload className="w-4 h-4" />
          Add Document
        </Button>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckSquare className="w-4 h-4" />
            <span className="font-medium">{selectedCount} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700"
              onClick={clearSelection}
              disabled={bulkDeleting}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={bulkDeleting}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Type filter pills */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {DOC_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selectedType === type
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Year filter */}
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-36 bg-zinc-900 border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Years">All Years</SelectItem>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month filter */}
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Months">All Months</SelectItem>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Select all + Doc count */}
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-700"
          onClick={toggleSelectAllVisible}
          disabled={docs.length === 0}
        >
          {allVisibleSelected ? <CheckSquare className="w-4 h-4 mr-1.5" /> : <Square className="w-4 h-4 mr-1.5" />}
          {allVisibleSelected ? "Unselect All" : "Select All"}
        </Button>

        <span className="ml-auto text-sm text-muted-foreground">
          {docs.length} document{docs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading documents...</div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 py-20 text-center text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No documents found.</p>
          <p className="text-sm mt-1">
            {selectedType !== "All Types" || selectedYear !== "All Years" || selectedMonth !== "All Months"
              ? "Try adjusting the filters or add a new document."
              : "Click 'Add Document' to upload the first one."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedYears.map((year) => {
            const monthsInYear = Object.keys(docsByYearMonth[year]).map(Number).sort((a, b) => b - a);
            const totalInYear = monthsInYear.reduce((s, m) => s + docsByYearMonth[year][m].length, 0);
            return (
              <div key={year}>
                {/* Year group header */}
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-foreground">{year}</span>
                  <span className="text-sm text-muted-foreground">
                    — {totalInYear} document{totalInYear !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Month sub-groups */}
                <div className="space-y-6">
                  {monthsInYear.map((month) => (
                    <div key={month}>
                      {/* Month header */}
                      <div className="flex items-center gap-2 mb-3 pl-1">
                        <span className="text-sm font-medium text-emerald-400/80">
                          {month === 0 ? "No Month" : MONTH_NAMES[month - 1]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {docsByYearMonth[year][month].length} doc
                          {docsByYearMonth[year][month].length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Document cards grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {docsByYearMonth[year][month].map((doc) => {
                          const isSelected = selectedSet.has(String(doc.id));
                          return (
                          <div
                            key={doc.id}
                            className={`bg-zinc-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
                              isSelected
                                ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
                                : "border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            {/* Image thumbnail (for image MIME types) */}
                            {getMimeCategory(doc.mime_type) === "image" && doc.file_url && (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block -mx-4 -mt-4 mb-0 rounded-t-xl overflow-hidden border-b border-zinc-800"
                              >
                                <img
                                  src={doc.file_url}
                                  alt={doc.name}
                                  className="w-full h-32 object-cover hover:opacity-90 transition-opacity"
                                />
                              </a>
                            )}

                            {/* Card top: select + icon + type badge */}
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleSelect(doc.id)}
                                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                                    : "border-zinc-600 text-zinc-500 hover:border-zinc-400"
                                }`}
                                aria-label={isSelected ? "Deselect document" : "Select document"}
                              >
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              </button>

                              <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                                <DocIcon mimeType={doc.mime_type} />
                              </div>
                              <Badge
                                variant="outline"
                                className={`ml-auto text-xs font-medium ${
                                  DOC_TYPE_COLORS[doc.doc_type ?? "Other"] ?? DOC_TYPE_COLORS.Other
                                }`}
                              >
                                {doc.doc_type}
                              </Badge>
                            </div>

                            {/* Name + description */}
                            <div>
                              <h3 className="font-semibold text-sm leading-snug">{doc.name}</h3>
                              {doc.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {doc.description}
                                </p>
                              )}
                            </div>

                            {/* Meta row */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-zinc-800 pt-2">
                              <Calendar className="w-3 h-3 shrink-0" />
                              <span>
                                {month > 0 ? `${MONTH_NAMES[month - 1].slice(0, 3)} ` : ""}{year}
                              </span>
                              {doc.file_size != null && doc.file_size > 0 && (
                                <>
                                  <span className="text-zinc-700">·</span>
                                  <HardDrive className="w-3 h-3 shrink-0" />
                                  <span>{formatBytes(doc.file_size)}</span>
                                </>
                              )}
                              {doc.file_name && (
                                <>
                                  <span className="text-zinc-700">·</span>
                                  <span className="truncate">{truncateFileName(doc.file_name)}</span>
                                </>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 gap-1.5 text-xs"
                                disabled={!doc.file_url}
                                onClick={() => {
                                  if (!doc.file_url) return;
                                  window.open(doc.file_url, "_blank");
                                }}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {openButtonLabel(doc.mime_type)}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="px-2.5 border-zinc-700 hover:bg-zinc-800"
                                disabled={!doc.file_url}
                                onClick={() => {
                                  if (!doc.file_url) return;
                                  const a = document.createElement("a");
                                  a.href = doc.file_url;
                                  a.download = doc.file_name || doc.name;
                                  a.click();
                                }}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="px-2.5 border-zinc-700 hover:bg-red-900/30 hover:text-red-400 hover:border-red-500/30"
                                onClick={() => {
                                  if (confirm(`Delete "${doc.name}"?`)) {
                                    deleteMutation.mutate({ id: doc.id });
                                    setSelectedDocIds((prev) => prev.filter((id) => String(id) !== String(doc.id)));
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Delete Confirm Dialog */}
      <Dialog
        open={showBulkDeleteConfirm}
        onOpenChange={(open) => {
          if (!bulkDeleting) setShowBulkDeleteConfirm(open);
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-300">
              <Trash2 className="w-4 h-4" />
              Delete Selected Documents
            </DialogTitle>
          </DialogHeader>

          <div className="text-sm text-muted-foreground py-1">
            Are you sure you want to delete the selected documents?
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteConfirm(false)}
              className="border-zinc-700"
              disabled={bulkDeleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkDeleteConfirm}
              disabled={bulkDeleting || selectedCount === 0}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold"
            >
              {bulkDeleting ? "Deleting..." : `Delete ${selectedCount}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={(open) => {
        if (!uploading) {
          setShowUpload(open);
          if (!open) resetUploadForm();
        }
      }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-400" />
              Add Document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File picker */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Files</Label>
              <div
                className="border-2 border-dashed border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-emerald-500/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFiles.length > 0 ? (
                  <div className="space-y-2 text-left">
                    <div className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>{uploadFiles.length} selected (max {MAX_UPLOAD_FILES})</span>
                      {overallProgressText && <span className="text-zinc-400">{overallProgressText}</span>}
                    </div>
                    <div className="max-h-40 overflow-auto space-y-1 pr-1">
                      {uploadItems.map((item, idx) => {
                        const f = item.file;
                        const statusIcon = item.status === "uploading"
                          ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                          : item.status === "uploaded"
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            : item.status === "failed"
                              ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                              : <Clock3 className="w-3.5 h-3.5 text-zinc-400" />;

                        const statusLabel = item.status === "uploading"
                          ? "Uploading"
                          : item.status === "uploaded"
                            ? "Uploaded"
                            : item.status === "failed"
                              ? "Failed"
                              : "Pending";

                        return (
                          <div key={item.id} className="rounded-md bg-zinc-900/70 border border-zinc-800 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="truncate text-sm">{f.name}</span>
                                <span className="text-muted-foreground text-xs shrink-0">({formatBytes(f.size)})</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300 bg-zinc-950/70">
                                  {statusIcon}
                                  {statusLabel}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeUploadFileAt(idx);
                                  }}
                                  disabled={item.status === "uploading"}
                                  className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                  aria-label={`Remove ${f.name}`}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            {item.status === "failed" && item.error && (
                              <div className="mt-1 text-[11px] text-red-300/90 pl-6 truncate">
                                {item.error}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    Click to select up to {MAX_UPLOAD_FILES} files
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.xlsx,.xls,.docx,.doc,.csv,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  applySelectedFiles(files);
                }}
              />
            </div>

            {/* Document name (single-file only) */}
            {uploadFiles.length <= 1 && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Document Name</Label>
                <Input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. KynLi Q1 2026 Financials"
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
            )}

            {uploadFiles.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Multiple files selected: each document will use its original file name.
              </p>
            )}

            {/* Description */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Description <span className="opacity-50">(optional)</span>
              </Label>
              <Textarea
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="Brief description of this document..."
                className="bg-zinc-900 border-zinc-700 resize-none h-20"
              />
            </div>

            {/* Type row */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
              <Select value={uploadDocType} onValueChange={setUploadDocType}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.filter((t) => t !== "All Types").map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year + Month row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Year</Label>
                <Select value={uploadYear} onValueChange={setUploadYear}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEAR_OPTIONS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Month</Label>
                <Select value={uploadMonth} onValueChange={setUploadMonth}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUpload(false)}
              className="border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={
                uploadFiles.length === 0 ||
                (uploadFiles.length === 1 && !uploadName.trim()) ||
                uploading
              }
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            >
              {uploading
                ? `Uploading ${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"}...`
                : `Upload ${uploadFiles.length > 0 ? uploadFiles.length : ""}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
