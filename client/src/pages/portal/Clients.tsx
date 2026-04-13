import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2, Plus, Users } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField = "client_name" | "package" | "monthly_amount" | "signed_date" | "status" | "tenure_months" | "ltv";
type SortDir = "asc" | "desc";

const PACKAGES = ["Momentum", "Growth 1", "Growth 2", "Accelerate/CFO", "Legacy"];

const PACKAGE_COLORS: Record<string, string> = {
  "Momentum": "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  "Growth 1": "text-blue-400 border-blue-400/40 bg-blue-400/10",
  "Growth 2": "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
  "Accelerate/CFO": "text-amber-400 border-amber-400/40 bg-amber-400/10",
  "Legacy": "text-purple-400 border-purple-400/40 bg-purple-400/10",
};

const fmtDollar = (v: number) =>
  v === 0 ? "$0" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtMonth = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Clients() {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();
  const isAdmin = user?.role === "admin";
  const tenantSlug = impersonatingTenantSlug ?? user?.tenant_slug ?? "";

  const { data: clients = [], refetch } = trpc.roster.list.useQuery(
    { tenantSlug: isAdmin ? tenantSlug : undefined },
    { enabled: !!tenantSlug || isAdmin }
  );

  // ── Filters & Sort ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "churned">("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("client_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let rows = [...clients];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(c =>
        c.client_name.toLowerCase().includes(q) ||
        c.package.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") rows = rows.filter(c => c.status === statusFilter);
    if (packageFilter !== "all") rows = rows.filter(c => c.package === packageFilter);
    rows.sort((a, b) => {
      let av: string | number = a[sortField] ?? "";
      let bv: string | number = b[sortField] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [clients, search, statusFilter, packageFilter, sortField, sortDir]);

  // ── Package summary cards ───────────────────────────────────────────────────
  const packageStats = useMemo(() => {
    return PACKAGES.map(pkg => {
      const pkgClients = clients.filter(c => c.package === pkg && c.status === "active");
      const avgMo = pkgClients.length > 0
        ? pkgClients.reduce((s, c) => s + c.monthly_amount, 0) / pkgClients.length
        : 0;
      const avgTenure = pkgClients.length > 0
        ? pkgClients.reduce((s, c) => s + c.tenure_months, 0) / pkgClients.length
        : 0;
      const avgLtv = pkgClients.length > 0
        ? pkgClients.reduce((s, c) => s + c.ltv, 0) / pkgClients.length
        : 0;
      return { pkg, count: pkgClients.length, avgMo, avgTenure, avgLtv };
    });
  }, [clients]);

  const activeCount = clients.filter(c => c.status === "active").length;
  const totalMrr = clients.filter(c => c.status === "active").reduce((s, c) => s + c.monthly_amount, 0);

  // ── Add/Edit dialog ─────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    clientName: "", package: "Momentum", monthlyAmount: "",
    signedDate: "", status: "active" as "active" | "churned",
    tenureMonths: "", ltv: "", totalIncome: "", notes: "",
  });

  const addMutation = trpc.roster.add.useMutation({
    onSuccess: () => { toast.success("Client added"); setDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.roster.update.useMutation({
    onSuccess: () => { toast.success("Client updated"); setDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.roster.delete.useMutation({
    onSuccess: () => { toast.success("Client removed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({ clientName: "", package: "Momentum", monthlyAmount: "", signedDate: "", status: "active", tenureMonths: "", ltv: "", totalIncome: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: typeof clients[0]) => {
    setEditingId(c.id);
    setForm({
      clientName: c.client_name,
      package: c.package,
      monthlyAmount: String(c.monthly_amount),
      signedDate: c.signed_date ?? "",
      status: c.status,
      tenureMonths: String(c.tenure_months),
      ltv: String(c.ltv),
      totalIncome: String(c.total_income),
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = {
      tenantSlug,
      clientName: form.clientName,
      package: form.package,
      monthlyAmount: Number(form.monthlyAmount) || 0,
      signedDate: form.signedDate || null,
      status: form.status,
      tenureMonths: Number(form.tenureMonths) || 0,
      ltv: Number(form.ltv) || 0,
      totalIncome: Number(form.totalIncome) || 0,
      notes: form.notes || null,
    };
    if (editingId !== null) updateMutation.mutate({ ...payload, id: editingId });
    else addMutation.mutate(payload);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
      : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const ColHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}<SortIcon field={field} />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Roster</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} active client{activeCount !== 1 ? "s" : ""} · {fmtDollar(totalMrr)}/mo MRR
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openAdd} className="bg-primary text-primary-foreground gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Client
          </Button>
        )}
      </div>

      {/* Package summary cards */}
      {packageStats.some(p => p.count > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {packageStats.map(({ pkg, count, avgMo, avgTenure, avgLtv }) => (
            <Card
              key={pkg}
              className={`bg-card border cursor-pointer transition-colors hover:border-primary/40 ${packageFilter === pkg ? "border-primary/60" : "border-border"}`}
              onClick={() => setPackageFilter(packageFilter === pkg ? "all" : pkg)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[pkg] ?? "text-muted-foreground border-border"}`}>
                    {pkg}
                  </span>
                  <span className="text-xs text-muted-foreground">{count} active</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">$ Avg/mo</span>
                    <span className="font-semibold text-foreground">{fmtDollar(Math.round(avgMo))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">⏱ Tenure</span>
                    <span className="font-semibold text-foreground">{avgTenure.toFixed(1)} mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">↗ LTV</span>
                    <span className="font-semibold text-primary">{fmtDollar(Math.round(avgLtv))}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, package, or status..."
          className="pl-9 bg-card border-border"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status filters */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["all", "active", "churned"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Package filters */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setPackageFilter("all")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${packageFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
          >
            All Packages
          </button>
          {PACKAGES.map(pkg => (
            <button
              key={pkg}
              onClick={() => setPackageFilter(packageFilter === pkg ? "all" : pkg)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${packageFilter === pkg ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
            >
              {pkg}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} client{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-3"><ColHeader field="client_name" label="Client" /></th>
                <th className="text-left px-4 py-3"><ColHeader field="package" label="Package" /></th>
                <th className="text-right px-4 py-3"><ColHeader field="monthly_amount" label="Monthly" /></th>
                <th className="text-left px-4 py-3"><ColHeader field="signed_date" label="Signed" /></th>
                <th className="text-left px-4 py-3"><ColHeader field="status" label="Status" /></th>
                <th className="text-right px-4 py-3"><ColHeader field="tenure_months" label="Tenure" /></th>
                <th className="text-right px-4 py-3"><ColHeader field="ltv" label="LTV" /></th>
                {isAdmin && <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="text-center py-12 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No clients found</p>
                    {isAdmin && <p className="text-xs mt-1">Click "+ Add Client" to get started</p>}
                  </td>
                </tr>
              ) : filtered.map((c, i) => (
                <tr key={c.id} className={`border-b border-border/50 hover:bg-muted/10 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{c.client_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Total income: {fmtDollar(c.total_income)}{c.notes ? ` | ${c.notes.slice(0, 30)}${c.notes.length > 30 ? "…" : ""}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[c.package] ?? "text-muted-foreground border-border bg-muted/20"}`}>
                      {c.package}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{fmtDollar(c.monthly_amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtMonth(c.signed_date)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={c.status === "active"
                        ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10 text-xs"
                        : "text-red-400 border-red-400/40 bg-red-400/10 text-xs"}
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{c.tenure_months} mo</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{fmtDollar(c.ltv)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => { if (confirm(`Remove "${c.client_name}"?`)) deleteMutation.mutate({ tenantSlug, id: c.id }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      {isAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId !== null ? "Edit Client" : "Add Client"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Client Name *</Label>
                  <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="e.g. AdGenius LLC" className="bg-background border-border" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Package</Label>
                  <Select value={form.package} onValueChange={v => setForm(f => ({ ...f, package: v }))}>
                    <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PACKAGES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "active" | "churned" }))}>
                    <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Monthly Amount ($)</Label>
                  <Input value={form.monthlyAmount} onChange={e => setForm(f => ({ ...f, monthlyAmount: e.target.value }))} placeholder="875" className="bg-background border-border" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Signed Date</Label>
                  <Input type="date" value={form.signedDate} onChange={e => setForm(f => ({ ...f, signedDate: e.target.value }))} className="bg-background border-border" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Tenure (months)</Label>
                  <Input value={form.tenureMonths} onChange={e => setForm(f => ({ ...f, tenureMonths: e.target.value }))} placeholder="12" className="bg-background border-border" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">LTV ($)</Label>
                  <Input value={form.ltv} onChange={e => setForm(f => ({ ...f, ltv: e.target.value }))} placeholder="10500" className="bg-background border-border" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Total Income ($)</Label>
                  <Input value={form.totalIncome} onChange={e => setForm(f => ({ ...f, totalIncome: e.target.value }))} placeholder="23041.67" className="bg-background border-border" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</Label>
                  <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this client..." className="bg-background border-border min-h-[60px]" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                className="bg-primary text-primary-foreground"
                disabled={!form.clientName.trim() || addMutation.isPending || updateMutation.isPending}
                onClick={handleSave}
              >
                {(addMutation.isPending || updateMutation.isPending) ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
