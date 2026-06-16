import { useMemo, useState, useRef, useEffect, useCallback, memo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ALL_FOLDERS = "All Folders" as const;

const CLIENT_VISIBLE_ROOT_FOLDERS = ["Client Uploads", "Financials For Client", "Chat Attachments"] as const;

const WORKSPACE_FOLDERS = [
  "Internal Info",
  "Bank Statements",
  "Tax",
  "Legal & Contracts",
  "Financials (Internal)",
  "Payroll",
  "Client Uploads",
  "Financials For Client",
  "Chat Attachments",
] as const;

type WorkspaceFolder = (typeof WORKSPACE_FOLDERS)[number];
type FolderFilter = typeof ALL_FOLDERS | WorkspaceFolder | string;

type FolderRow = {
  id: number;
  tenant_slug?: string | null;
  parent_folder_id?: number | null;
  name: string;
  full_path: string;
};

const LEGACY_DOC_TYPES = ["Financials", "Tax Returns", "W-2 / 1099", "Other", "chat_attachment", "Chat Attachment"] as const;

const FOLDER_TEMPLATES = [
  { key: "Financials (with months)", base: "Financials", supportsMonths: true },
  { key: "Bank Statements (with months)", base: "Bank Statements", supportsMonths: true },
  { key: "Payroll (with months)", base: "Payroll", supportsMonths: true },
  { key: "Tax Returns (year folders only)", base: "Tax Returns", supportsMonths: false },
  { key: "Accounts Payable (with months)", base: "Accounts Payable", supportsMonths: true },
  { key: "Accounts Receivable (with months)", base: "Accounts Receivable", supportsMonths: true },
] as const;

const TEMPLATE_YEAR_EXTRA_FOLDERS = ["Send to Accountant", "Workpapers"] as const;

const TEMPLATE_BASE_NAMES: Set<string> = new Set(FOLDER_TEMPLATES.map((t) => t.base));

function resolveDefaultTemplateTypeForPath(path?: string | null): string {
  const root = String(path ?? "").split("/").filter(Boolean)[0]?.trim();
  if (!root) return FOLDER_TEMPLATES[0].key;

  const byRoot: Record<string, string> = {
    "Bank Statements": "Bank Statements (with months)",
    "Payroll": "Payroll (with months)",
    "Accounts Payable": "Accounts Payable (with months)",
    "Accounts Receivable": "Accounts Receivable (with months)",
    "Tax": "Tax Returns (year folders only)",
    "Tax Returns": "Tax Returns (year folders only)",
    "Financials": "Financials (with months)",
    "Financials (Internal)": "Financials (with months)",
  };

  const mapped = byRoot[root];
  if (mapped && FOLDER_TEMPLATES.some((t) => t.key === mapped)) return mapped;

  const direct = FOLDER_TEMPLATES.find((t) => t.base.toLowerCase() === root.toLowerCase());
  return direct?.key ?? FOLDER_TEMPLATES[0].key;
}

const DOC_TYPE_COLORS: Record<string, string> = {
  "Internal Info": "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "Bank Statements": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Tax: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "Legal & Contracts": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "Financials (Internal)": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Payroll: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "Client Uploads": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Financials For Client": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Chat Attachments": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Financials: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Tax Returns": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "W-2 / 1099": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Chat Attachment": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  chat_attachment: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function normalizeDocType(value?: string | null): string {
  if (!value || !String(value).trim()) return "Other";
  const raw = String(value).trim();
  if (raw.toLowerCase() === "chat_attachment" || raw.toLowerCase() === "chat attachment") return "Chat Attachments";
  return raw;
}

function prettifyFolderPath(path?: string | null): string {
  const raw = String(path ?? "").trim();
  if (!raw) return "—";
  const parts = raw.split("/").filter(Boolean);
  const out: string[] = [];

  for (const part of parts) {
    const m = part.match(/^(.*)\\s(\\d{4})$/);
    const prev = out[out.length - 1];
    if (m && prev && m[1].trim().toLowerCase() === prev.trim().toLowerCase()) {
      out.push(m[2]);
    } else {
      out.push(part);
    }
  }

  return out.join("/");
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
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDateShort(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(value?: string | null): string {
  if (!value) return "just now";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "just now";
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
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

const FolderCard = memo(function FolderCard({
  folder,
  isActive,
  count,
  subfolderCount,
  lastUpdated,
  monthYearLabel,
  onSelect,
  onUploadToFolder,
  onCreateSubfolder,
  onDeleteFolder,
  pulse,
}: {
  folder: { id: number | null; name: string; fullPath: string };
  isActive: boolean;
  count: number;
  subfolderCount: number;
  lastUpdated?: string | null;
  monthYearLabel?: string | null;
  onSelect: (folder: { id: number | null; name: string; fullPath: string }) => void;
  onUploadToFolder?: (folderPath: string) => void;
  onCreateSubfolder?: (folder: { id: number | null; name: string; fullPath: string }) => void;
  onDeleteFolder?: (folder: { id: number | null; name: string; fullPath: string }) => void;
  pulse?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `folder:${folder.fullPath}` });

  const parsedYearFolder = useMemo(() => {
    const m = String(folder.name).match(/^(.*)\\s(\\d{4})$/);
    if (!m) return null;
    const base = m[1]?.trim() ?? "";
    const year = m[2];
    if (!base || !TEMPLATE_BASE_NAMES.has(base)) return null;
    return { base, year };
  }, [folder.name]);

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(folder)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(folder);
        }
      }}
      className={`rounded-xl border p-4 bg-zinc-900/60 cursor-pointer transition-all ${
        isActive
          ? "border-emerald-500/45 ring-1 ring-emerald-500/30"
          : "border-zinc-800 hover:border-zinc-700"
      } ${isOver ? "ring-2 ring-emerald-300/40 border-emerald-400/60" : ""} ${pulse ? "ring-2 ring-emerald-400/25" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
            {parsedYearFolder ? (
              <div className="min-w-0 flex items-center gap-2" title={folder.name}>
                <p className="text-sm font-semibold text-zinc-100 truncate">{parsedYearFolder.base}</p>
                <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 shrink-0">
                  {parsedYearFolder.year}
                </span>
              </div>
            ) : (
              <p className="text-sm font-semibold text-zinc-100 truncate" title={folder.name}>{folder.name}</p>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {subfolderCount} folder{subfolderCount !== 1 ? "s" : ""} • {count} document{count !== 1 ? "s" : ""}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Updated {lastUpdated ? formatDateShort(lastUpdated) : (monthYearLabel || "—")}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="h-7 px-2 border-zinc-700">•••</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); onCreateSubfolder?.(folder); }}>
              Create Subfolder
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Rename Folder (soon)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!folder.id}
              onClick={(e) => {
                e.preventDefault();
                onDeleteFolder?.(folder);
              }}
            >
              Delete Folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3">
        <Button
          size="sm"
          className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(folder);
          }}
        >
          Open Folder
        </Button>
      </div>
    </div>
  );
});

const DraggableDocCard = memo(function DraggableDocCard({
  id,
  children,
  dragDisabled = false,
}: {
  id: string | number;
  children: ReactNode;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `doc:${String(id)}`,
    disabled: dragDisabled,
  });

  const transformStyle = useMemo(() => ({
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }), [transform, isDragging]);

  return (
    <div
      ref={setNodeRef}
      data-doc-id={String(id)}
      style={transformStyle}
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-inline-rename]")) {
          e.stopPropagation();
        }
      }}
      {...listeners}
      {...attributes}
      className="transition-transform duration-150 will-change-transform"
    >
      {children}
    </div>
  );
});

export default function Documents() {
  const { impersonatingTenantSlug } = usePortal();
  const { user } = useAuth();
  const [location] = useLocation();
  const [selectedType, setSelectedType] = useState<FolderFilter>(ALL_FOLDERS);
  const [currentFolderPath, setCurrentFolderPath] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const shouldRestrictClientFolders = user?.role === "client";

  const [showUpload, setShowUpload] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadDocType, setUploadDocType] = useState<string>("Financials (Internal)");
  const [uploadYear, setUploadYear] = useState(String(CURRENT_YEAR));
  const [uploadMonth, setUploadMonth] = useState(String(CURRENT_MONTH));
  const [uploadDestinationMode, setUploadDestinationMode] = useState<"current" | "specific">("specific");
  const [uploadContextPath, setUploadContextPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressIndex, setUploadProgressIndex] = useState(0);
  const [uploadTotalCount, setUploadTotalCount] = useState(0);

  const [selectedDocIds, setSelectedDocIds] = useState<Array<string | number>>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [showMoveFolderDialog, setShowMoveFolderDialog] = useState(false);
  const [moveTargetDoc, setMoveTargetDoc] = useState<DocRow | null>(null);
  const [moveFolderSelection, setMoveFolderSelection] = useState<string>("Internal Info");
  const [movingFolder, setMovingFolder] = useState(false);

  const [showDeleteFolderDialog, setShowDeleteFolderDialog] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<{ id: number; name: string; fullPath: string; parentId: number | null } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createFolderParentId, setCreateFolderParentId] = useState<number | null>(null);
  const [createFolderContextPath, setCreateFolderContextPath] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderMode, setCreateFolderMode] = useState<"standard" | "template">("standard");
  const [templateProgress, setTemplateProgress] = useState<{ active: boolean; total: number; completed: number }>({ active: false, total: 0, completed: 0 });
  const [templateType, setTemplateType] = useState<string>("Financials (with months)");
  const [templateFromYear, setTemplateFromYear] = useState(String(Math.max(2024, CURRENT_YEAR - 2)));
  const [templateToYear, setTemplateToYear] = useState(String(CURRENT_YEAR));
  const [templateCreateMonths, setTemplateCreateMonths] = useState(true);

  const [showDateDialog, setShowDateDialog] = useState(false);
  const [dateTargetDoc, setDateTargetDoc] = useState<DocRow | null>(null);
  const [dateYearSelection, setDateYearSelection] = useState<string>(String(CURRENT_YEAR));
  const [dateMonthSelection, setDateMonthSelection] = useState<string>(String(CURRENT_MONTH));
  const [movingDate, setMovingDate] = useState(false);
  const [showSearchPreviewDialog, setShowSearchPreviewDialog] = useState(false);
  const [searchPreviewDoc, setSearchPreviewDoc] = useState<DocRow | null>(null);

  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState("");
  const [savingFileName, setSavingFileName] = useState(false);

  const [localDocs, setLocalDocs] = useState<DocRow[]>([]);
  const [activeDragDocId, setActiveDragDocId] = useState<string | number | null>(null);
  const [pulsedFolder, setPulsedFolder] = useState<string | null>(null);
  const [focusDocIdFromQuery, setFocusDocIdFromQuery] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const folder = params.get("folder");
    const doc = params.get("doc");

    if (folder && !currentFolderPath) {
      setCurrentFolderPath(folder);
      setSelectedType(folder);
    }

    if (doc) {
      setFocusDocIdFromQuery(doc);
    }
  }, [location, currentFolderPath]);

  const { data: docs = [], isLoading } = trpc.documents.list.useQuery({
    year: undefined,
    month: undefined,
    folderPath: currentFolderPath ?? undefined,
    tenantSlug: impersonatingTenantSlug ?? undefined,
  }, {
    enabled: Boolean(currentFolderPath),
  });

  const { data: folderRows = [] } = trpc.documents.listFolders.useQuery({
    tenantSlug: impersonatingTenantSlug ?? undefined,
  });

  const { data: dashboardData } = trpc.documents.dashboard.useQuery({
    tenantSlug: impersonatingTenantSlug ?? undefined,
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const { data: searchResults, isLoading: searchLoading } = trpc.documents.search.useQuery(
    { q: searchQuery.trim(), tenantSlug: impersonatingTenantSlug ?? undefined, limit: 60 },
    { enabled: normalizedSearch.length > 0 },
  );

  const uploadMutation = trpc.documents.upload.useMutation();
  const updateTypeMutation = trpc.documents.updateType.useMutation();
  const updateDateMutation = trpc.documents.updateDate.useMutation();
  const updateFileNameMutation = trpc.documents.updateFileName.useMutation();
  const createFolderMutation = trpc.documents.createFolder.useMutation();
  const deleteFolderMutation = trpc.documents.deleteFolder.useMutation();

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
          a.year !== b.year ||
          a.month !== b.month ||
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

  useEffect(() => {
    if (!focusDocIdFromQuery) return;
    const exists = localDocs.some((d) => String(d.id) === String(focusDocIdFromQuery));
    if (!exists) return;
    setSelectedDocIds([focusDocIdFromQuery]);

    setTimeout(() => {
      const safe = String(focusDocIdFromQuery).replace(/"/g, "\\\"");
      const card = document.querySelector(`[data-doc-id="${safe}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    setFocusDocIdFromQuery(null);
  }, [focusDocIdFromQuery, localDocs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function resetUploadForm() {
    setUploadItems([]);
    setUploadName("");
    setUploadDesc("");
    setUploadDocType("Financials (Internal)");
    setUploadYear(String(CURRENT_YEAR));
    setUploadMonth(String(CURRENT_MONTH));
    setUploadDestinationMode("specific");
    setUploadContextPath(null);
    setUploadProgressIndex(0);
    setUploadTotalCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openUploadDialog(defaultFolder?: string) {
    const toRoot = (value?: string | null) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "Financials (Internal)";
      return raw.split("/").filter(Boolean)[0] || "Financials (Internal)";
    };

    const contextPath = defaultFolder ?? currentFolderPath ?? null;
    setUploadContextPath(contextPath);

    if (contextPath) {
      setUploadDestinationMode("current");
      setUploadDocType(toRoot(contextPath));
    } else {
      setUploadDestinationMode("specific");
      if (selectedType === ALL_FOLDERS) {
        setUploadDocType("Financials (Internal)");
      } else if ((WORKSPACE_FOLDERS as readonly string[]).includes(String(selectedType))) {
        setUploadDocType(String(selectedType));
      } else {
        setUploadDocType("Financials (Internal)");
      }
    }
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

  async function resolveUploadDestinationPath() {
    if (uploadDestinationMode === "current" && uploadContextPath) {
      return String(uploadContextPath);
    }

    const monthNum = Number(uploadMonth);
    const yearNum = Number(uploadYear);
    const monthName = MONTH_NAMES[Math.max(0, Math.min(11, monthNum - 1))] ?? MONTH_NAMES[0];

    const root = (String(uploadDocType || "").trim() || "Financials (Internal)").split("/").filter(Boolean)[0] || "Financials (Internal)";
    const canonicalYear = String(yearNum);
    const canonicalPath = `${root}/${canonicalYear}/${monthName}`;
    const legacyPath = `${root}/${root} ${canonicalYear}/${monthName}`;

    const known = new Map<string, FolderRow>(Array.from(folderByPath.entries()));

    // 1) Reuse canonical if present
    if (known.has(canonicalPath)) return canonicalPath;

    // 2) Fallback to legacy if canonical is missing
    if (known.has(legacyPath)) return legacyPath;

    // 3) Create canonical only if neither exists
    let rootFolder = known.get(root);
    if (!rootFolder) {
      const createdRoot = await createFolderMutation.mutateAsync({
        tenantSlug: impersonatingTenantSlug ?? undefined,
        name: root,
        parentFolderId: null,
      });
      rootFolder = (createdRoot as any)?.folder as FolderRow | undefined;
      if (rootFolder) known.set(String(rootFolder.full_path), rootFolder);
    }

    const rootId = rootFolder ? Number(rootFolder.id) : null;

    let yearFolder = known.get(`${root}/${canonicalYear}`);
    if (!yearFolder) {
      const createdYear = await createFolderMutation.mutateAsync({
        tenantSlug: impersonatingTenantSlug ?? undefined,
        name: canonicalYear,
        parentFolderId: rootId,
      });
      yearFolder = (createdYear as any)?.folder as FolderRow | undefined;
      if (yearFolder) known.set(String(yearFolder.full_path), yearFolder);
    }

    const yearId = yearFolder ? Number(yearFolder.id) : null;

    if (!known.has(canonicalPath)) {
      const createdMonth = await createFolderMutation.mutateAsync({
        tenantSlug: impersonatingTenantSlug ?? undefined,
        name: monthName,
        parentFolderId: yearId,
      });
      const monthFolder = (createdMonth as any)?.folder as FolderRow | undefined;
      if (monthFolder) known.set(String(monthFolder.full_path), monthFolder);
    }

    return canonicalPath;
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

      const destinationPath = await resolveUploadDestinationPath();

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
            docType: destinationPath,
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

      await utils.documents.listFolders.invalidate();
      await utils.documents.list.invalidate();
      await utils.documents.dashboard.invalidate();

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
    const map = new Map<string, string>();
    for (const doc of localDocs) {
      map.set(String(doc.id), normalizeDocType(doc.doc_type));
    }
    return map;
  }, [localDocs]);

  const folders = (folderRows as FolderRow[]) || [];

  const folderByPath = useMemo(() => {
    const map = new Map<string, FolderRow>();
    for (const f of folders) map.set(String(f.full_path), f);
    return map;
  }, [folders]);

  const folderById = useMemo(() => {
    const map = new Map<number, FolderRow>();
    for (const f of folders) map.set(Number(f.id), f);
    return map;
  }, [folders]);

  const effectiveCurrentFolderId = useMemo(() => {
    if (!currentFolderPath) return null;
    const fromPath = folderByPath.get(currentFolderPath);
    if (fromPath) return Number(fromPath.id);
    return currentFolderId;
  }, [currentFolderPath, folderByPath, currentFolderId]);

  const childFolders = useMemo(() => {
    if (effectiveCurrentFolderId == null) {
      if (currentFolderPath) return [] as FolderRow[];
      return folders.filter((f) => f.parent_folder_id == null);
    }
    return folders.filter((f) => Number(f.parent_folder_id) === Number(effectiveCurrentFolderId));
  }, [folders, effectiveCurrentFolderId, currentFolderPath]);


  const filteredChildFolders = useMemo(() => {
    if (!normalizedSearch) return childFolders;
    return childFolders.filter((f) => String(f.name ?? "").toLowerCase().includes(normalizedSearch));
  }, [childFolders, normalizedSearch]);

  const docsForFilter = useMemo(() => {
    if (!normalizedSearch) return localDocs;
    return localDocs.filter((d) => {
      const name = String(d.file_name ?? d.name ?? "").toLowerCase();
      return name.includes(normalizedSearch);
    });
  }, [localDocs, normalizedSearch]);

  const scopedSearchFolders = useMemo(() => {
    const folders = (searchResults?.folders ?? []) as Array<{ id: number; name: string; full_path: string; updated_at: string | null }>;
    const docs = (searchResults?.documents ?? []) as Array<{ folder_path: string }>;
    const query = normalizedSearch;

    const byPath = new Map<string, { id: number | null; name: string; full_path: string; updated_at: string | null }>();

    // 1) Persisted folder results from backend search
    for (const f of folders) {
      const path = String(f.full_path);
      byPath.set(path, { id: Number(f.id), name: String(f.name), full_path: path, updated_at: f.updated_at ?? null });
    }

    // 2) Derive missing folders from matching document paths (fallback when folder rows are absent)
    for (const d of docs) {
      const full = String(d.folder_path || "").trim();
      if (!full) continue;
      const parts = full.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        const path = parts.slice(0, i + 1).join("/");
        if (!byPath.has(path)) {
          byPath.set(path, {
            id: Number(folderByPath.get(path)?.id ?? 0) || null,
            name: parts[i],
            full_path: path,
            updated_at: null,
          });
        }
      }
    }

    if (!currentFolderPath) {
      // 3) Default/system roots shown in All Folders UI
      for (const root of WORKSPACE_FOLDERS) {
        const key = String(root);
        if (!byPath.has(key)) {
          byPath.set(key, { id: null, name: key, full_path: key, updated_at: null });
        }
      }

      let results = Array.from(byPath.values()).filter((f) => {
        const name = String(f.name).toLowerCase();
        const path = String(f.full_path).toLowerCase();
        return name.includes(query) || path.includes(query);
      });

      if (shouldRestrictClientFolders) {
        const allowed = new Set<string>(CLIENT_VISIBLE_ROOT_FOLDERS as unknown as string[]);
        results = results.filter((f) => {
          const root = String(f.full_path).split("/")[0] ?? "";
          return allowed.has(root);
        });
      }

      return results;
    }

    return Array.from(byPath.values()).filter((f) => {
      const path = String(f.full_path);
      return (path.startsWith(`${currentFolderPath}/`) && path !== currentFolderPath) && (path.toLowerCase().includes(query) || String(f.name).toLowerCase().includes(query));
    });
  }, [searchResults, currentFolderPath, normalizedSearch, folderByPath, shouldRestrictClientFolders]);

  const scopedSearchDocuments = useMemo(() => {
    let docs = (searchResults?.documents ?? []) as Array<{
      id: string;
      display_name: string;
      original_name: string | null;
      folder_path: string;
      uploaded_at: string | null;
      updated_at: string | null;
      file_size: number | null;
      mime_type: string | null;
    }>;
    if (shouldRestrictClientFolders) {
      const allowed = new Set<string>(CLIENT_VISIBLE_ROOT_FOLDERS as unknown as string[]);
      docs = docs.filter((d) => {
        const root = String(d.folder_path || "").split("/")[0] ?? "";
        return allowed.has(root);
      });
    }

    if (!currentFolderPath) return docs;
    return docs.filter((d) => {
      const path = String(d.folder_path || "");
      return path === currentFolderPath || path.startsWith(`${currentFolderPath}/`);
    });
  }, [searchResults, currentFolderPath, shouldRestrictClientFolders]);


  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    years.add(CURRENT_YEAR);
    years.add(CURRENT_YEAR + 1);
    years.add(CURRENT_YEAR + 2);

    for (const d of localDocs) {
      const y = Number(d.year);
      if (Number.isFinite(y) && y > 0) years.add(y);
    }

    return Array.from(years).sort((a, b) => b - a);
  }, [localDocs]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    const stats = (dashboardData?.folderStats ?? {}) as Record<string, { docCount?: number }>;
    for (const [folderPath, value] of Object.entries(stats)) {
      counts[String(folderPath)] = Number(value?.docCount ?? 0);
    }

    // Fallback path-driven counting when dashboard stats are unavailable.
    // Count each document into all ancestor paths so any new folder/subfolder
    // automatically gets accurate recursive totals.
    if (!Object.keys(stats).length) {
      for (const d of localDocs) {
        const normalizedPath = String(normalizedDocTypeById.get(String(d.id)) ?? "Other").trim();
        if (!normalizedPath) continue;
        const segments = normalizedPath.split("/").filter(Boolean);
        if (!segments.length) continue;
        for (let i = 0; i < segments.length; i++) {
          const path = segments.slice(0, i + 1).join("/");
          counts[path] = (counts[path] || 0) + 1;
        }
      }
    }

    counts[ALL_FOLDERS] = Number(
      dashboardData?.totals?.totalDocuments ??
      localDocs.length,
    );

    return counts;
  }, [localDocs, normalizedDocTypeById, dashboardData]);

  const subfolderCountsByPath = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of folders) {
      const parent = f.parent_folder_id;
      if (parent == null) continue;
      const parentFolder = folders.find((x) => Number(x.id) === Number(parent));
      if (!parentFolder) continue;
      const path = String(parentFolder.full_path);
      counts[path] = (counts[path] || 0) + 1;
    }
    return counts;
  }, [folders]);

  const orderedLegacyFolders = useMemo(() => {
    const seen = new Set<string>([...WORKSPACE_FOLDERS]);
    const result: string[] = [];

    for (const legacy of LEGACY_DOC_TYPES) {
      const normalized = normalizeDocType(legacy);
      if (seen.has(normalized)) continue;
      if ((folderCounts[normalized] || 0) <= 0) continue;
      seen.add(normalized);
      result.push(normalized);
    }

    for (const d of localDocs) {
      const normalized = normalizedDocTypeById.get(String(d.id)) ?? "Other";
      if (seen.has(normalized)) continue;
      if ((folderCounts[normalized] || 0) <= 0) continue;
      seen.add(normalized);
      result.push(normalized);
    }

    return result;
  }, [localDocs, normalizedDocTypeById, folderCounts]);

  const rootFallbackFolders = useMemo(() => {
    if (currentFolderPath) return [] as Array<{ id: number | null; name: string; fullPath: string }>;

    const fromDb = childFolders.map((f) => ({ id: Number(f.id), name: String(f.name), fullPath: String(f.full_path) }));
    const dbSet = new Set(fromDb.map((f) => f.fullPath));

    const defaults = [...WORKSPACE_FOLDERS, ...orderedLegacyFolders]
      .filter((name) => !dbSet.has(String(name)))
      .map((name) => ({ id: null, name: String(name), fullPath: String(name) }));

    return [...fromDb, ...defaults];
  }, [currentFolderPath, childFolders, orderedLegacyFolders]);

  const selectedSet = useMemo(() => new Set(selectedDocIds.map((id) => String(id))), [selectedDocIds]);
  const isClientUploadsRootView = currentFolderPath === "Client Uploads";

  const toggleSelect = useCallback((id: string | number) => {
    const key = String(id);
    setSelectedDocIds((prev) => {
      const exists = prev.some((p) => String(p) === key);
      if (exists) return prev.filter((p) => String(p) !== key);
      return [...prev, id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedDocIds([]), []);

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

  const moveDocumentToFolder = useCallback(async (documentId: string | number, folderPath: string, destinationFolderId?: number | null) => {
    const doc = localDocs.find((d) => String(d.id) === String(documentId));
    if (!doc) return;

    const previousType = normalizeDocType(doc.doc_type);
    const newType = String(folderPath);
    if (previousType === newType) return;

    setLocalDocs((prev) =>
      prev.map((d) => (String(d.id) === String(documentId) ? { ...d, doc_type: newType } : d)),
    );

    try {
      await updateTypeMutation.mutateAsync({
        id: documentId,
        docType: newType,
        destinationFolderId: destinationFolderId ?? null,
        destinationFolderPath: newType,
        tenantSlug: impersonatingTenantSlug ?? undefined,
      });
      setPulsedFolder(newType);
      setTimeout(() => setPulsedFolder(null), 260);
      toast.success(`Moved to ${newType}`);

      const nowIso = new Date().toISOString();
      const movedFileName = (doc.file_name ?? doc.name ?? "Document") as string;
      const moverName = user?.name ?? user?.email ?? "A team member";
      const optimisticMessage = `${moverName} moved ${movedFileName}`;

      utils.documents.dashboard.setData(
        { tenantSlug: impersonatingTenantSlug ?? undefined },
        (prev) => {
          if (!prev) return prev;
          const optimisticRecent = {
            id: `optimistic-move-${String(documentId)}-${Date.now()}`,
            file_name: movedFileName,
            folder_path: newType,
            updated_at: nowIso,
            message: optimisticMessage,
          } as any;

          const deduped = [
            optimisticRecent,
            ...(prev.recent ?? []).filter((item: any) => !(
              String(item?.file_name ?? "") === movedFileName &&
              String(item?.folder_path ?? "") === newType &&
              String(item?.message ?? "") === optimisticMessage
            )),
          ].slice(0, 10);

          return {
            ...prev,
            recent: deduped,
          } as any;
        },
      );

      await Promise.all([
        utils.documents.list.invalidate(),
        utils.documents.dashboard.invalidate(),
      ]);
    } catch (error) {
      setLocalDocs((prev) =>
        prev.map((d) => (String(d.id) === String(documentId) ? { ...d, doc_type: previousType } : d)),
      );
      const message = error instanceof Error ? error.message : "Failed to move document";
      toast.error(message);
      throw error;
    }
  }, [localDocs, updateTypeMutation, utils.documents.list, impersonatingTenantSlug]);

  const moveDocumentDate = useCallback(async (documentId: string | number, year: number, month: number | null) => {
    const doc = localDocs.find((d) => String(d.id) === String(documentId));
    if (!doc) return;

    const previousYear = Number(doc.year ?? 0) || CURRENT_YEAR;
    const previousMonth = doc.month == null ? null : Number(doc.month);
    if (previousYear === year && previousMonth === month) return;

    setLocalDocs((prev) =>
      prev.map((d) => (String(d.id) === String(documentId) ? { ...d, year, month } : d)),
    );

    try {
      await updateDateMutation.mutateAsync({
        id: documentId,
        year,
        month,
        tenantSlug: impersonatingTenantSlug ?? undefined,
      });
      toast.success("Document date updated");
      await utils.documents.list.invalidate();
    } catch (error) {
      setLocalDocs((prev) =>
        prev.map((d) => (String(d.id) === String(documentId) ? { ...d, year: previousYear, month: previousMonth } : d)),
      );
      const message = error instanceof Error ? error.message : "Failed to update document date";
      toast.error(message);
      throw error;
    }
  }, [localDocs, updateDateMutation, utils.documents.list, impersonatingTenantSlug]);

  const handleFolderDrop = useCallback(async (documentId: string | number, folderPath: string) => {
    const folder = folderByPath.get(folderPath);
    await moveDocumentToFolder(documentId, folderPath, folder ? Number(folder.id) : null);
  }, [moveDocumentToFolder, folderByPath]);

  const folderMonthYearMeta = useMemo(() => {
    const byFolder = new Map<string, { latest: number; label: string }>();

    for (const d of localDocs) {
      const folder = normalizedDocTypeById.get(String(d.id)) ?? "Other";
      const y = Number(d.year);
      const m = Number(d.month);
      const hasYear = Number.isFinite(y) && y > 0;
      const monthVal = Number.isFinite(m) && m >= 1 && m <= 12 ? m : 0;
      const sortKey = (hasYear ? y : 0) * 100 + monthVal;
      const label = hasYear ? `${monthVal >= 1 ? MONTH_NAMES[monthVal - 1] : "No Month"} ${y}` : "No Date";

      const prev = byFolder.get(folder);
      if (!prev || sortKey > prev.latest) {
        byFolder.set(folder, { latest: sortKey, label });
      }
    }

    return byFolder;
  }, [localDocs, normalizedDocTypeById]);

  const folderLastUpdatedByPath = useMemo(() => {
    const map = new Map<string, string | null>();
    const stats = (dashboardData?.folderStats ?? {}) as Record<string, { lastUpdated?: string | null }>;
    for (const [folder, value] of Object.entries(stats)) {
      map.set(folder, value?.lastUpdated ?? null);
    }
    return map;
  }, [dashboardData]);

  const folderCardFilters = useMemo<Array<{ id: number | null; name: string; fullPath: string }>>(() => {
    if (currentFolderPath) {
      return filteredChildFolders.map((f) => ({ id: Number(f.id), name: String(f.name), fullPath: String(f.full_path) }));
    }

    const baseRootFolders = !normalizedSearch
      ? rootFallbackFolders
      : rootFallbackFolders.filter((f) => String(f.name).toLowerCase().includes(normalizedSearch));

    if (!shouldRestrictClientFolders) return baseRootFolders;

    const allowed = new Set<string>(CLIENT_VISIBLE_ROOT_FOLDERS as unknown as string[]);
    return baseRootFolders.filter((f) => allowed.has(String(f.fullPath)) || allowed.has(String(f.name)));
  }, [currentFolderPath, filteredChildFolders, rootFallbackFolders, normalizedSearch, shouldRestrictClientFolders]);

  const moveFolderTargets = useMemo<Array<{ id: number | null; name: string; fullPath: string }>>(() => {
    const fromDb = folders.map((f) => ({ id: Number(f.id), name: String(f.name), fullPath: String(f.full_path) }));
    const seen = new Set(fromDb.map((f) => f.fullPath));
    const defaults = [...WORKSPACE_FOLDERS, ...orderedLegacyFolders]
      .filter((x) => !seen.has(String(x)))
      .map((x) => ({ id: null, name: String(x), fullPath: String(x) }));
    const allTargets = [...fromDb, ...defaults];
    if (!shouldRestrictClientFolders) return allTargets;
    const allowed = new Set<string>(CLIENT_VISIBLE_ROOT_FOLDERS as unknown as string[]);
    return allTargets.filter((f) => {
      const root = String(f.fullPath).split("/")[0] ?? "";
      return allowed.has(root);
    });
  }, [folders, orderedLegacyFolders, shouldRestrictClientFolders]);

  const rootFolderOptions = useMemo<Array<{ id: number | null; name: string; fullPath: string }>>(() => {
    const fromDbRoots = folders
      .filter((f) => f.parent_folder_id == null)
      .map((f) => ({ id: Number(f.id), name: String(f.name), fullPath: String(f.full_path) }));

    const seen = new Set(fromDbRoots.map((f) => f.fullPath));
    const defaults = [...WORKSPACE_FOLDERS, ...orderedLegacyFolders]
      .filter((x) => !seen.has(String(x)))
      .map((x) => ({ id: null, name: String(x), fullPath: String(x) }));

    const allRoots = [...fromDbRoots, ...defaults];
    if (!shouldRestrictClientFolders) return allRoots;
    const allowed = new Set<string>(CLIENT_VISIBLE_ROOT_FOLDERS as unknown as string[]);
    return allRoots.filter((f) => allowed.has(String(f.fullPath)) || allowed.has(String(f.name)));
  }, [folders, orderedLegacyFolders, shouldRestrictClientFolders]);

  const uploadFolderOptions = rootFolderOptions;

  const uploadYearOptions = useMemo(() => {
    const root = String(uploadDocType || "").trim();
    const years = new Set<number>([CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2]);
    if (!root) return Array.from(years).sort((a, b) => b - a);

    for (const f of folders) {
      const path = String(f.full_path || "");
      if (!path.startsWith(`${root}/`)) continue;
      const child = path.slice(root.length + 1).split("/")[0] || "";
      const mDirect = child.match(/^\d{4}$/);
      const mLegacy = child.match(new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s(\\d{4})$`, "i"));
      if (mDirect) years.add(Number(mDirect[0]));
      else if (mLegacy?.[1]) years.add(Number(mLegacy[1]));
    }

    for (const d of localDocs) {
      const path = normalizeDocType(d.doc_type);
      if (!path.startsWith(`${root}/`)) continue;
      const child = path.slice(root.length + 1).split("/")[0] || "";
      const mDirect = child.match(/^\d{4}$/);
      const mLegacy = child.match(new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s(\\d{4})$`, "i"));
      if (mDirect) years.add(Number(mDirect[0]));
      else if (mLegacy?.[1]) years.add(Number(mLegacy[1]));
    }

    return Array.from(years).sort((a, b) => b - a);
  }, [uploadDocType, folders, localDocs]);

  const uploadMonthOptions = useMemo(() => {
    const root = String(uploadDocType || "").trim();
    const year = Number(uploadYear);
    if (!root || !Number.isFinite(year)) return MONTH_NAMES;

    const set = new Set<string>();
    const canonicalPrefix = `${root}/${year}/`;
    const legacyPrefix = `${root}/${root} ${year}/`;

    for (const f of folders) {
      const path = String(f.full_path || "");
      if (path.startsWith(canonicalPrefix)) {
        const seg = path.slice(canonicalPrefix.length).split("/")[0] || "";
        if (MONTH_NAMES.includes(seg)) set.add(seg);
      } else if (path.startsWith(legacyPrefix)) {
        const seg = path.slice(legacyPrefix.length).split("/")[0] || "";
        if (MONTH_NAMES.includes(seg)) set.add(seg);
      }
    }

    for (const d of localDocs) {
      const path = normalizeDocType(d.doc_type);
      let seg = "";
      if (path.startsWith(canonicalPrefix)) seg = path.slice(canonicalPrefix.length).split("/")[0] || "";
      else if (path.startsWith(legacyPrefix)) seg = path.slice(legacyPrefix.length).split("/")[0] || "";
      if (MONTH_NAMES.includes(seg)) set.add(seg);
    }

    if (!set.size) return MONTH_NAMES;
    return MONTH_NAMES.filter((m) => set.has(m));
  }, [uploadDocType, uploadYear, folders, localDocs]);

  useEffect(() => {
    if (!uploadYearOptions.length) return;
    if (!uploadYearOptions.some((y) => String(y) === String(uploadYear))) {
      setUploadYear(String(uploadYearOptions[0]));
    }
  }, [uploadYearOptions, uploadYear]);

  useEffect(() => {
    const currentMonthName = MONTH_NAMES[Math.max(0, Number(uploadMonth) - 1)] ?? null;
    if (!currentMonthName || !uploadMonthOptions.includes(currentMonthName)) {
      const fallback = uploadMonthOptions[0] ?? MONTH_NAMES[0];
      setUploadMonth(String(MONTH_NAMES.indexOf(fallback) + 1 || 1));
    }
  }, [uploadMonthOptions, uploadMonth]);

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
    if (!activeId.startsWith("doc:") || !overId?.startsWith("folder:")) return;
    const docId = activeId.replace("doc:", "");
    const folderPath = overId.replace("folder:", "");
    await handleFolderDrop(docId, folderPath);
  }, [handleFolderDrop]);

  const handleDragCancel = useCallback(() => setActiveDragDocId(null), []);

  function openMoveFolderDialog(doc: DocRow) {
    const normalized = normalizeDocType(doc.doc_type);
    const initial = normalized || "Internal Info";
    setMoveTargetDoc(doc);
    setMoveFolderSelection(initial);
    setShowMoveFolderDialog(true);
  }

  async function confirmMoveFolder() {
    if (!moveTargetDoc || movingFolder) return;
    const current = normalizeDocType(moveTargetDoc.doc_type);
    if (current === moveFolderSelection) {
      setShowMoveFolderDialog(false);
      setMoveTargetDoc(null);
      return;
    }

    setMovingFolder(true);
    try {
      const targetFolder = folderByPath.get(moveFolderSelection);
      await moveDocumentToFolder(moveTargetDoc.id, moveFolderSelection, targetFolder ? Number(targetFolder.id) : null);
      setShowMoveFolderDialog(false);
      setMoveTargetDoc(null);
    } finally {
      setMovingFolder(false);
    }
  }

  const breadcrumbs = useMemo(() => {
    if (!currentFolderPath) return [] as Array<{ label: string; path: string; id: number | null }>;
    const parts = currentFolderPath.split("/").filter(Boolean);
    const crumbs: Array<{ label: string; path: string; id: number | null }> = [];
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join("/");
      const row = folderByPath.get(path);
      crumbs.push({ label: parts[i], path, id: row ? Number(row.id) : null });
    }
    return crumbs;
  }, [currentFolderPath, folderByPath]);

  function enterFolder(folder: { id: number | null; name: string; fullPath: string }) {
    setSelectedType(folder.fullPath);
    setCurrentFolderPath(folder.fullPath);
    setCurrentFolderId(folder.id ?? null);
  }

  function openDocumentFromSearch(doc: { id: string; folder_path: string }) {
    const targetPath = String(doc.folder_path || "").trim();
    if (!targetPath) return;
    setSelectedType(targetPath);
    setCurrentFolderPath(targetPath);
    setCurrentFolderId(Number(folderByPath.get(targetPath)?.id ?? 0) || null);
    setFocusDocIdFromQuery(String(doc.id));
  }

  function openSearchPreview(doc: {
    id: string;
    display_name: string;
    original_name: string | null;
    folder_path: string;
    uploaded_at: string | null;
    updated_at: string | null;
    file_size: number | null;
    mime_type: string | null;
    description?: string | null;
    file_url?: string | null;
    file_key?: string | null;
    year?: number | null;
    month?: number | null;
  }) {
    setSearchPreviewDoc({
      id: doc.id,
      name: doc.original_name ?? doc.display_name,
      file_name: doc.display_name,
      doc_type: doc.folder_path,
      updated_at: doc.updated_at ?? doc.uploaded_at ?? null,
      file_size: doc.file_size ?? null,
      mime_type: doc.mime_type ?? null,
      description: doc.description ?? null,
      file_url: doc.file_url ?? null,
      file_key: doc.file_key ?? null,
      year: doc.year ?? null,
      month: doc.month ?? null,
    });
    setShowSearchPreviewDialog(true);
  }

  function goToRootFolders() {
    setSelectedType(ALL_FOLDERS);
    setCurrentFolderPath(null);
    setCurrentFolderId(null);
  }

  function openCreateFolder(parentFolderId: number | null) {
    setCreateFolderParentId(parentFolderId);
    setNewFolderName("");
    setCreateFolderMode("standard");

    const parentPath = parentFolderId != null
      ? String(folderById.get(Number(parentFolderId))?.full_path ?? "")
      : (currentFolderPath ?? "");
    setCreateFolderContextPath(parentPath || null);
    setTemplateType(resolveDefaultTemplateTypeForPath(parentPath));

    setTemplateFromYear(String(Math.max(2024, CURRENT_YEAR - 2)));
    setTemplateToYear(String(CURRENT_YEAR));
    setTemplateCreateMonths(true);
    setShowCreateFolderDialog(true);
  }

  async function resolveCreateFolderParentId() {
    let parentId = createFolderParentId;

    if (parentId == null && currentFolderPath) {
      const existing = folderByPath.get(currentFolderPath);
      if (existing) {
        parentId = Number(existing.id);
      } else {
        const parentCreate = await createFolderMutation.mutateAsync({
          tenantSlug: impersonatingTenantSlug ?? undefined,
          name: currentFolderPath.split("/").pop() || currentFolderPath,
          parentFolderId: null,
        });
        parentId = Number((parentCreate as any)?.folder?.id ?? 0) || null;
        await utils.documents.listFolders.invalidate();
      }
    }

    return parentId;
  }

  function openDeleteFolderDialog(folder: { id: number | null; name: string; fullPath: string }) {
    if (!folder.id) {
      toast.error("Only saved folders can be deleted.");
      return;
    }

    const row = folderById.get(Number(folder.id));
    setDeleteFolderTarget({
      id: Number(folder.id),
      name: folder.name,
      fullPath: folder.fullPath,
      parentId: row?.parent_folder_id != null ? Number(row.parent_folder_id) : null,
    });
    setShowDeleteFolderDialog(true);
  }

  async function confirmDeleteFolder() {
    if (!deleteFolderTarget || deletingFolder) return;
    setDeletingFolder(true);
    try {
      await deleteFolderMutation.mutateAsync({
        folderId: deleteFolderTarget.id,
        tenantSlug: impersonatingTenantSlug ?? undefined,
      });

      await utils.documents.listFolders.invalidate();
      await utils.documents.dashboard.invalidate();

      const parentPath = deleteFolderTarget.parentId != null
        ? String(folderById.get(Number(deleteFolderTarget.parentId))?.full_path ?? "")
        : "";

      if (currentFolderPath && (currentFolderPath === deleteFolderTarget.fullPath || currentFolderPath.startsWith(`${deleteFolderTarget.fullPath}/`))) {
        if (parentPath) {
          setCurrentFolderPath(parentPath);
          setSelectedType(parentPath);
          setCurrentFolderId(deleteFolderTarget.parentId ?? null);
        } else {
          goToRootFolders();
        }
      }

      toast.success("Folder deleted");
      setShowDeleteFolderDialog(false);
      setDeleteFolderTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete folder";
      toast.error(message);
    } finally {
      setDeletingFolder(false);
    }
  }

  const templateContextPath = useMemo(() => String(createFolderContextPath ?? "").trim(), [createFolderContextPath]);

  const canUseFolderTemplates =
    templateContextPath === "Bank Statements" ||
    templateContextPath === "Financials (Internal)" ||
    templateContextPath === "Payroll";
  const contextTemplateType = useMemo(() => {
    if (templateContextPath === "Bank Statements") return "Bank Statements (with months)";
    if (templateContextPath === "Financials (Internal)") return "Financials (with months)";
    if (templateContextPath === "Payroll") return "Payroll (with months)";
    return null;
  }, [templateContextPath]);

  const templatePlan = useMemo(() => {
    const from = Number(templateFromYear);
    const to = Number(templateToYear);
    const effectiveTemplateType = contextTemplateType ?? templateType;
    const tpl = FOLDER_TEMPLATES.find((t) => t.key === effectiveTemplateType) ?? FOLDER_TEMPLATES[0];
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      return { years: [] as number[], monthNames: [] as string[], extraFolderNames: [] as string[], yearCount: 0, monthCount: 0, extraCount: 0, templateBase: tpl.base };
    }
    const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const monthNames = templateCreateMonths && tpl.supportsMonths ? MONTH_NAMES : [];
    const includeYearExtras =
      tpl.key === "Bank Statements (with months)" ||
      tpl.key === "Financials (with months)" ||
      tpl.key === "Payroll (with months)";
    const extraFolderNames = includeYearExtras ? Array.from(TEMPLATE_YEAR_EXTRA_FOLDERS) : [];
    return {
      years,
      monthNames,
      extraFolderNames,
      yearCount: years.length,
      monthCount: years.length * monthNames.length,
      extraCount: years.length * extraFolderNames.length,
      templateBase: tpl.base,
    };
  }, [templateFromYear, templateToYear, templateType, templateCreateMonths, contextTemplateType]);

  async function confirmCreateFolder() {
    if (creatingFolder) return;
    setCreatingFolder(true);
    try {
      const parentId = await resolveCreateFolderParentId();

      if (createFolderMode === "template" && !canUseFolderTemplates) {
        toast.error("Folder templates are available only inside a folder.");
        return;
      }

      if (createFolderMode === "standard") {
        const name = newFolderName.trim();
        if (!name) {
          toast.error("Folder name is required");
          return;
        }

        const parentPath = parentId != null ? (folderById.get(Number(parentId))?.full_path ?? "") : "";
        const targetPath = parentPath ? `${parentPath}/${name}` : name;
        if (folderByPath.has(targetPath)) {
          toast.success("Folder already exists");
        } else {
          await createFolderMutation.mutateAsync({
            tenantSlug: impersonatingTenantSlug ?? undefined,
            name,
            parentFolderId: parentId,
          });
          toast.success("Folder created");
        }
      } else {
        const { years, monthNames, extraFolderNames } = templatePlan;
        if (!years.length) {
          toast.error("Please select a valid year range");
          return;
        }

        let createdYears = 0;
        let createdMonths = 0;
        let createdExtras = 0;
        let skippedCount = 0;

        const knownPaths = new Set(Array.from(folderByPath.keys()));
        const parentPath = parentId != null ? (folderById.get(Number(parentId))?.full_path ?? "") : "";
        const totalPlanned = years.length + years.length * monthNames.length + years.length * extraFolderNames.length;
        let completed = 0;
        setTemplateProgress({ active: true, total: totalPlanned, completed: 0 });

        for (const y of years) {
          const yearName = String(y);
          const yearPath = parentPath ? `${parentPath}/${yearName}` : yearName;

          let yearFolderId: number | null = null;
          if (!knownPaths.has(yearPath)) {
            const yearFolder = await createFolderMutation.mutateAsync({
              tenantSlug: impersonatingTenantSlug ?? undefined,
              name: yearName,
              parentFolderId: parentId,
            });
            yearFolderId = Number((yearFolder as any)?.folder?.id ?? 0) || null;
            knownPaths.add(yearPath);
            createdYears += 1;
          } else {
            yearFolderId = Number(folderByPath.get(yearPath)?.id ?? 0) || null;
            skippedCount += 1;
          }
          completed += 1;
          setTemplateProgress({ active: true, total: totalPlanned, completed });

          if (yearFolderId && monthNames.length) {
            for (const monthName of monthNames) {
              const monthPath = `${yearPath}/${monthName}`;
              if (knownPaths.has(monthPath)) {
                skippedCount += 1;
                completed += 1;
                setTemplateProgress({ active: true, total: totalPlanned, completed });
                continue;
              }
              await createFolderMutation.mutateAsync({
                tenantSlug: impersonatingTenantSlug ?? undefined,
                name: monthName,
                parentFolderId: yearFolderId,
              });
              knownPaths.add(monthPath);
              createdMonths += 1;
              completed += 1;
              setTemplateProgress({ active: true, total: totalPlanned, completed });
            }
          }

          if (yearFolderId && extraFolderNames.length) {
            for (const extraName of extraFolderNames) {
              const extraPath = `${yearPath}/${extraName}`;
              if (knownPaths.has(extraPath)) {
                skippedCount += 1;
                completed += 1;
                setTemplateProgress({ active: true, total: totalPlanned, completed });
                continue;
              }
              await createFolderMutation.mutateAsync({
                tenantSlug: impersonatingTenantSlug ?? undefined,
                name: extraName,
                parentFolderId: yearFolderId,
              });
              knownPaths.add(extraPath);
              createdExtras += 1;
              completed += 1;
              setTemplateProgress({ active: true, total: totalPlanned, completed });
            }
          }
        }

        const createdTotal = createdYears + createdMonths + createdExtras;
        toast.success(`Folder template created successfully. ${createdYears} year folders created, ${createdMonths + createdExtras} subfolders created. ${createdTotal} new folders created, ${skippedCount} existing folders skipped.`);
      }

      setShowCreateFolderDialog(false);
      setNewFolderName("");
      await utils.documents.listFolders.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
      setTemplateProgress((prev) => ({ ...prev, active: false }));
    }
  }

  function openDateDialog(doc: DocRow) {
    const y = Number(doc.year ?? CURRENT_YEAR);
    const m = Number(doc.month ?? CURRENT_MONTH);
    setDateTargetDoc(doc);
    setDateYearSelection(String(Number.isFinite(y) && y > 0 ? y : CURRENT_YEAR));
    setDateMonthSelection(String(Number.isFinite(m) && m >= 1 && m <= 12 ? m : CURRENT_MONTH));
    setShowDateDialog(true);
  }

  async function confirmMoveDate() {
    if (!dateTargetDoc || movingDate) return;
    const year = Number(dateYearSelection);
    const month = Number(dateMonthSelection);

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      toast.error("Please select a valid month and year.");
      return;
    }

    setMovingDate(true);
    try {
      await moveDocumentDate(dateTargetDoc.id, year, month);
      setShowDateDialog(false);
      setDateTargetDoc(null);
    } finally {
      setMovingDate(false);
    }
  }

  function startInlineRename(doc: DocRow) {
    const baseline = (doc.file_name && String(doc.file_name).trim()) || doc.name;
    setEditingDocId(String(doc.id));
    setEditingFileName(baseline);
  }

  function cancelInlineRename() {
    if (savingFileName) return;
    setEditingDocId(null);
    setEditingFileName("");
  }

  async function saveInlineRename(doc: DocRow) {
    if (savingFileName) return;
    const nextName = editingFileName.trim();
    const previousName = doc.file_name ?? doc.name;

    if (!nextName) {
      toast.error("File name cannot be empty.");
      return;
    }

    if (nextName === previousName) {
      setEditingDocId(null);
      setEditingFileName("");
      return;
    }

    setSavingFileName(true);
    setLocalDocs((prev) => prev.map((d) => (String(d.id) === String(doc.id) ? { ...d, file_name: nextName } : d)));

    try {
      await updateFileNameMutation.mutateAsync({
        id: doc.id,
        fileName: nextName,
        tenantSlug: impersonatingTenantSlug ?? undefined,
      });
      toast.success("File name updated");
      setEditingDocId(null);
      setEditingFileName("");
      await utils.documents.list.invalidate();
    } catch (error) {
      setLocalDocs((prev) => prev.map((d) => (String(d.id) === String(doc.id) ? { ...d, file_name: previousName } : d)));
      const message = error instanceof Error ? error.message : "Failed to update file name";
      toast.error(message);
    } finally {
      setSavingFileName(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-emerald-400" />
            Document Portal - All Folders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial statements, tax documents, and reports — all in one place.
          </p>
        </div>
        <Button onClick={() => openUploadDialog()} className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold gap-2">
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
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
          <div className="xl:col-span-3">
        <div className="flex items-center gap-2 mb-3 text-sm text-zinc-300 flex-wrap">
          <button type="button" onClick={goToRootFolders} className={`hover:text-emerald-300 ${!currentFolderPath ? "text-emerald-300" : ""}`}>
            All Folders
          </button>
          {breadcrumbs.map((crumb) => (
            <div key={crumb.path} className="flex items-center gap-2">
              <span className="text-zinc-500">&gt;</span>
              <button
                type="button"
                onClick={() => {
                  setCurrentFolderPath(crumb.path);
                  setCurrentFolderId(crumb.id ?? null);
                  setSelectedType(crumb.path);
                }}
                className="hover:text-emerald-300"
              >
                {prettifyFolderPath(crumb.path).split("/").pop() || crumb.label}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => openCreateFolder(effectiveCurrentFolderId)}>
            + New Folder
          </Button>
          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-black" onClick={() => openUploadDialog(currentFolderPath ?? undefined)}>
            Upload Documents
          </Button>
        </div>

        <div className="mb-4">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={currentFolderPath
              ? `Search folders and documents in ${prettifyFolderPath(currentFolderPath).split("/").pop() || currentFolderPath}...`
              : "Search folders and documents..."}
            className="bg-zinc-900 border-zinc-700"
          />
          <div className="mt-2 text-xs text-muted-foreground">
            {docsForFilter.length} document{docsForFilter.length !== 1 ? "s" : ""}
          </div>
        </div>

        {normalizedSearch ? (
          <div className="space-y-6 mb-5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h3 className="font-semibold text-zinc-100">Search Results for "{searchQuery.trim()}"</h3>
              <p className="text-xs text-zinc-400 mt-1">{scopedSearchFolders.length} folders • {scopedSearchDocuments.length} documents</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-zinc-200 mb-3">Matching Folders</h4>
              {searchLoading ? (
                <div className="text-sm text-zinc-500">Searching...</div>
              ) : scopedSearchFolders.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">No matching folders.</div>
              ) : (
                <div className="space-y-2">
                  {scopedSearchFolders.map((folder) => (
                    <div key={folder.full_path} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">📁 {folder.name}</p>
                        <p className="text-xs text-zinc-500 truncate">All Folders &gt; {prettifyFolderPath(folder.full_path).replaceAll("/", " > ")}</p>
                        <p className="text-[11px] text-zinc-500">Updated {formatRelative(folder.updated_at)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-zinc-700"
                        onClick={() => {
                          setSearchQuery("");
                          enterFolder({ id: folder.id, name: folder.name, fullPath: folder.full_path });
                        }}
                      >
                        Open Folder
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-zinc-200 mb-3">Matching Documents</h4>
              {searchLoading ? (
                <div className="text-sm text-zinc-500">Searching...</div>
              ) : scopedSearchDocuments.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">No matching documents.</div>
              ) : (
                <div className="space-y-2">
                  {scopedSearchDocuments.map((doc) => (
                    <div key={doc.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">📄 {doc.display_name}</p>
                        <p className="text-xs text-zinc-500 truncate">All Folders &gt; {prettifyFolderPath(doc.folder_path).replaceAll("/", " > ")}</p>
                        <p className="text-[11px] text-zinc-500">Uploaded {formatRelative(doc.uploaded_at)} • {formatBytes(doc.file_size ?? 0)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => openSearchPreview(doc)}>
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-zinc-700"
                          onClick={() => {
                            setSearchQuery("");
                            openDocumentFromSearch(doc);
                          }}
                        >
                          Open Folder
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
              {folderCardFilters.map((folder) => (
                <FolderCard
                  key={folder.fullPath}
                  folder={folder}
                  isActive={currentFolderPath === folder.fullPath}
                  count={folderCounts[folder.fullPath] || 0}
                  subfolderCount={subfolderCountsByPath[folder.fullPath] || 0}
                  lastUpdated={folderLastUpdatedByPath.get(folder.fullPath) ?? null}
                  monthYearLabel={folderMonthYearMeta.get(folder.fullPath)?.label ?? null}
                  onSelect={enterFolder}
                  onUploadToFolder={(path) => openUploadDialog(path)}
                  onCreateSubfolder={(f) => {
                    setCurrentFolderPath(f.fullPath);
                    setCurrentFolderId(f.id ?? null);
                    setSelectedType(f.fullPath);
                    openCreateFolder(f.id);
                  }}
                  onDeleteFolder={openDeleteFolderDialog}
                  pulse={pulsedFolder === folder.fullPath}
                />
              ))}
            </div>

            {folderCardFilters.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 mb-5 text-sm text-muted-foreground">
                No subfolders yet. Create one to organize this folder.
              </div>
            )}

            <p className="text-xs text-muted-foreground/80 mb-4">
              Drag documents into folder cards to organize your workspace.
            </p>

            {currentFolderPath && (
          isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Loading documents...</div>
          ) : docsForFilter.length === 0 ? (
            isClientUploadsRootView ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-300">
                <h3 className="text-base font-semibold text-zinc-100 mb-2">Client Uploads Overview</h3>
                <p className="text-zinc-400 mb-3">
                  Files uploaded by your assigned clients appear here before being organized into their final destination folders.
                </p>
                <p className="text-zinc-400">
                  Use Preview and Move actions to review incoming files and place them into Bank Statements, Payroll, Financials, Tax, or other folders.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 py-20 text-center text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No documents in this folder yet.</p>
              </div>
            )
          ) : isClientUploadsRootView ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900/80 text-zinc-400">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Document Name</th>
                      <th className="text-left px-4 py-2 font-medium">Client</th>
                      <th className="text-left px-4 py-2 font-medium">Uploaded By</th>
                      <th className="text-left px-4 py-2 font-medium">Uploaded Date</th>
                      <th className="text-left px-4 py-2 font-medium">File Size</th>
                      <th className="text-right px-4 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docsForFilter.map((doc) => {
                      const docName = String(doc.file_name || doc.name || "Document");
                      const clientName = String((doc as any).tenant_slug ?? impersonatingTenantSlug ?? "Assigned Client");
                      const uploadedBy = String((doc as any).uploaded_by_name ?? "Unknown");
                      const uploadedAt = (doc as any).created_at ?? doc.updated_at ?? null;
                      return (
                        <tr key={String(doc.id)} className="border-t border-zinc-800/70 hover:bg-zinc-900/40">
                          <td className="px-4 py-2 text-zinc-200 max-w-[320px] truncate" title={docName}>{docName}</td>
                          <td className="px-4 py-2 text-zinc-300">{clientName}</td>
                          <td className="px-4 py-2 text-zinc-400">{uploadedBy}</td>
                          <td className="px-4 py-2 text-zinc-400">{formatRelative(uploadedAt)}</td>
                          <td className="px-4 py-2 text-zinc-400">{formatBytes(Number(doc.file_size ?? 0))}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="outline" className="h-7 px-2 border-zinc-700" onClick={() => {
                                const folderPath = String(normalizedDocTypeById.get(String(doc.id)) ?? "Client Uploads");
                                openSearchPreview({
                                  id: String(doc.id),
                                  display_name: docName,
                                  folder_path: folderPath,
                                  uploaded_at: uploadedAt,
                                  file_size: Number(doc.file_size ?? 0),
                                  mime_type: doc.mime_type ?? null,
                                  file_url: doc.file_url ?? null,
                                  description: doc.description ?? null,
                                } as any);
                              }}>
                                Preview
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 border-zinc-700" onClick={() => openMoveFolderDialog(doc)}>
                                Move
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                              const isEditingName = editingDocId === String(doc.id);
                              return (
                                <DraggableDocCard key={doc.id} id={doc.id} dragDisabled={isEditingName}>
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

                                      <button
                                        type="button"
                                        onClick={() => openMoveFolderDialog(doc)}
                                        className="ml-auto"
                                        title="Move document to folder"
                                      >
                                        <Badge variant="outline" className={`text-xs font-medium cursor-pointer hover:brightness-110 ${DOC_TYPE_COLORS[normalizeDocType(doc.doc_type)] ?? DOC_TYPE_COLORS.Other}`}>
                                          {normalizeDocType(doc.doc_type)}
                                        </Badge>
                                      </button>
                                    </div>

                                    <div className="min-w-0">
                                      {editingDocId === String(doc.id) ? (
                                        <Input
                                          data-inline-rename="true"
                                          autoFocus
                                          value={editingFileName}
                                          onChange={(e) => setEditingFileName(e.target.value)}
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onClick={(e) => e.stopPropagation()}
                                          onBlur={() => { void saveInlineRename(doc); }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              void saveInlineRename(doc);
                                            }
                                            if (e.key === "Escape") {
                                              e.preventDefault();
                                              cancelInlineRename();
                                            }
                                          }}
                                          disabled={savingFileName}
                                          className="h-8 w-full min-w-0 text-sm bg-zinc-900 border-zinc-700"
                                        />
                                      ) : (
                                        <button
                                          data-inline-rename="true"
                                          type="button"
                                          title={(doc.file_name || doc.name) ?? ""}
                                          onPointerDown={(e) => {
                                            e.stopPropagation();
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startInlineRename(doc);
                                          }}
                                          className="block w-full min-w-0 max-w-full truncate overflow-hidden whitespace-nowrap text-left font-semibold text-sm leading-snug hover:text-emerald-300 transition-colors"
                                        >
                                          {doc.file_name || doc.name}
                                        </button>
                                      )}
                                      {doc.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>}
                                    </div>

                                    <div className="flex items-center gap-2 min-w-0 w-full overflow-hidden text-xs text-muted-foreground border-t border-zinc-800 pt-2">
                                      <Calendar className="w-3 h-3 shrink-0" />
                                      <button
                                        type="button"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openDateDialog(doc);
                                        }}
                                        className="hover:text-emerald-300 transition-colors"
                                        title="Change document date"
                                      >
                                        {month > 0 ? `${MONTH_NAMES[month - 1].slice(0, 3)} ` : ""}{year}
                                      </button>
                                      {doc.file_size != null && doc.file_size > 0 && (
                                        <>
                                          <span className="text-zinc-700">·</span>
                                          <HardDrive className="w-3 h-3 shrink-0" />
                                          <span>{formatBytes(doc.file_size)}</span>
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
          )
        )}

        {currentFolderPath && !isClientUploadsRootView && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => openUploadDialog(currentFolderPath)}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = Array.from(e.dataTransfer?.files ?? []);
              if (!dropped.length) return;
              openUploadDialog(currentFolderPath);
              applySelectedFiles(dropped);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openUploadDialog(currentFolderPath);
              }
            }}
            className="mt-5 rounded-xl border-2 border-dashed border-zinc-700 hover:border-emerald-500/40 bg-zinc-900/40 p-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-7 h-7 mx-auto mb-2 text-emerald-400/80" />
            <p className="text-sm font-medium text-zinc-200">Drag documents here to upload</p>
            <p className="text-xs text-zinc-500 mt-1">or click to browse files</p>
          </div>
        )}
          </>
        )}
          </div>

          <aside className="xl:col-span-1 space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-3">Recent Activity</h3>
              {(dashboardData?.recent?.length ?? 0) === 0 ? (
                <p className="text-xs text-zinc-500">No recent document activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {(dashboardData?.recent ?? []).slice(0, 10).map((item) => (
                    <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200 truncate" title={(item as any).message || item.file_name}>{(item as any).message || item.file_name}</p>
                          <p className="text-[11px] text-zinc-500">Updated {formatRelative(item.updated_at)}</p>
                          <p className="text-[11px] text-zinc-500 truncate" title={item.folder_path}>{prettifyFolderPath(item.folder_path)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-zinc-100">Portal Summary</h3>
              <p className="text-xs text-zinc-400">Total Folders: <span className="text-zinc-200">{folders.length}</span></p>
              <p className="text-xs text-zinc-400">Total Documents: <span className="text-zinc-200">{dashboardData?.totals?.totalDocuments ?? 0}</span></p>
              <p className="text-xs text-zinc-400">Storage Used: <span className="text-zinc-200">{formatBytes(dashboardData?.totals?.storageBytes ?? 0)}</span></p>
              <p className="text-xs text-zinc-400">Last Updated: <span className="text-zinc-200">{formatDateShort(dashboardData?.totals?.lastUpdated)}</span></p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-zinc-100">Quick Actions</h3>
              {currentFolderPath && (
                <Button size="sm" className="w-full justify-start bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30" onClick={() => openCreateFolder(effectiveCurrentFolderId)}>
                  Create Year Structure
                </Button>
              )}
              <Button size="sm" variant="outline" className="w-full justify-start border-zinc-700" onClick={() => openUploadDialog()}>Upload Multiple Files</Button>
              <Button size="sm" variant="outline" className="w-full justify-start border-zinc-700" onClick={() => toast.info("Coming soon")}>Request Documents</Button>
              <Button size="sm" variant="outline" className="w-full justify-start border-zinc-700" onClick={() => toast.info("Coming soon")}>View Trash</Button>
            </div>
          </aside>
        </div>

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

      <Dialog
        open={showMoveFolderDialog}
        onOpenChange={(open) => {
          if (movingFolder) return;
          setShowMoveFolderDialog(open);
          if (!open) setMoveTargetDoc(null);
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MoveRight className="w-4 h-4 text-emerald-400" />
              Move document to folder
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              {moveTargetDoc ? `Select a destination folder for “${moveTargetDoc.name}”.` : "Select a destination folder."}
            </p>

            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-auto pr-1">
              {moveFolderTargets.map((folder) => {
                const current = moveTargetDoc ? normalizeDocType(moveTargetDoc.doc_type) : "";
                const isCurrent = current === folder.fullPath;
                const isSelected = moveFolderSelection === folder.fullPath;

                return (
                  <button
                    key={folder.fullPath}
                    type="button"
                    disabled={isCurrent || movingFolder}
                    onClick={() => setMoveFolderSelection(folder.fullPath)}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                      isCurrent
                        ? "border-zinc-700 bg-zinc-900/60 text-zinc-500 cursor-not-allowed"
                        : isSelected
                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                          : "border-zinc-800 bg-zinc-900 text-muted-foreground hover:text-foreground hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate" title={folder.fullPath}>{folder.fullPath}</span>
                      {isCurrent && <span className="text-[11px] text-zinc-500">Current</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMoveFolderDialog(false);
                setMoveTargetDoc(null);
              }}
              className="border-zinc-700"
              disabled={movingFolder}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmMoveFolder}
              disabled={movingFolder || !moveTargetDoc || normalizeDocType(moveTargetDoc.doc_type) === moveFolderSelection}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            >
              {movingFolder ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDateDialog}
        onOpenChange={(open) => {
          if (movingDate) return;
          setShowDateDialog(open);
          if (!open) setDateTargetDoc(null);
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Change document date
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              {dateTargetDoc ? `Set month and year for “${dateTargetDoc.name}”.` : "Set month and year."}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Month</Label>
                <Select value={dateMonthSelection} onValueChange={setDateMonthSelection}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Year</Label>
                <Select value={dateYearSelection} onValueChange={setDateYearSelection}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDateDialog(false);
                setDateTargetDoc(null);
              }}
              className="border-zinc-700"
              disabled={movingDate}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmMoveDate}
              disabled={movingDate || !dateTargetDoc}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            >
              {movingDate ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSearchPreviewDialog}
        onOpenChange={(open) => {
          setShowSearchPreviewDialog(open);
          if (!open) setSearchPreviewDoc(null);
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DocIcon mimeType={searchPreviewDoc?.mime_type ?? null} />
              {searchPreviewDoc?.file_name || searchPreviewDoc?.name || "Document Preview"}
            </DialogTitle>
          </DialogHeader>

          {searchPreviewDoc && (
            <div className="space-y-3 py-2">
              <div className="text-xs text-zinc-400 space-y-1">
                <p>Folder: <span className="text-zinc-200">{prettifyFolderPath(String(searchPreviewDoc.doc_type ?? ""))}</span></p>
                <p>Uploaded: <span className="text-zinc-200">{formatDateShort(searchPreviewDoc.updated_at)}</span> • <span className="text-zinc-200">{formatBytes(searchPreviewDoc.file_size ?? 0)}</span></p>
                {searchPreviewDoc.description && <p>Description: <span className="text-zinc-200">{searchPreviewDoc.description}</span></p>}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 min-h-[220px]">
                {getMimeCategory(searchPreviewDoc.mime_type) === "image" && searchPreviewDoc.file_url ? (
                  <img src={searchPreviewDoc.file_url} alt={searchPreviewDoc.file_name || searchPreviewDoc.name} className="max-h-[380px] w-full object-contain rounded" />
                ) : getMimeCategory(searchPreviewDoc.mime_type) === "pdf" && searchPreviewDoc.file_url ? (
                  <iframe src={searchPreviewDoc.file_url} className="w-full h-[380px] rounded" title="PDF preview" />
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-sm text-zinc-500">Preview not available for this file type.</div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => {
                if (!searchPreviewDoc?.file_url) return;
                const a = document.createElement("a");
                a.href = searchPreviewDoc.file_url;
                a.download = searchPreviewDoc.file_name || searchPreviewDoc.name;
                a.click();
              }}
              disabled={!searchPreviewDoc?.file_url}
            >
              Download
            </Button>
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => {
                if (!searchPreviewDoc) return;
                setShowSearchPreviewDialog(false);
                setSearchQuery("");
                openDocumentFromSearch({ id: String(searchPreviewDoc.id), folder_path: String(searchPreviewDoc.doc_type ?? "") });
              }}
            >
              Open Folder
            </Button>
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => {
                if (!searchPreviewDoc) return;
                setShowSearchPreviewDialog(false);
                openMoveFolderDialog(searchPreviewDoc);
              }}
            >
              Move
            </Button>
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => {
                if (!searchPreviewDoc) return;
                setShowSearchPreviewDialog(false);
                setSearchQuery("");
                openDocumentFromSearch({ id: String(searchPreviewDoc.id), folder_path: String(searchPreviewDoc.doc_type ?? "") });
                toast.info("Open folder and click the file name to rename.");
              }}
            >
              Rename
            </Button>
            <Button
              className="bg-red-500/90 hover:bg-red-500 text-white"
              onClick={async () => {
                if (!searchPreviewDoc) return;
                try {
                  await deleteMutation.mutateAsync({ id: searchPreviewDoc.id });
                  setShowSearchPreviewDialog(false);
                  setSearchPreviewDoc(null);
                  await utils.documents.search.invalidate();
                  await utils.documents.dashboard.invalidate();
                  toast.success("Document deleted");
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Failed to delete document";
                  toast.error(message);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteFolderDialog}
        onOpenChange={(open) => {
          if (deletingFolder) return;
          setShowDeleteFolderDialog(open);
          if (!open) setDeleteFolderTarget(null);
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-zinc-300">
              Are you sure you want to delete <span className="font-semibold text-zinc-100">{deleteFolderTarget?.name ?? "this folder"}</span>?
            </p>
            <p className="text-xs text-zinc-500">This folder and its empty subfolders will be deleted.</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => {
                setShowDeleteFolderDialog(false);
                setDeleteFolderTarget(null);
              }}
              disabled={deletingFolder}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmDeleteFolder()}
              disabled={!deleteFolderTarget || deletingFolder}
              className="bg-red-500/90 hover:bg-red-500 text-white"
            >
              {deletingFolder ? "Deleting..." : "Delete Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCreateFolderDialog}
        onOpenChange={(open) => {
          if (!open && creatingFolder && createFolderMode === "template" && templateProgress.active) {
            toast.info("Folder template creation is running in the background.");
          }
          setShowCreateFolderDialog(open);
          if (!open && !creatingFolder) {
            setNewFolderName("");
            setCreateFolderContextPath(null);
          }
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={createFolderMode === "standard" ? "default" : "outline"}
                  className={createFolderMode === "standard" ? "bg-emerald-500 hover:bg-emerald-600 text-black" : "border-zinc-700"}
                  onClick={() => setCreateFolderMode("standard")}
                >
                  Standard Folder
                </Button>
                {canUseFolderTemplates && (
                  <Button
                    type="button"
                    size="sm"
                    variant={createFolderMode === "template" ? "default" : "outline"}
                    className={createFolderMode === "template" ? "bg-emerald-500 hover:bg-emerald-600 text-black" : "border-zinc-700"}
                    onClick={() => setCreateFolderMode("template")}
                  >
                    Folder Template
                  </Button>
                )}
              </div>
              {!canUseFolderTemplates && (
                <p className="mt-2 text-xs text-zinc-500">Templates are available after you open a specific folder.</p>
              )}
            </div>

            {createFolderMode === "standard" || !canUseFolderTemplates ? (
              <div>
                <Label className="text-xs text-muted-foreground">Folder Name</Label>
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. April"
                  className="bg-zinc-900 border-zinc-700 mt-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void confirmCreateFolder();
                    }
                  }}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Template Type</Label>
                  <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
                    {contextTemplateType ?? templateType}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">From Year</Label>
                    <Input value={templateFromYear} onChange={(e) => setTemplateFromYear(e.target.value)} className="bg-zinc-900 border-zinc-700 mt-2" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To Year</Label>
                    <Input value={templateToYear} onChange={(e) => setTemplateToYear(e.target.value)} className="bg-zinc-900 border-zinc-700 mt-2" />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={templateCreateMonths}
                    onChange={(e) => setTemplateCreateMonths(e.target.checked)}
                    className="accent-emerald-500"
                    disabled={!((FOLDER_TEMPLATES.find((t) => t.key === (contextTemplateType ?? templateType)) ?? FOLDER_TEMPLATES[0]).supportsMonths)}
                  />
                  Create month subfolders (Jan–Dec)
                </label>

                <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
                  <p className="text-xs text-zinc-400 mb-2">Preview</p>
                  <div className="max-h-40 overflow-auto space-y-1 text-xs text-zinc-300">
                    {templatePlan.years.map((y) => (
                      <div key={y}>
                        <div>{templatePlan.templateBase} / {y}</div>
                        {templatePlan.monthNames.length > 0 && (
                          <div className="ml-4 text-zinc-500">{templatePlan.monthNames.join(" • ")}</div>
                        )}
                        {templatePlan.extraFolderNames.length > 0 && (
                          <div className="ml-4 text-zinc-500">{templatePlan.extraFolderNames.join(" • ")}</div>
                        )}
                      </div>
                    ))}
                    {templatePlan.years.length === 0 && <div className="text-zinc-500">Select a valid year range.</div>}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2">
                    This will create {templatePlan.yearCount} year folders, {templatePlan.monthCount} month folders, and {templatePlan.extraCount} additional folders.
                  </p>
                </div>

                {templateProgress.active && createFolderMode === "template" && (
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                    <p className="text-sm font-medium text-zinc-200">Creating folder structure...</p>
                    <p className="text-xs text-zinc-500">Please wait while folders are being created.</p>
                    <p className="text-xs text-zinc-300">{templateProgress.completed} of {templateProgress.total} folders created</p>
                    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${templateProgress.total > 0 ? Math.min(100, Math.round((templateProgress.completed / templateProgress.total) * 100)) : 0}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500">{templateProgress.total > 0 ? Math.round((templateProgress.completed / templateProgress.total) * 100) : 0}%</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowCreateFolderDialog(false)} disabled={creatingFolder}>Cancel</Button>
            <Button
              onClick={() => void confirmCreateFolder()}
              disabled={creatingFolder || (createFolderMode === "standard" ? !newFolderName.trim() : templatePlan.yearCount <= 0)}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            >
              {creatingFolder ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Creating...</span>
              ) : (createFolderMode === "standard" ? "Create Folder" : "Create Template")}
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
              <Label className="text-xs text-muted-foreground mb-1.5 block">Upload Destination</Label>
              <div className="flex flex-wrap gap-2">
                {uploadContextPath && (
                  <Button
                    type="button"
                    size="sm"
                    variant={uploadDestinationMode === "current" ? "default" : "outline"}
                    className={uploadDestinationMode === "current" ? "bg-emerald-500 hover:bg-emerald-600 text-black" : "border-zinc-700"}
                    onClick={() => setUploadDestinationMode("current")}
                  >
                    Current Folder
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant={uploadDestinationMode === "specific" ? "default" : "outline"}
                  className={uploadDestinationMode === "specific" ? "bg-emerald-500 hover:bg-emerald-600 text-black" : "border-zinc-700"}
                  onClick={() => setUploadDestinationMode("specific")}
                >
                  Specific Year/Month
                </Button>
              </div>
              {uploadDestinationMode === "current" && uploadContextPath && (
                <p className="text-[11px] text-zinc-500 mt-2">Destination: {prettifyFolderPath(uploadContextPath)}</p>
              )}
            </div>

            {uploadDestinationMode === "specific" && (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Folder</Label>
                  <Select value={uploadDocType} onValueChange={setUploadDocType}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {uploadFolderOptions.map((t) => <SelectItem key={t.fullPath} value={t.fullPath}>{t.fullPath}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Year</Label>
                    <Select value={uploadYear} onValueChange={setUploadYear}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                      <SelectContent>{uploadYearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Month</Label>
                    <Select value={uploadMonth} onValueChange={setUploadMonth}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                      <SelectContent>{uploadMonthOptions.map((name) => <SelectItem key={name} value={String(MONTH_NAMES.indexOf(name) + 1)}>{name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
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
