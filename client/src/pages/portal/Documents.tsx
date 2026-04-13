import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ExternalLink, File, FileText, Image } from "lucide-react";
import { useState } from "react";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const MIME_ICON: Record<string, React.ReactNode> = {
  "application/pdf": <FileText size={18} className="text-red-400" />,
  "image/png": <Image size={18} className="text-blue-400" />,
  "image/jpeg": <Image size={18} className="text-blue-400" />,
};

function getIcon(mime?: string | null) {
  if (!mime) return <File size={18} className="text-muted-foreground" />;
  return MIME_ICON[mime] ?? <File size={18} className="text-muted-foreground" />;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const now = new Date();
  const [year, setYear] = useState<string>("all");
  const { impersonatingTenantSlug } = usePortal();
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const { data: docs, isLoading } = trpc.documents.list.useQuery({
    year: year !== "all" ? Number(year) : undefined,
    tenantSlug: impersonatingTenantSlug ?? undefined,
  });

  // Group by year
  const grouped = (docs ?? []).reduce<Record<number, typeof docs>>((acc, doc) => {
    const yr = doc.year ?? 0;
    if (!acc[yr]) acc[yr] = [];
    acc[yr]!.push(doc);
    return acc;
  }, {});

  const sortedYears = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Document Vault</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Secure file storage — replaces SmartVault
          </p>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28 bg-card border-border text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-sm">All Years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y} className="text-sm">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading documents…</div>
      ) : docs?.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <File size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No documents yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your accountant will upload files here for you to access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedYears.map((yr) => (
            <div key={yr}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-foreground">{yr}</h2>
                <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                  {grouped[yr]?.length} file{grouped[yr]?.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {grouped[yr]?.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group">
                        <div className="shrink-0">{getIcon(doc.mime_type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Uploaded {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => window.open(doc.file_url, "_blank")}
                          >
                            <ExternalLink size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = doc.file_url;
                              a.download = doc.name;
                              a.click();
                            }}
                          >
                            <Download size={14} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
