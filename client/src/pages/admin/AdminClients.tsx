import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Eye, Plus, Search, StickyNote, Users } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { PACKAGE_COLORS, PACKAGE_LABELS, PackageTier } from "../../../../shared/tiers";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";

export default function AdminClients() {
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [ghlDialogOpen, setGhlDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<{ id: number; name: string; notes: string } | null>(null);
  const [ghlNotes, setGhlNotes] = useState("");
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [, navigate] = useLocation();
  const { setImpersonatingTenantId, setEffectiveTier } = usePortal();

  const { data: tenants, isLoading, refetch } = trpc.tenant.list.useQuery();
  const updateGhl = trpc.tenant.updateGhlNotes.useMutation({
    onSuccess: () => { toast.success("GHL notes saved"); setGhlDialogOpen(false); refetch(); },
  });

  const filtered = (tenants ?? []).filter((t) => {
    const matchSearch =
      !search ||
      t.companyName?.toLowerCase().includes(search.toLowerCase()) ||
      t.contactName?.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase());
    const matchTier = filterTier === "all" || t.packageTier === filterTier;
    return matchSearch && matchTier;
  });

  function handleImpersonate(tenant: typeof filtered[0]) {
    setImpersonatingTenantId(tenant.id);
    setEffectiveTier(tenant.packageTier as PackageTier);
    navigate("/portal");
  }

  function openGhlDialog(tenant: typeof filtered[0]) {
    setSelectedTenant({ id: tenant.id, name: tenant.companyName ?? "Client", notes: tenant.ghlNotes ?? "" });
    setGhlNotes(tenant.ghlNotes ?? "");
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
      <div className="flex gap-3">
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
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-sm">All Tiers</SelectItem>
            {Object.entries(PACKAGE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key} className="text-sm">{label}</SelectItem>
            ))}
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
                    <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Signed</th>
                    <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">{tenant.companyName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{tenant.email ?? ""}</p>
                      </td>
                      <td className="px-5 py-3 text-foreground">{tenant.contactName ?? "—"}</td>
                      <td className="px-5 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${PACKAGE_COLORS[tenant.packageTier as PackageTier]}`}
                        >
                          {PACKAGE_LABELS[tenant.packageTier as PackageTier]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs ${tenant.isActive ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}
                        >
                          {tenant.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {new Date(tenant.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground hover:text-primary gap-1"
                            onClick={() => handleImpersonate(tenant)}
                          >
                            <Eye size={13} />
                            View as
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-400 gap-1"
                            onClick={() => openGhlDialog(tenant)}
                          >
                            <StickyNote size={13} />
                            GHL Notes
                          </Button>
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
                onClick={() => selectedTenant && updateGhl.mutate({ tenantId: selectedTenant.id, notes: ghlNotes })}
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

function AddClientDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    userId: "",
    companyName: "",
    contactName: "",
    email: "",
    packageTier: "legacy" as PackageTier,
  });

  const upsert = trpc.tenant.upsert.useMutation({
    onSuccess: () => { toast.success("Client added successfully"); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">User ID *</Label>
              <Input
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                placeholder="User ID from DB"
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
          </div>
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
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground"
              disabled={!form.userId || upsert.isPending}
              onClick={() => upsert.mutate({ ...form, userId: Number(form.userId) })}
            >
              {upsert.isPending ? "Adding…" : "Add Client"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
