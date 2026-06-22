import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Archive,
  Eye,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PACKAGE_COLORS, PACKAGE_LABELS, PackageTier } from "../../../../shared/tiers";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

type TenantRow = {
  slug: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  package_tier: string;
  is_active: boolean;
  is_churned: boolean;
  ghl_notes: string | null;
};

function StatusBadge({ tenant }: { tenant: TenantRow }) {
  if (tenant.is_churned) {
    return (
      <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400 bg-orange-500/10">
        Churned
      </Badge>
    );
  }
  if (tenant.is_active) {
    return (
      <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/10">
      Inactive
    </Badge>
  );
}

export default function AdminClients() {
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [ghlDialogOpen, setGhlDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<{ slug: string; name: string; notes: string } | null>(null);
  const [ghlNotes, setGhlNotes] = useState("");
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [, navigate] = useLocation();
  const { setImpersonatingTenantSlug, setEffectiveTier } = usePortal();

  const { data: tenants, isLoading, refetch } = trpc.tenant.list.useQuery();
  const utils = trpc.useUtils();

  const updateGhl = trpc.tenant.updateGhlNotes.useMutation({
    onSuccess: () => { toast.success("GHL notes saved"); setGhlDialogOpen(false); refetch(); },
  });

  const archive = trpc.tenant.archive.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Client archived — status set to Churned.`);
      utils.tenant.list.invalidate();
    },
    onError: (e) => toast.error(`Archive failed: ${e.message}`),
  });

  const restore = trpc.tenant.restore.useMutation({
    onSuccess: () => {
      toast.success("Client restored — status set to Active.");
      utils.tenant.list.invalidate();
    },
    onError: (e) => toast.error(`Restore failed: ${e.message}`),
  });

  // TODO(permanent-delete): Re-enable tenant.delete only after a full purge workflow is implemented
  // (portal_tenants + tenant-scoped docs/storage/chat/folders/assignments/users/activity/notifications).

  const filtered = (tenants ?? []).filter((t) => {
    const matchSearch =
      !search ||
      t.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase());
    const matchTier = filterTier === "all" || t.package_tier === filterTier;
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && t.is_active && !t.is_churned) ||
      (filterStatus === "churned" && t.is_churned) ||
      (filterStatus === "inactive" && !t.is_active && !t.is_churned);
    return matchSearch && matchTier && matchStatus;
  });

  async function handleImpersonate(tenant: TenantRow) {
    try {
      const res = await fetch("/api/auth/view-as-client/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantSlug: tenant.slug }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to start View as Client");
      }
      setImpersonatingTenantSlug(tenant.slug);
      setEffectiveTier(tenant.package_tier as PackageTier);
      navigate("/portal");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start View as Client");
    }
  }

  function openGhlDialog(tenant: TenantRow) {
    setSelectedTenant({ slug: tenant.slug, name: tenant.company_name ?? "Client", notes: tenant.ghl_notes ?? "" });
    setGhlNotes(tenant.ghl_notes ?? "");
    setGhlDialogOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Client Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tenants?.length ?? 0} total clients
              {tenants && tenants.filter(t => t.is_churned).length > 0 && (
                <span className="ml-2 text-orange-400">
                  · {tenants.filter(t => t.is_churned).length} churned
                </span>
              )}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          onClick={() => setAddClientOpen(true)}
        >
          <Plus size={14} />
          Add Client
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 bg-card border-border text-sm h-9"
          />
        </div>
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-36 bg-card border-border text-sm h-9">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-sm">All Tiers</SelectItem>
            {Object.entries(PACKAGE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key} className="text-sm">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 bg-card border-border text-sm h-9">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-sm">All Status</SelectItem>
            <SelectItem value="active" className="text-sm">Active</SelectItem>
            <SelectItem value="churned" className="text-sm">Churned</SelectItem>
            <SelectItem value="inactive" className="text-sm">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Client table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading clients…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={40} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No clients found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Company</th>
                    <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Contact</th>
                    <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Package</th>
                    <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Status</th>
                    <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Slug</th>
                    <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tenant) => (
                    <tr
                      key={tenant.slug}
                      className={`border-b border-border/50 hover:bg-muted/20 transition-colors group ${tenant.is_churned ? "opacity-70" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">{tenant.company_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{tenant.email ?? ""}</p>
                      </td>
                      <td className="px-5 py-3 text-foreground">{tenant.contact_name ?? "—"}</td>
                      <td className="px-5 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${PACKAGE_COLORS[tenant.package_tier as PackageTier]}`}
                        >
                          {PACKAGE_LABELS[tenant.package_tier as PackageTier]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tenant={tenant as TenantRow} />
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs font-mono">{tenant.slug}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Quick actions — always visible */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground hover:text-cyan-400 gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => navigate(`/admin/clients/${tenant.slug}`)}
                          >
                            <ExternalLink size={13} />
                            Details
                          </Button>
                          {!tenant.is_churned && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-primary gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleImpersonate(tenant as TenantRow)}
                            >
                              <Eye size={13} />
                              View as
                            </Button>
                          )}
                          {/* More actions dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreHorizontal size={15} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border w-44">
                              <DropdownMenuItem
                                className="text-sm gap-2 cursor-pointer"
                                onClick={() => openGhlDialog(tenant as TenantRow)}
                              >
                                <StickyNote size={13} />
                                GHL Notes
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-border" />
                              {tenant.is_churned ? (
                                <DropdownMenuItem
                                  className="text-sm gap-2 cursor-pointer text-emerald-400 focus:text-emerald-400"
                                  onClick={() => restore.mutate({ slug: tenant.slug })}
                                  disabled={restore.isPending}
                                >
                                  <RefreshCw size={13} />
                                  Restore Client
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-sm gap-2 cursor-pointer text-orange-400 focus:text-orange-400"
                                  onClick={() => archive.mutate({ slug: tenant.slug })}
                                  disabled={archive.isPending}
                                >
                                  <Archive size={13} />
                                  Archive (Churn)
                                </DropdownMenuItem>
                              )}
                              {/* TODO(permanent-delete): hidden until safe full-tenant purge workflow exists. */}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GHL Notes Dialog */}
      <Dialog open={ghlDialogOpen} onOpenChange={setGhlDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">GHL Notes — {selectedTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Notes from GoHighLevel</Label>
              <Textarea
                value={ghlNotes}
                onChange={(e) => setGhlNotes(e.target.value)}
                placeholder="Paste or type GHL notes for this client…"
                className="bg-background border-border text-foreground min-h-[160px] text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setGhlDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground"
                onClick={() => selectedTenant && updateGhl.mutate({ slug: selectedTenant.slug, notes: ghlNotes })}
                disabled={updateGhl.isPending}
              >
                {updateGhl.isPending ? "Saving…" : "Save Notes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <AddClientDialog
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onSuccess={() => { setAddClientOpen(false); refetch(); }}
      />
    </div>
  );
}

function slugifyCompanyName(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildUniqueSlug(base: string, existing: Set<string>): string {
  const normalizedBase = slugifyCompanyName(base) || "client";
  if (!existing.has(normalizedBase)) return normalizedBase;
  let n = 2;
  while (existing.has(`${normalizedBase}_${n}`)) n += 1;
  return `${normalizedBase}_${n}`;
}

function AddClientDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    slug: "",
    companyName: "",
    contactName: "",
    email: "",
    packageTier: "legacy" as PackageTier,
  });
  const [sendInvite, setSendInvite] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ tables_created: string[]; tables_existed: string[]; errors: { table: string; error: string }[] } | null>(null);

  const { data: existingTenants } = trpc.tenant.list.useQuery();

  const existingSlugSet = useMemo(() => {
    const set = new Set<string>();
    for (const t of existingTenants ?? []) {
      if (t?.slug) set.add(String(t.slug).toLowerCase());
    }
    return set;
  }, [existingTenants]);

  useEffect(() => {
    const generated = buildUniqueSlug(form.companyName, existingSlugSet);
    setForm((prev) => ({ ...prev, slug: generated }));
  }, [form.companyName, existingSlugSet]);

  useEffect(() => {
    if (!open) {
      setForm({ slug: "", companyName: "", contactName: "", email: "", packageTier: "legacy" as PackageTier });
      setSendInvite(false);
      setProvisionResult(null);
    }
  }, [open]);

  const upsert = trpc.tenant.upsert.useMutation({
    onSuccess: (data) => {
      setProvisionResult(data.provision);
      if (data.provision.errors.length === 0) {
        const inviteMsg = data.invite?.sent ? " Invite email sent." : data.invite?.error ? ` Invite failed: ${data.invite.error}` : "";
        toast.success(`Client added — ${data.provision.tables_created.length} tables provisioned.${inviteMsg}`);
      } else {
        toast.warning(`Client added, but ${data.provision.errors.length} table(s) failed to provision. Check details.`);
      }
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Company Name</Label>
            <Input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="bg-background border-border text-foreground text-sm"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Package</Label>
            <Select value={form.packageTier} onValueChange={(v) => setForm({ ...form, packageTier: v as PackageTier })}>
              <SelectTrigger className="bg-background border-border text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {Object.entries(PACKAGE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-sm">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Contact Name</Label>
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="bg-background border-border text-foreground text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-background border-border text-foreground text-sm" />
          </div>
          {/* Send invite checkbox — only shown when email is provided */}
          {form.email && (
            <div className="flex items-center gap-2 py-1">
              <Checkbox
                id="send-invite"
                checked={sendInvite}
                onCheckedChange={(v) => setSendInvite(!!v)}
              />
              <label htmlFor="send-invite" className="text-sm text-foreground cursor-pointer flex items-center gap-1.5">
                <Mail size={13} className="text-muted-foreground" />
                Send portal invite email to client
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground"
              disabled={!form.companyName || upsert.isPending}
              onClick={() => {
                const slugToSubmit = buildUniqueSlug(form.companyName, existingSlugSet);
                upsert.mutate({
                  slug: slugToSubmit,
                  companyName: form.companyName,
                  contactName: form.contactName || undefined,
                  email: form.email || undefined,
                  packageTier: form.packageTier,
                  sendInvite: sendInvite && !!form.email,
                  portalOrigin: window.location.origin,
                });
              }}
            >
              {upsert.isPending ? "Adding…" : "Add Client"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
