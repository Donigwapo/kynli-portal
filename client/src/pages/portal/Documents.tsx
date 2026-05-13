import { useMemo, useState, useRef, useEffect, useCallback, memo, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
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
  MoveRight,
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
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

const DOC_TYPES = ["All Types", "Financials", "Tax Returns", "W-2 / 1099", "Other"] as const;
type DocType = (typeof DOC_TYPES)[number];
const CATEGORY_TYPES = ["Financials", "Tax Returns", "W-2 / 1099", "Other"] as const;
type CategoryType = (typeof CATEGORY_TYPES)[number];

const DOC_TYPE_COLORS: Record<string, string> = {
  Financials: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Tax Returns": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "W-2 / 1099": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Chat Attachment": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function normalizeDocTypeForCategory(value?: string | null): CategoryType {
  if (!value) return "Other";
  const v = String(value).trim().toLowerCase();
  if (v === "financials") return "Financials";
  if (v === "tax returns" || v.includes("tax")) return "Tax Returns";
  if (v === "w-2 / 1099" || v.includes("w-2") || v.includes("1099") || v === "w2") return "W-2 / 1099";
  return "Other";
}

function docTypeFromCategory(category: CategoryType): string {
  return category;
}

function getMimeCategory(mimeType?: string | null): "image" | "pdf" | "spreadsheet" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "spreadsheet";
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

type DocRow = {
  id: string | number;
  name: string;
  description?: string | null;
  doc_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  file_key?: string | null;
  updated_at?: string | null;
  year?: number | null;
  month?: number | null;
};

const CategoryDropZone = memo(function CategoryDropZone({
  category,
  selectedType,
  count,
  onSelect,
  isOver,
  pulse,
}: {
  category: CategoryType | "All Types";
  selectedType: DocType;
  count: number;
  onSelect: (value: DocType) => void;
  isOver?: boolean;
  pulse?: boolean;
}) {
  const isActive = selectedType === category;
  const isAll = category === "All Types";

  const handleClick = useCallback(() => onSelect(category as DocType), [onSelect, category]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ease-out flex items-center gap-2 ${
        isActive
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
          : "bg-zinc-900 text-muted-foreground border-zinc-800 hover:text-foreground"
      } ${isOver ? "ring-2 ring-emerald-300/35 border-emerald-400/50 shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_8px_24px_rgba(16,185,129,0.12)] -translate-y-0.5" : ""} ${pulse ? "ring-2 ring-emerald-400/25 shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_6px_16px_rgba(16,185,129,0.08)]" : ""}`}
    >
      {!isAll && <MoveRight className="w-3.5 h-3.5 opacity-70" />}
      <span>{category}</span>
      <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700">
        {count}
      </span>
    </button>
  );
});

const DroppableCategory = memo(function DroppableCategory({
  category,
  selectedType,
  count,
  onSelect,
  pulse,
}: {
  category: CategoryType;
  selectedType: DocType;
  count: number;
  onSelect: (value: DocType) => void;
  pulse?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `cat:${category}` });

  return (
    <div ref={setNodeRef}>
      <CategoryDropZone
        category={category}
        selectedType={selectedType}
        count={count}
        onSelect={onSelect}
        isOver={isOver}
        pulse={pulse}
      />
    </div>
  );
});

const DraggableDocCard = memo(function DraggableDocCard({ id, children }: { id: string | number; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `doc:${String(id)}`,
  });

  const transformStyle = useMemo(() => ({
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }), [transform, isDragging]);

  return (
    <div ref={setNodeRef} style={transformStyle} {...listeners} {...attributes} className="transition-transform duration-150 will-change-transform">
      {children}
    </div>
  );
});

export default function Documents() {
  const { impersonatingTenantSlug } = usePortal();
  const [selectedType, setSelectedType] = useState<DocType>("All Types");
  const [selectedYear, setSelectedYear] = useState<string>("All Years");
  const [selectedMonth, setSelectedMonth] = useState<string>("All Months");

  const [showUpload, setShowUpload] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadDocType, setUploadDocType] = useState<CategoryType>("Financials");
  const [uploadYear, setUploadYear] = useState(String(CURRENT_YEAR));
  const [uploadMonth, setUploadMonth] = useState(String(CURRENT_MONTH));
  const [uploading, setUploading] = useState(false);
  const [uploadProgressIndex, setUploadProgressIndex] = useState(0);
  const [uploadTotalCount, setUploadTotalCount] = useState(0);

  const [selectedDocIds, setSelectedDocIds] = useState<Array<string | number>>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [localDocs, setLocalDocs] = useState<DocRow[]>([]);
  const [activeDragDocId, setActiveDragDocId] = useState<string | number | null>(null);
  const [pulsedCategory, setPulsedCategory] = useState<CategoryType | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: docs = [], isLoading } = trpc.documents.list.useQuery({
    year: selectedYear !== "All Years" ? Number(selectedYear) : undefined,
    month: selectedMonth !== "All Months" ? Number(selectedMonth) : undefined,
    tenantSlug: impersonatingTenantSlug ?? undefined,
  });

  const uploadMutation = trpc.documents.upload.useMutation();
  const updateTypeMutation = trpc.documents.updateType.useMutation();

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      void utils.documents.list.invalidate();
      toast.success("Document deleted");
    },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  const bulkDeleteMutation = trpc.documents.bulkDelete.useMutation();

  useEffect(() => {
    const next = ((docs as DocRow[]) || []).map((d) => ({ ...d }));

    setLocalDocs((prev) => {
      if (prev.length !== next.length) return next;

      for (let i = 0; i < prev.length; i++) {
        const a = prev[i];
        const b = next[i];
        if (
          String(a.id) !== String(b.id) ||
          a.doc_type !== b.doc_type ||
          a.name !== b.name ||
          a.file_key !== b.file_key ||
          a.file_url !== b.file_url ||
          a.updated_at !== b.updated_at
        ) {
          return next;
        }
      }

      return prev;
    });
  }, [docs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

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
    setUploadDocType(selectedType === "All Types" ? "Financials" : (selectedType as CategoryType));
    setShowUpload(true);
  }

  function applySelectedFiles(files: File[]) {
    if (!files.length) return;
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
    setUploadName(nextItems.length === 1 ? nextItems[0].file.name.replace(/\.[^.]+$/, "") : "");
  }

  function removeUploadFileAt(index: number) {
    setUploadItems((prev) => {
      const item = prev[index];
      if (!item || item.status === "uploading") return prev;
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 1 && !uploadName) setUploadName(next[0].file.name.replace(/\.[^.]+$/, ""));
      if (next.length !== 1) setUploadName("");
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

  async function handleUpload() {
    if (!uploadItems.length) return;
    if (uploadItems.length === 1 && !uploadName.trim()) return;

    setUploading(true);
    const working = uploadItems.map((i) => ({ ...i }));

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
          const derivedName = uploadItems.length === 1 ? uploadName.trim() : file.name.replace(/\.[^.]+$/, "");

          await uploadMutation.mutateAsync({
            name: derivedName,
            description: uploadDesc.trim() || undefined,
            fileBase64: base64,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
            fileSize: file.size,
            docType: docTypeFromCategory(uploadDocType),
            year: Number(uploadYear),
            month: Number(uploadMonth),
            tenantSlug: impersonatingTenantSlug ?? undefined,
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

  const normalizedDocTypeById = useMemo(() => {
    const map = new Map<string, CategoryType>();
    for (const doc of localDocs) {
      map.set(String(doc.id), normalizeDocTypeForCategory(doc.doc_type));
    }
    return map;
  }, [localDocs]);

  const docsForFilter = useMemo(() => {
    if (selectedType === "All Types") return localDocs;
    return localDocs.filter((doc) => normalizedDocTypeById.get(String(doc.id)) === selectedType);
  }, [localDocs, selectedType, normalizedDocTypeById]);

  // filter debug log removed for production

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryType, number> = {
      Financials: 0,
      "Tax Returns": 0,
      "W-2 / 1099": 0,
      Other: 0,
    };
    for (const d of localDocs) {
      const normalized = normalizedDocTypeById.get(String(d.id)) ?? "Other";
      counts[normalized] += 1;
    }
    return counts;
  }, [localDocs, normalizedDocTypeById]);

  const selectedSet = useMemo(() => new Set(selectedDocIds.map((id) => String(id))), [selectedDocIds]);
  const selectableIds = docsForFilter.map((d) => d.id);
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(String(id)));

  const toggleSelect = useCallback((id: string | number) => {
    const key = String(id);
    setSelectedDocIds((prev) => {
      const exists = prev.some((p) => String(p) === key);
      if (exists) return prev.filter((p) => String(p) !== key);
      return [...prev, id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedDocIds([]), []);

  const toggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedDocIds((prev) => prev.filter((id) => !selectableIds.some((sid) => String(sid) === String(id))));
      return;
    }
    setSelectedDocIds((prev) => {
      const map = new Map(prev.map((id) => [String(id), id] as const));
      for (const id of selectableIds) map.set(String(id), id);
      return Array.from(map.values());
    });
  }, [allVisibleSelected, selectableIds]);

  async function handleBulkDeleteConfirm() {
    if (!selectedDocIds.length) return;
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

  const handleCategoryDrop = useCallback(async (documentId: string | number, category: CategoryType) => {
    const doc = localDocs.find((d) => String(d.id) === String(documentId));
    if (!doc) return;

    const previousType = normalizeDocTypeForCategory(doc.doc_type);
    const newType = category;
    if (previousType === newType) return;


    setLocalDocs((prev) =>
      prev.map((d) => (String(d.id) === String(documentId) ? { ...d, doc_type: docTypeFromCategory(newType) } : d)),
    );

    try {
      await updateTypeMutation.mutateAsync({ id: documentId, docType: docTypeFromCategory(newType) as any });
      setPulsedCategory(newType);
      setTimeout(() => setPulsedCategory(null), 260);
      toast.success(`Moved to ${newType}`);
      await utils.documents.list.invalidate();
    } catch (error) {
      setLocalDocs((prev) =>
        prev.map((d) => (String(d.id) === String(documentId) ? { ...d, doc_type: docTypeFromCategory(previousType) } : d)),
      );
      const message = error instanceof Error ? error.message : "Failed to move document";
      toast.error(message);
    }
  }, [localDocs, updateTypeMutation, utils.documents.list]);

  const docsByYearMonth = useMemo(() => {
    return docsForFilter.reduce<Record<number, Record<number, DocRow[]>>>((acc, doc) => {
      const y = doc.year ?? 0;
      const m = doc.month ?? 0;
      if (!acc[y]) acc[y] = {};
      if (!acc[y][m]) acc[y][m] = [];
      acc[y][m].push(doc);
      return acc;
    }, {});
  }, [docsForFilter]);

  const sortedYears = Object.keys(docsByYearMonth).map(Number).sort((a, b) => b - a);

  const activeDragDoc = activeDragDocId != null
    ? localDocs.find((d) => String(d.id) === String(activeDragDocId))
    : null;

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    const id = String(event.active.id);
    if (id.startsWith("doc:")) setActiveDragDocId(id.replace("doc:", ""));
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragDocId(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!activeId.startsWith("doc:") || !overId?.startsWith("cat:")) return;
    const docId = activeId.replace("doc:", "");
    const category = overId.replace("cat:", "") as CategoryType;
    await handleCategoryDrop(docId, category);
  }, [handleCategoryDrop]);

  const handleDragCancel = useCallback(() => setActiveDragDocId(null), []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
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
        <Button onClick={openUploadDialog} className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold gap-2">
          <Upload className="w-4 h-4" />
          Add Document
        </Button>
      </div>

      {selectedDocIds.length > 0 && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckSquare className="w-4 h-4" />
            <span className="font-medium">{selectedDocIds.length} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-zinc-700" onClick={clearSelection} disabled={bulkDeleting}>Clear</Button>
            <Button size="sm" className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30" onClick={() => setShowBulkDeleteConfirm(true)} disabled={bulkDeleting}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <CategoryDropZone
            category="All Types"
            selectedType={selectedType}
            count={localDocs.length}
            onSelect={setSelectedType}
            pulse={false}
          />
          {CATEGORY_TYPES.map((cat) => (
            <DroppableCategory
              key={cat}
              category={cat}
              selectedType={selectedType}
              count={categoryCounts[cat]}
              onSelect={setSelectedType}
              pulse={pulsedCategory === cat}
            />
          ))}

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-36 bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All Years">All Years</SelectItem>
              {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All Months">All Months</SelectItem>
              {MONTH_NAMES.map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="border-zinc-700" onClick={toggleSelectAllVisible} disabled={!docsForFilter.length}>
            {allVisibleSelected ? <CheckSquare className="w-4 h-4 mr-1.5" /> : <Square className="w-4 h-4 mr-1.5" />}
            {allVisibleSelected ? "Unselect All" : "Select All"}
          </Button>

          <span className="ml-auto text-sm text-muted-foreground">
            {docsForFilter.length} document{docsForFilter.length !== 1 ? "s" : ""}
          </span>
        </div>

        <p className="text-xs text-muted-foreground/80 mb-4">
          Drag documents into categories to organize your files.
        </p>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading documents...</div>
        ) : docsForFilter.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 py-20 text-center text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No documents found.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedYears.map((year) => {
              const monthsInYear = Object.keys(docsByYearMonth[year]).map(Number).sort((a, b) => b - a);
              const totalInYear = monthsInYear.reduce((s, m) => s + docsByYearMonth[year][m].length, 0);
              return (
                <div key={year}>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{year}</span>
                    <span className="text-sm text-muted-foreground">— {totalInYear} document{totalInYear !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="space-y-6">
                    {monthsInYear.map((month) => (
                      <div key={month}>
                        <div className="flex items-center gap-2 mb-3 pl-1">
                          <span className="text-sm font-medium text-emerald-400/80">{month === 0 ? "No Month" : MONTH_NAMES[month - 1]}</span>
                          <span className="text-xs text-muted-foreground">· {docsByYearMonth[year][month].length} doc{docsByYearMonth[year][month].length !== 1 ? "s" : ""}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {docsByYearMonth[year][month].map((doc) => {
                            const isSelected = selectedSet.has(String(doc.id));
                            return (
                              <DraggableDocCard key={doc.id} id={doc.id}>
                                <div className={`bg-zinc-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors ${isSelected ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : "border-zinc-800 hover:border-zinc-700"}`}>
                                  {getMimeCategory(doc.mime_type) === "image" && doc.file_url && (
                                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="block -mx-4 -mt-4 mb-0 rounded-t-xl overflow-hidden border-b border-zinc-800">
                                      <img src={doc.file_url} alt={doc.name} className="w-full h-32 object-cover hover:opacity-90 transition-opacity" />
                                    </a>
                                  )}

                                  <div className="flex items-start justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleSelect(doc.id); }}
                                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? "border-emerald-400 bg-emerald-500/20 text-emerald-300" : "border-zinc-600 text-zinc-500 hover:border-zinc-400"}`}
                                    >
                                      {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                    </button>

                                    <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                                      <DocIcon mimeType={doc.mime_type} />
                                    </div>

                                    <Badge variant="outline" className={`ml-auto text-xs font-medium ${DOC_TYPE_COLORS[doc.doc_type ?? "Other"] ?? DOC_TYPE_COLORS.Other}`}>
                                      {normalizeDocTypeForCategory(doc.doc_type)}
                                    </Badge>
                                  </div>

                                  <div>
                                    <h3 className="font-semibold text-sm leading-snug">{doc.name}</h3>
                                    {doc.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>}
                                  </div>

                                  <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-zinc-800 pt-2">
                                    <Calendar className="w-3 h-3 shrink-0" />
                                    <span>{month > 0 ? `${MONTH_NAMES[month - 1].slice(0, 3)} ` : ""}{year}</span>
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

                                  <div className="flex items-center gap-2">
                                    <Button size="sm" className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 gap-1.5 text-xs" disabled={!doc.file_url} onClick={() => doc.file_url && window.open(doc.file_url, "_blank")}>
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      {openButtonLabel(doc.mime_type)}
                                    </Button>
                                    <Button size="sm" variant="outline" className="px-2.5 border-zinc-700 hover:bg-zinc-800" disabled={!doc.file_url} onClick={() => {
                                      if (!doc.file_url) return;
                                      const a = document.createElement("a");
                                      a.href = doc.file_url;
                                      a.download = doc.file_name || doc.name;
                                      a.click();
                                    }}>
                                      <Download className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="px-2.5 border-zinc-700 hover:bg-red-900/30 hover:text-red-400 hover:border-red-500/30" onClick={() => {
                                      if (confirm(`Delete "${doc.name}"?`)) {
                                        deleteMutation.mutate({ id: doc.id });
                                        setSelectedDocIds((prev) => prev.filter((id) => String(id) !== String(doc.id)));
                                      }
                                    }}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </DraggableDocCard>
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

        <DragOverlay>
          {activeDragDoc ? (
            <div className="bg-zinc-900/95 border border-emerald-400/40 rounded-xl p-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)] w-64 opacity-90 scale-[1.02] transition-transform duration-150 will-change-transform">
              <div className="flex items-center gap-2">
                <DocIcon mimeType={activeDragDoc.mime_type} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{activeDragDoc.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{activeDragDoc.file_name || "Document"}</p>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog open={showBulkDeleteConfirm} onOpenChange={(open) => !bulkDeleting && setShowBulkDeleteConfirm(open)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-300"><Trash2 className="w-4 h-4" />Delete Selected Documents</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground py-1">Are you sure you want to delete the selected documents?</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)} className="border-zinc-700" disabled={bulkDeleting}>Cancel</Button>
            <Button onClick={handleBulkDeleteConfirm} disabled={bulkDeleting || !selectedDocIds.length} className="bg-red-500 hover:bg-red-600 text-white font-semibold">
              {bulkDeleting ? "Deleting..." : `Delete ${selectedDocIds.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpload} onOpenChange={(open) => {
        if (!uploading) {
          setShowUpload(open);
          if (!open) resetUploadForm();
        }
      }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4 text-emerald-400" />Add Document</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Files</Label>
              <div className="border-2 border-dashed border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-emerald-500/50 transition-colors" onClick={() => fileInputRef.current?.click()}>
                {uploadItems.length > 0 ? (
                  <div className="space-y-2 text-left">
                    <div className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>{uploadItems.length} selected (max {MAX_UPLOAD_FILES})</span>
                      {(uploading || uploadItems.some((a) => a.status === "failed" || a.status === "uploaded")) && (
                        <span>
                          {uploading
                            ? `Uploading ${Math.min(uploadProgressIndex, Math.max(1, uploadTotalCount || uploadItems.length))} of ${Math.max(1, uploadTotalCount || uploadItems.length)}...`
                            : `${uploadItems.filter((a) => a.status === "uploaded").length} uploaded, ${uploadItems.filter((a) => a.status === "failed").length} failed`}
                        </span>
                      )}
                    </div>
                    <div className="max-h-40 overflow-auto space-y-1 pr-1">
                      {uploadItems.map((item, idx) => {
                        const statusIcon = item.status === "uploading"
                          ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                          : item.status === "uploaded"
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            : item.status === "failed"
                              ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                              : <Clock3 className="w-3.5 h-3.5 text-zinc-400" />;

                        const statusLabel = item.status === "uploading" ? "Uploading" : item.status === "uploaded" ? "Uploaded" : item.status === "failed" ? "Failed" : "Pending";

                        return (
                          <div key={item.id} className="rounded-md bg-zinc-900/70 border border-zinc-800 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="truncate text-sm">{item.file.name}</span>
                                <span className="text-muted-foreground text-xs shrink-0">({formatBytes(item.file.size)})</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300 bg-zinc-950/70">
                                  {statusIcon}
                                  {statusLabel}
                                </span>
                                <button onClick={(e) => { e.stopPropagation(); removeUploadFileAt(idx); }} disabled={item.status === "uploading"} className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            {item.status === "failed" && item.error && <div className="mt-1 text-[11px] text-red-300/90 pl-6 truncate">{item.error}</div>}
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
                onChange={(e) => applySelectedFiles(Array.from(e.target.files ?? []))}
              />
            </div>

            {uploadItems.length <= 1 && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Document Name</Label>
                <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. KynLi Q1 2026 Financials" className="bg-zinc-900 border-zinc-700" />
              </div>
            )}

            {uploadItems.length > 1 && <p className="text-xs text-muted-foreground">Multiple files selected: each document will use its original file name.</p>}

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Description <span className="opacity-50">(optional)</span></Label>
              <Textarea value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="Brief description of this document..." className="bg-zinc-900 border-zinc-700 resize-none h-20" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
              <Select value={uploadDocType} onValueChange={(v) => setUploadDocType(v as CategoryType)}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Year</Label>
                <Select value={uploadYear} onValueChange={setUploadYear}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Month</Label>
                <Select value={uploadMonth} onValueChange={setUploadMonth}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTH_NAMES.map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleUpload} disabled={uploadItems.length === 0 || (uploadItems.length === 1 && !uploadName.trim()) || uploading} className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold">
              {uploading ? `Uploading ${uploadItems.length} file${uploadItems.length === 1 ? "" : "s"}...` : `Upload ${uploadItems.length > 0 ? uploadItems.length : ""}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
