import { useState, useRef } from "react";
import { FolderOpen, FileText, Download, ExternalLink, Upload, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const DOC_TYPES = [
  { label: "All Types", value: "" },
  { label: "Financials", value: "financials" },
  { label: "Tax Returns", value: "tax_returns" },
  { label: "W-2 / 1099", value: "w2_1099" },
  { label: "Other", value: "other" },
];

const TYPE_COLORS: Record<string, string> = {
  financials: "bg-teal-500/15 text-teal-400 border-teal-500/20",
  tax_returns: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  w2_1099: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  other: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  financials: "Financials",
  tax_returns: "Tax Returns",
  w2_1099: "W-2 / 1099",
  other: "Other",
};

function getMimeLabel(mime?: string | null): string {
  if (!mime) return "";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("sheet") || mime.includes("excel")) return "Excel";
  if (mime.includes("csv")) return "CSV";
  if (mime.includes("word")) return "Word";
  return mime.split("/")[1]?.toUpperCase() ?? "File";
}

export default function Documents() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const now = new Date();
  const [typeFilter, setTypeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadForm, setUploadForm] = useState<{
    name: string;
    description: string;
    docType: string;
    year: number;
  }>({
    name: "",
    description: "",
    docType: "financials",
    year: now.getFullYear(),
  });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: docs, isLoading, refetch } = trpc.documents.list.useQuery({ tenantId: undefined });

  const uploadDoc = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadForm({ name: "", description: "", docType: "financials", year: now.getFullYear() });
      refetch();
    },
    onError: (e) => toast.error(`Upload failed: ${e.message}`),
  });

  // Filter docs
  const filtered = (docs ?? []).filter((d) => {
    if (typeFilter && d.docType !== typeFilter) return false;
    if (yearFilter && d.year !== Number(yearFilter)) return false;
    return true;
  });

  // Group by year descending
  const byYear = filtered.reduce<Record<number, typeof filtered>>((acc, d) => {
    if (!acc[d.year]) acc[d.year] = [];
    acc[d.year].push(d);
    return acc;
  }, {});
  const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  // Available years for filter
  const allYears = Array.from(new Set((docs ?? []).map((d) => d.year))).sort((a, b) => b - a);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!uploadForm.name) {
      setUploadForm((f) => ({ ...f, name: file.name.replace(/\.[^/.]+$/, "") }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.name) {
      toast.error("Please select a file and enter a document name");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      await uploadDoc.mutateAsync({
        tenantId: 0,
        name: uploadForm.name,
        description: uploadForm.description || undefined,
        docType: uploadForm.docType,
        year: uploadForm.year,
        fileBase64: base64,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/pdf",
      });
      setUploading(false);
    };
    reader.readAsDataURL(selectedFile);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <FolderOpen size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Document Portal</h1>
          </div>
          <p className="text-sm text-muted-foreground">Financial statements, tax documents, and reports — all in one place.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus size={13} />
            Add Document
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          {DOC_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
                typeFilter === t.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="bg-card border border-border rounded-md text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Years</option>
          {allYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedYears.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <FolderOpen size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No documents found.</p>
          {isAdmin && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
            >
              <Upload size={12} />
              Upload first document
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sortedYears.map((yr) => (
            <div key={yr}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground font-medium">📅 {yr}</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">
                  {byYear[yr].length} document{byYear[yr].length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-3">
                {byYear[yr].map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-card border border-border rounded-xl p-4 flex items-start gap-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground">{doc.name}</h3>
                        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[doc.docType ?? "other"] ?? TYPE_COLORS.other}`}>
                          {TYPE_LABELS[doc.docType ?? "other"] ?? doc.docType}
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{doc.year}</span>
                        {doc.mimeType && <span>{getMimeLabel(doc.mimeType)}</span>}
                        <span>Uploaded {new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                      >
                        <ExternalLink size={12} />
                        Open PDF
                      </a>
                      <a
                        href={doc.fileUrl}
                        download={doc.name}
                        className="w-8 h-8 flex items-center justify-center bg-card hover:bg-primary/10 border border-border hover:border-primary/30 rounded-md transition-colors"
                        title="Download"
                      >
                        <Download size={13} className="text-muted-foreground" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-foreground mb-4">Add Document</h2>
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors"
              >
                <Upload size={24} className="text-muted-foreground" />
                {selectedFile ? (
                  <p className="text-xs text-foreground font-medium">{selectedFile.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Click to select a file (PDF, XLSX, etc.)</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.xlsx,.xls,.csv,.doc,.docx"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Document Name *</label>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Q1 2026 Financials"
                  className="w-full bg-background border border-border rounded-md text-sm text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this document..."
                  rows={2}
                  className="w-full bg-background border border-border rounded-md text-sm text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Document Type</label>
                  <select
                    value={uploadForm.docType}
                    onChange={(e) => setUploadForm((f) => ({ ...f, docType: e.target.value }))}
                    className="w-full bg-background border border-border rounded-md text-sm text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {DOC_TYPES.filter((t) => t.value).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Year</label>
                  <input
                    type="number"
                    value={uploadForm.year}
                    onChange={(e) => setUploadForm((f) => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full bg-background border border-border rounded-md text-sm text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowUploadModal(false); setSelectedFile(null); }}
                className="flex-1 text-sm text-muted-foreground border border-border rounded-md py-2 hover:bg-card transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || uploadDoc.isPending || !selectedFile || !uploadForm.name}
                className="flex-1 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md py-2 transition-colors disabled:opacity-50"
              >
                {uploading || uploadDoc.isPending ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading...</>
                ) : (
                  <><Upload size={14} /> Upload</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
