import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FolderOpen,
  FileText,
  Upload,
  Download,
  ExternalLink,
  Trash2,
  Calendar,
  HardDrive,
  X,
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
  Other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

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
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

export default function Documents() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedType, setSelectedType] = useState<DocType>("All Types");
  const [selectedYear, setSelectedYear] = useState<string>("All Years");
  const [showUpload, setShowUpload] = useState(false);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadDocType, setUploadDocType] = useState("Financials");

  function openUploadDialog() {
    // Pre-fill type from active tab (if not "All Types")
    if (selectedType !== "All Types") {
      setUploadDocType(selectedType);
    } else {
      setUploadDocType("Financials");
    }
    setShowUpload(true);
  }
  const [uploadYear, setUploadYear] = useState(String(CURRENT_YEAR));
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: docs = [], isLoading } = trpc.documents.list.useQuery({
    year: selectedYear !== "All Years" ? Number(selectedYear) : undefined,
    docType: selectedType !== "All Types" ? selectedType : undefined,
  });

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      setShowUpload(false);
      resetUploadForm();
      toast.success("Document uploaded successfully");
    },
    onError: (e) =>
      toast.error(`Upload failed: ${e.message}`),

  });

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      toast.success("Document deleted");
    },
    onError: (e) =>
      toast.error(`Delete failed: ${e.message}`),

  });

  function resetUploadForm() {
    setUploadFile(null);
    setUploadName("");
    setUploadDesc("");
    setUploadDocType("Financials");
    setUploadYear(String(CURRENT_YEAR));
  }

  async function handleUpload() {
    if (!uploadFile || !uploadName.trim()) return;
    setUploading(true);
    try {
      const arrayBuffer = await uploadFile.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);
      await uploadMutation.mutateAsync({
        name: uploadName.trim(),
        description: uploadDesc.trim() || undefined,
        fileBase64: base64,
        mimeType: uploadFile.type || "application/octet-stream",
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        docType: uploadDocType,
        year: Number(uploadYear),
      });
    } finally {
      setUploading(false);
    }
  }

  // Group docs by year
  const docsByYear = docs.reduce<Record<number, typeof docs>>((acc, doc) => {
    const y = doc.year ?? 0;
    if (!acc[y]) acc[y] = [];
    acc[y].push(doc);
    return acc;
  }, {});
  const sortedYears = Object.keys(docsByYear)
    .map(Number)
    .sort((a, b) => b - a);

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

        {/* Doc count */}
        <span className="ml-auto text-sm text-muted-foreground">
          {docs.length} document{docs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading documents...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No documents found</p>
          <p className="text-sm mt-1">
            {selectedType !== "All Types" || selectedYear !== "All Years"
              ? "Try adjusting your filters."
              : isAdmin
              ? "Click 'Add Document' to upload the first one."
              : "Documents will appear here when uploaded."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedYears.map((year) => (
            <div key={year}>
              {/* Year group header */}
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-foreground">{year}</span>
                <span className="text-sm text-muted-foreground">
                  — {docsByYear[year].length} document
                  {docsByYear[year].length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Document cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {docsByYear[year].map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors"
                  >
                    {/* Card top: icon + type badge */}
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-emerald-400" />
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${
                          DOC_TYPE_COLORS[doc.docType] ?? DOC_TYPE_COLORS.Other
                        }`}
                      >
                        {doc.docType}
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
                      <span>{doc.year}</span>
                      {doc.fileSize != null && doc.fileSize > 0 && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <HardDrive className="w-3 h-3 shrink-0" />
                          <span>{formatBytes(doc.fileSize)}</span>
                        </>
                      )}
                      {doc.fileName && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="truncate">{truncateFileName(doc.fileName)}</span>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 gap-1.5 text-xs"
                        onClick={() => window.open(doc.fileUrl, "_blank")}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="px-2.5 border-zinc-700 hover:bg-zinc-800"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = doc.fileUrl;
                          a.download = doc.fileName || doc.name;
                          a.click();
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="px-2.5 border-zinc-700 hover:bg-red-900/30 hover:text-red-400 hover:border-red-500/30"
                          onClick={() => {
                            if (confirm(`Delete "${doc.name}"?`)) {
                              deleteMutation.mutate({ id: doc.id });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
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
              <Label className="text-xs text-muted-foreground mb-1.5 block">File</Label>
              <div
                className="border-2 border-dashed border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-emerald-500/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFile ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="truncate max-w-[200px]">{uploadFile.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({formatBytes(uploadFile.size)})
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadFile(null);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    Click to select a file
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.docx,.doc,.csv,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setUploadFile(f);
                    if (!uploadName) setUploadName(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </div>

            {/* Document name */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Document Name</Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. KynLi Q1 2026 Financials"
                className="bg-zinc-900 border-zinc-700"
              />
            </div>

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

            {/* Type + Year row */}
            <div className="grid grid-cols-2 gap-3">
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
              disabled={!uploadFile || !uploadName.trim() || uploading}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
