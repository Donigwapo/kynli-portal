import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Database,
  Eye,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { PACKAGE_COLORS, PACKAGE_LABELS, PackageTier } from "../../../../shared/tiers";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

const EXPECTED_TABLES = [
  "chat",
  "documents",
  "financials",
  "line_items",
  "coaching_notes",
  "coaching_items",
  "kpi_metrics",
  "sales_tracker",
  "time_intelligence",
  "ai_summaries",
  "client_roster",
];

export default function AdminClientDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { setImpersonatingTenantSlug, setEffectiveTier } = usePortal();

  const { data: tenant, isLoading, refetch } = trpc.tenant.getBySlug.useQuery({ slug: slug ?? "" }, { enabled: !!slug });

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    packageTier: "legacy" as PackageTier,
    isActive: true,
  });

  const [provisionResult, setProvisionResult] = useState<{
    tables_created: string[];
    tables_existed: string[];
    errors: { table: string; error: string }[];
  } | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const utils = trpc.useUtils();

  const upsert = trpc.tenant.upsert.useMutation({
    onSuccess: () => {
      toast.success("Client updated");
      setEditMode(false);
      refetch();
      utils.tenant.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const provision = trpc.tenant.provision.useMutation({
    onSuccess: (data) => {
      setProvisionResult(data);
      setProvisioning(false);
      if (data.errors.length === 0) {
        toast.success(`Provisioning complete — ${data.tables_created.length} tables created, ${data.tables_existed.length} already existed`);
      } else {
        toast.warning(`Provisioning finished with ${data.errors.length} error(s)`);
      }
    },
    onError: (e) => {
      setProvisioning(false);
      toast.error(e.message);
    },
  });

  function startEdit() {
    if (!tenant) return;
    setForm({
      companyName: tenant.company_name ?? "",
      contactName: tenant.contact_name ?? "",
      email: tenant.email ?? "",
      packageTier: tenant.package_tier as PackageTier,
      isActive: tenant.is_active,
    });
    setEditMode(true);
  }

  function handleImpersonate() {
    if (!tenant) return;
    setImpersonatingTenantSlug(tenant.slug);
    setEffectiveTier(tenant.package_tier as PackageTier);
    navigate("/portal");
  }

  function handleProvision() {
    if (!slug) return;
    setProvisioning(true);
    setProvisionResult(null);
    provision.mutate({ slug });
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-sm text-muted-foreground">Loading client…</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => navigate("/admin/clients")}>
          <ArrowLeft size={14} /> Back to Clients
        </Button>
        <p className="text-sm text-muted-foreground">Client not found: <code className="font-mono">{slug}</code></p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/admin/clients")}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{tenant.company_name}</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{tenant.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-border text-muted-foreground hover:text-primary"
            onClick={handleImpersonate}
          >
            <Eye size={13} /> View as Client
          </Button>
          {!editMode && (
            <Button size="sm" className="bg-primary text-primary-foreground" onClick={startEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Client Info Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Client Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editMode ? (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Company Name</Label>
                  <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="bg-background border-border text-foreground text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Contact Name</Label>
                  <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="bg-background border-border text-foreground text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-background border-border text-foreground text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Package Tier</Label>
                  <Select value={form.packageTier} onValueChange={(v) => setForm({ ...form, packageTier: v as PackageTier })}>
                    <SelectTrigger className="bg-background border-border text-foreground text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {Object.entries(PACKAGE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-sm">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Active</Label>
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground"
                    disabled={upsert.isPending}
                    onClick={() => upsert.mutate({
                      slug: tenant.slug,
                      companyName: form.companyName,
                      contactName: form.contactName || undefined,
                      email: form.email || undefined,
                      packageTier: form.packageTier,
                      isActive: form.isActive,
                    })}
                  >
                    {upsert.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </>
            ) : (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Company</dt>
                  <dd className="text-foreground font-medium">{tenant.company_name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="text-foreground">{tenant.contact_name ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-foreground">{tenant.email ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Package</dt>
                  <dd>
                    <Badge variant="outline" className={`text-xs ${PACKAGE_COLORS[tenant.package_tier as PackageTier]}`}>
                      {PACKAGE_LABELS[tenant.package_tier as PackageTier]}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant="outline" className={`text-xs ${tenant.is_active ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}>
                      {tenant.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Slug</dt>
                  <dd className="text-foreground font-mono text-xs">{tenant.slug}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-foreground text-xs">{new Date(tenant.created_at).toLocaleDateString()}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Provisioning Status Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Database size={14} className="text-primary" />
                Supabase Tables
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5 border-border text-muted-foreground hover:text-primary"
                disabled={provisioning}
                onClick={handleProvision}
              >
                <RefreshCw size={11} className={provisioning ? "animate-spin" : ""} />
                {provisioning ? "Provisioning…" : "Re-provision"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {provisionResult ? (
              <div className="space-y-3">
                {provisionResult.errors.length > 0 && (
                  <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 space-y-1">
                    <p className="text-xs font-medium text-red-400">Errors ({provisionResult.errors.length})</p>
                    {provisionResult.errors.map((e) => (
                      <p key={e.table} className="text-xs text-red-300 font-mono">{e.table}: {e.error}</p>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  {EXPECTED_TABLES.map((t) => {
                    const fullName = `${slug}_${t}`;
                    const created = provisionResult.tables_created.includes(fullName);
                    const existed = provisionResult.tables_existed.includes(fullName);
                    const errored = provisionResult.errors.some((e) => e.table === fullName);
                    return (
                      <div key={t} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-muted-foreground">{fullName}</span>
                        {created && <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={11} /> Created</span>}
                        {existed && <span className="flex items-center gap-1 text-zinc-400"><CheckCircle2 size={11} /> Exists</span>}
                        {errored && <span className="flex items-center gap-1 text-red-400"><XCircle size={11} /> Error</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {EXPECTED_TABLES.map((t) => (
                  <div key={t} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{slug}_{t}</span>
                    <span className="text-zinc-600">—</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-3">Click "Re-provision" to check and create missing tables.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
