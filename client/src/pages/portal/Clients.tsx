import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2, Plus, Users, Eye, X, Building2, BriefcaseBusiness, CalendarDays, DollarSign, Clock3, TrendingUp, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField = "client_name" | "package" | "monthly_amount" | "signed_date" | "status" | "tenure_months" | "ltv";

const toDisplayServiceName = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return trimmed;
  if (/[A-Z]/.test(trimmed)) return trimmed;
  return trimmed.replace(/\b([a-z])/g, (m) => m.toUpperCase());
};
type SortDir = "asc" | "desc";

// Grit Media Group LLC service packages with default monthly amounts
const PACKAGES: { name: string; defaultAmount: number }[] = [
  { name: "Video Production", defaultAmount: 14400 },
  { name: "Social Media", defaultAmount: 8833 },
  { name: "Brand Strategy", defaultAmount: 5233 },
  { name: "Content + Photo", defaultAmount: 3000 },
  { name: "Full Service", defaultAmount: 31466 },
];


const MAX_SERVICE_NAME_LENGTH = 100;
const MAX_SERVICES_PER_CLIENT = 50;
const MAX_SERVICE_MONTHLY_AMOUNT = 1_000_000_000;

const PACKAGE_COLORS: Record<string, string> = {
  "Video Production":  "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  "Social Media":      "text-blue-400 border-blue-400/40 bg-blue-400/10",
  "Brand Strategy":    "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
  "Content + Photo":   "text-amber-400 border-amber-400/40 bg-amber-400/10",
  "Full Service":      "text-purple-400 border-purple-400/40 bg-purple-400/10",
};

const canonicalServiceKey = (value: string) => value.trim().toLocaleLowerCase();

type ServiceStatus = "active" | "inactive" | "churned";
type StaffServiceRecord = {
  name: string;
  monthlyAmount: number;
  startDate: string;
  status: ServiceStatus;
};

const fmtDollar = (v: number) =>
  v === 0 ? "$0" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtMonth = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const calcTenureMonths = (startDate: string | null) => {
  if (!startDate) return 0;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return diffMs / (1000 * 60 * 60 * 24 * 30.4375);
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Clients() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { impersonatingTenantSlug, setImpersonatingTenantSlug, setEffectiveTier } = usePortal();

  const isAdmin = user?.role === "admin";
  const isStaff = !!user && ["accounting_manager", "tax_manager", "accountant"].includes(user.role);
  const isImpersonatingClient = !!impersonatingTenantSlug;

  // Impersonation context takes precedence over base role:
  // - impersonating => client perspective
  // - otherwise staff => accountant roster
  // - everyone else => client perspective
  const portalClientsMode: "staff-roster" | "client-perspective" =
    isImpersonatingClient ? "client-perspective" : isStaff ? "staff-roster" : "client-perspective";

  const isStaffRosterMode = portalClientsMode === "staff-roster";
  const tenantSlug = impersonatingTenantSlug ?? user?.tenant_slug ?? "";

  const { data: tenants = [] } = trpc.tenant.list.useQuery(undefined, {
    enabled: isAdmin || isStaff,
  });

  const { data: clients = [], refetch } = trpc.roster.list.useQuery(
    {
      // In staff roster mode, use assignment-scoped backend aggregation.
      // In impersonation mode (or admin/client), scope to the active tenant context.
      tenantSlug: (isStaffRosterMode ? undefined : (tenantSlug || undefined)),
    },
    {
      enabled: isStaffRosterMode ? true : (!!tenantSlug || isAdmin),
    }
  );

  const assignedTenantSlugs = useMemo(() => new Set(tenants.map((t) => t.slug)), [tenants]);

  const clientsWithTenant = useMemo(
    () => clients as Array<(typeof clients)[number] & {
      tenant_slug?: string | null;
      services?: string[] | null;
      service_records?: StaffServiceRecord[] | null;
      roster_entry_id?: number | null;
    }>,
    [clients],
  );

  useEffect(() => {
    if (isStaff) {
      const assigned = tenants.map((t) => t.slug);
      console.log("[StaffAssignedClients]", tenants.map((t) => ({ slug: t.slug, company: t.company_name })));
      console.log("[PortalClientsScope]", {
        role: user?.role,
        mode: portalClientsMode,
        impersonatingTenantSlug,
        tenantSlug,
        assignedTenantSlugs: assigned,
        roster: clients,
      });
    }
  }, [isStaff, isStaffRosterMode, impersonatingTenantSlug, tenantSlug, tenants, clients, user?.role]);

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

  const normalizedRows = useMemo(() => {
    return clientsWithTenant.map((c) => {
      const incomingServiceRecords = Array.isArray(c.service_records) ? c.service_records : [];
      const normalizedServiceRecords = incomingServiceRecords
        .map((r) => {
          const name = String(r?.name || "").trim();
          const monthlyAmount = Number.isFinite(Number(r?.monthlyAmount)) ? Number(r?.monthlyAmount) : 0;
          const startDate = r?.startDate ? String(r.startDate) : new Date().toISOString().slice(0, 10);
          const status: ServiceStatus = (r?.status === "inactive" || r?.status === "churned") ? r.status : "active";
          if (!name) return null;
          return { name, monthlyAmount, startDate, status } satisfies StaffServiceRecord;
        })
        .filter((r): r is StaffServiceRecord => !!r);

      const byKey = new Map<string, StaffServiceRecord>();
      for (const record of normalizedServiceRecords) {
        const key = canonicalServiceKey(record.name);
        if (!key || byKey.has(key)) continue;
        byKey.set(key, record);
      }

      const dedupedRecords = Array.from(byKey.values());

      const safeServices = dedupedRecords.length
        ? dedupedRecords.map((r) => toDisplayServiceName(r.name))
        : (
          isStaffRosterMode
            ? (Array.isArray(c.services) ? c.services : [])
            : ([...(Array.isArray(c.services) ? c.services : []), String(c.package || "")])
        )
          .map((s) => String(s).trim())
          .filter(Boolean);

      return {
        ...c,
        services: safeServices,
        service_records: dedupedRecords,
        package: safeServices.join(" • "),
      };
    });
  }, [clientsWithTenant, isStaffRosterMode]);

  const dynamicServiceOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of normalizedRows) {
      for (const service of row.services || []) {
        const trimmed = String(service || "").trim();
        if (!trimmed) continue;
        const key = canonicalServiceKey(trimmed);
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, trimmed);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [normalizedRows]);

  const staffServiceCardStats = useMemo(() => {
    if (!isStaffRosterMode) return [] as Array<{ name: string; activeCount: number; avgMo: number; avgTenure: number; avgLtv: number }>;

    const bucket = new Map<string, {
      name: string;
      activeCount: number;
      monthlyTotal: number;
      tenureTotal: number;
      ltvTotal: number;
    }>();

    for (const row of normalizedRows) {
      const records = Array.isArray(row.service_records) ? row.service_records : [];
      for (const rec of records) {
        const key = canonicalServiceKey(rec.name);
        if (!key) continue;

        const existing = bucket.get(key) ?? {
          name: rec.name,
          activeCount: 0,
          monthlyTotal: 0,
          tenureTotal: 0,
          ltvTotal: 0,
        };

        if (rec.status === "active") {
          const tenureMonths = calcTenureMonths(rec.startDate);
          const monthly = Number.isFinite(Number(rec.monthlyAmount)) ? Number(rec.monthlyAmount) : 0;
          const perAssignmentLtv = monthly * tenureMonths;

          existing.activeCount += 1;
          existing.monthlyTotal += monthly;
          existing.tenureTotal += tenureMonths;
          existing.ltvTotal += perAssignmentLtv;
        }

        bucket.set(key, existing);
      }
    }

    return Array.from(bucket.values())
      .map((s) => ({
        name: s.name,
        activeCount: s.activeCount,
        avgMo: s.activeCount > 0 ? s.monthlyTotal / s.activeCount : 0,
        avgTenure: s.activeCount > 0 ? s.tenureTotal / s.activeCount : 0,
        avgLtv: s.activeCount > 0 ? s.ltvTotal / s.activeCount : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isStaffRosterMode, normalizedRows]);

  const filtered = useMemo(() => {
    let rows = [...normalizedRows];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(c =>
        c.client_name.toLowerCase().includes(q) ||
        c.package.toLowerCase().includes(q) ||
        c.services.some((s) => s.toLowerCase().includes(q)) ||
        c.status.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") rows = rows.filter(c => c.status === statusFilter);
    if (packageFilter !== "all") {
      const wanted = canonicalServiceKey(packageFilter);
      rows = rows.filter(c => c.services.some((s) => canonicalServiceKey(s) === wanted));
    }
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
  }, [normalizedRows, search, statusFilter, packageFilter, sortField, sortDir]);

  // ── Package summary cards ───────────────────────────────────────────────────
  const clientViewServiceCards = useMemo(() => {
    if (isStaffRosterMode) return [] as StaffServiceRecord[];

    const rows = normalizedRows;
    if (!rows.length) return [] as StaffServiceRecord[];

    // In client-perspective mode we scope cards to the selected tenant context only.
    // For view-as and regular client users this should be a single tenant.
    const byKey = new Map<string, StaffServiceRecord>();
    for (const row of rows) {
      const records = Array.isArray(row.service_records) ? row.service_records : [];
      for (const rec of records) {
        const key = canonicalServiceKey(rec.name);
        if (!key || byKey.has(key)) continue;
        byKey.set(key, rec);
      }
    }

    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isStaffRosterMode, normalizedRows]);

  const activeCount = normalizedRows.filter(c => c.status === "active").length;
  const totalMrr = normalizedRows.filter(c => c.status === "active").reduce((s, c) => s + c.monthly_amount, 0);

  // ── Add/Edit dialog — available to ALL users (client + admin) ───────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    clientName: "",
    package: "Video Production",
    monthlyAmount: String(PACKAGES[0].defaultAmount),
    signedDate: "",
    status: "active" as "active" | "churned",
    tenureMonths: "",
    ltv: "",
    totalIncome: "",
    notes: "",
  });

  // Auto-fill monthly amount when package changes
  const handlePackageChange = (pkg: string) => {
    const found = PACKAGES.find(p => p.name === pkg);
    setForm(f => ({
      ...f,
      package: pkg,
      // Only auto-fill if the user hasn't manually changed the amount
      monthlyAmount: found ? String(found.defaultAmount) : f.monthlyAmount,
    }));
  };

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

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<(typeof normalizedRows)[number] | null>(null);
  const [selectedServices, setSelectedServices] = useState<StaffServiceRecord[]>([]);
  const [editingServiceKey, setEditingServiceKey] = useState<string | null>(null);
  const [serviceInputError, setServiceInputError] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<StaffServiceRecord>({
    name: "",
    monthlyAmount: 0,
    startDate: new Date().toISOString().slice(0, 10),
    status: "active",
  });

  const updateServicesMutation = trpc.roster.updateServices.useMutation({
    onSuccess: () => {
      toast.success("Services updated");
      setDetailsOpen(false);
      setSelectedClient(null);
      setSelectedServices([]);
      setEditingServiceKey(null);
      setServiceInputError(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetServiceDraft = () => {
    setServiceDraft({
      name: "",
      monthlyAmount: 0,
      startDate: new Date().toISOString().slice(0, 10),
      status: "active",
    });
    setEditingServiceKey(null);
  };

  const openDetails = (client: (typeof normalizedRows)[number]) => {
    setSelectedClient(client);

    const incomingRecords = Array.isArray(client.service_records) ? client.service_records : [];
    const deduped = new Map<string, StaffServiceRecord>();
    for (const rec of incomingRecords) {
      const name = String(rec?.name || "").trim();
      if (!name) continue;
      const key = canonicalServiceKey(name);
      if (deduped.has(key)) continue;
      deduped.set(key, {
        name,
        monthlyAmount: Number.isFinite(Number(rec?.monthlyAmount)) ? Number(rec?.monthlyAmount) : 0,
        startDate: rec?.startDate ? String(rec.startDate) : new Date().toISOString().slice(0, 10),
        status: rec?.status === "inactive" || rec?.status === "churned" ? rec.status : "active",
      });
    }

    setSelectedServices(Array.from(deduped.values()));
    resetServiceDraft();
    setServiceInputError(null);
    setDetailsOpen(true);
  };

  const removeSelectedService = (serviceName: string) => {
    const key = canonicalServiceKey(serviceName);
    setSelectedServices((prev) => prev.filter((s) => canonicalServiceKey(s.name) !== key));
    if (editingServiceKey === key) resetServiceDraft();
  };

  const editSelectedService = (serviceName: string) => {
    const key = canonicalServiceKey(serviceName);
    const found = selectedServices.find((s) => canonicalServiceKey(s.name) === key);
    if (!found) return;
    setEditingServiceKey(key);
    setServiceDraft({ ...found });
    setServiceInputError(null);
  };

  const addOrUpdateService = () => {
    const trimmed = serviceDraft.name.trim();

    if (!trimmed) {
      setServiceInputError("Service name is required.");
      return;
    }
    if (trimmed.length > MAX_SERVICE_NAME_LENGTH) {
      setServiceInputError(`Service name must be ${MAX_SERVICE_NAME_LENGTH} characters or fewer.`);
      return;
    }

    const amount = Number(serviceDraft.monthlyAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setServiceInputError("Monthly amount must be a valid number greater than or equal to 0.");
      return;
    }
    if (amount > MAX_SERVICE_MONTHLY_AMOUNT) {
      setServiceInputError(`Monthly amount must be ${fmtDollar(MAX_SERVICE_MONTHLY_AMOUNT)} or less.`);
      return;
    }

    const startDate = String(serviceDraft.startDate || "").trim();
    const parsed = new Date(startDate);
    if (!startDate || Number.isNaN(parsed.getTime())) {
      setServiceInputError("Start date is required.");
      return;
    }
    if (parsed.getTime() > Date.now()) {
      setServiceInputError("Start date cannot be in the future.");
      return;
    }

    const key = canonicalServiceKey(trimmed);
    const dup = selectedServices.find((s) => canonicalServiceKey(s.name) === key);
    if (dup && editingServiceKey !== key) {
      setServiceInputError("That service is already added.");
      return;
    }

    const nextRecord: StaffServiceRecord = {
      name: trimmed,
      monthlyAmount: Math.round(amount * 100) / 100,
      startDate: parsed.toISOString().slice(0, 10),
      status: serviceDraft.status,
    };

    setSelectedServices((prev) => {
      if (editingServiceKey) {
        return prev.map((s) => canonicalServiceKey(s.name) === editingServiceKey ? nextRecord : s);
      }
      if (prev.length >= MAX_SERVICES_PER_CLIENT) {
        setServiceInputError(`A maximum of ${MAX_SERVICES_PER_CLIENT} services is allowed.`);
        return prev;
      }
      return [...prev, nextRecord];
    });

    setServiceInputError(null);
    resetServiceDraft();
  };

  const normalizedOriginalServicesForDialog = useMemo(() => {
    if (!selectedClient) return [] as StaffServiceRecord[];
    const records = Array.isArray(selectedClient.service_records) ? selectedClient.service_records : [];
    return records
      .map((s): StaffServiceRecord => ({
        name: String(s.name || "").trim(),
        monthlyAmount: Number(s.monthlyAmount || 0),
        startDate: s.startDate ? String(s.startDate) : new Date().toISOString().slice(0, 10),
        status: s.status === "inactive" || s.status === "churned" ? s.status : "active",
      }))
      .filter((s) => !!s.name);
  }, [selectedClient]);

  const hasServiceChanges = useMemo(() => {
    const normalize = (arr: StaffServiceRecord[]) =>
      arr
        .map((s) => ({
          key: canonicalServiceKey(s.name),
          monthlyAmount: Math.round(Number(s.monthlyAmount || 0) * 100) / 100,
          startDate: String(s.startDate || ""),
          status: s.status,
        }))
        .filter((s) => s.key)
        .sort((a, b) => a.key.localeCompare(b.key));

    const a = normalize(normalizedOriginalServicesForDialog);
    const b = normalize(selectedServices);
    if (a.length !== b.length) return true;
    return a.some((v, i) =>
      v.key !== b[i].key || v.monthlyAmount !== b[i].monthlyAmount || v.startDate !== b[i].startDate || v.status !== b[i].status,
    );
  }, [normalizedOriginalServicesForDialog, selectedServices]);

  const handleSaveServices = () => {
    if (!selectedClient?.tenant_slug) {
      toast.error("Missing tenant context for this client");
      return;
    }

    updateServicesMutation.mutate({
      tenantSlug: selectedClient.tenant_slug,
      rosterEntryId: selectedClient.roster_entry_id ?? null,
      clientName: selectedClient.client_name,
      services: selectedServices.map((s) => ({
        name: s.name,
        monthlyAmount: Math.round(Number(s.monthlyAmount || 0) * 100) / 100,
        startDate: s.startDate || new Date().toISOString().slice(0, 10),
        status: s.status,
      })),
    });
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({
      clientName: "",
      package: "Video Production",
      monthlyAmount: String(PACKAGES[0].defaultAmount),
      signedDate: "",
      status: "active",
      tenureMonths: "",
      ltv: "",
      totalIncome: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (c: (typeof clientsWithTenant)[number]) => {
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
      tenantSlug: tenantSlug || undefined,
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

  const handleStartViewAsClient = async (slug: string) => {
    try {
      const res = await fetch("/api/auth/view-as-client/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantSlug: slug }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to start View as Client");
      }
      setImpersonatingTenantSlug(slug ?? null);
      const matchedTenant = tenants.find((t) => t.slug === slug);
      if (matchedTenant?.package_tier) setEffectiveTier(matchedTenant.package_tier as any);
      navigate("/portal");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start View as Client");
    }
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Roster</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} active client{activeCount !== 1 ? "s" : ""}
            {totalMrr > 0 && ` · ${fmtDollar(totalMrr)}/mo MRR`}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openAdd} className="bg-primary text-primary-foreground gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Client
          </Button>
        )}
      </div>

      {/* Summary cards */}
      {!isStaffRosterMode && (
        clientViewServiceCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clientViewServiceCards.map((service) => {
              const tenure = calcTenureMonths(service.startDate);
              const ltv = service.monthlyAmount * tenure;
              const statusClass = service.status === "active"
                ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
                : service.status === "churned"
                  ? "text-red-300 border-red-500/40 bg-red-500/10"
                  : "text-muted-foreground border-border bg-muted/20";
              const displayServiceName = toDisplayServiceName(service.name);

              return (
                <Card key={service.name} className="bg-card border-border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[displayServiceName] ?? "text-muted-foreground border-border"}`}>
                        {displayServiceName}
                      </span>
                      <Badge variant="outline" className={`text-[11px] capitalize ${statusClass}`}>
                        {service.status}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Monthly</span>
                        <span className="font-semibold text-foreground">{fmtDollar(Math.round(service.monthlyAmount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tenure</span>
                        <span className="font-semibold text-foreground">{tenure.toFixed(1)} mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">LTV</span>
                        <span className="font-semibold text-primary">{fmtDollar(Math.round(ltv))}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground/90">No services assigned yet</p>
              <p className="text-xs mt-1">Services added by the accountant will appear here.</p>
            </CardContent>
          </Card>
        )
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, service, or status..."
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

        {/* Package/service filters */}
        {(dynamicServiceOptions.length > 0) && (
          <div className="flex flex-wrap rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setPackageFilter("all")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${packageFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
            >
              All Services
            </button>
            {dynamicServiceOptions.map((pkg) => (
              <button
                key={pkg}
                onClick={() => setPackageFilter(packageFilter === pkg ? "all" : pkg)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${packageFilter === pkg ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
              >
                {pkg}
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} client{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table / list */}
      {isStaffRosterMode ? (
        <>
          {/* Desktop/Tablet Table */}
          <Card className="bg-card border-border overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-3 w-[34%]"><ColHeader field="client_name" label="Client" /></th>
                    <th className="text-left px-4 py-3 w-[40%]"><ColHeader field="package" label="Assigned Services" /></th>
                    <th className="text-left px-4 py-3 w-[12%]"><ColHeader field="status" label="Status" /></th>
                    <th className="text-right px-4 py-3 w-[14%] text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-muted-foreground">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No clients yet</p>
                        <p className="text-xs mt-1">Assigned clients will appear here.</p>
                      </td>
                    </tr>
                  ) : filtered.map((c, i) => (
                    <tr key={c.id} className={`border-b border-border/50 hover:bg-muted/10 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-foreground">{c.client_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.notes ? `${c.notes.slice(0, 46)}${c.notes.length > 46 ? "…" : ""}` : "Assigned client"}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {c.services.length > 0 ? (() => {
                          const shown = c.services.slice(0, 2).map(toDisplayServiceName);
                          const extra = c.services.length - shown.length;
                          const fullList = c.services.map(toDisplayServiceName).join(", ");
                          return (
                            <div className="flex flex-wrap gap-1" title={fullList} aria-label={`Services: ${fullList}`}>
                              {shown.map((service) => (
                                <span
                                  key={`${c.id}-${service}`}
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[service] ?? "text-muted-foreground border-border bg-muted/20"}`}
                                >
                                  {service}
                                </span>
                              ))}
                              {extra > 0 && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-muted-foreground border-border bg-muted/20">
                                  +{extra} more
                                </span>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground">No services assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge
                          variant="outline"
                          className={c.status === "active"
                            ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10 text-xs"
                            : "text-red-400 border-red-400/40 bg-red-400/10 text-xs"}
                        >
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.tenant_slug && assignedTenantSlugs.has(c.tenant_slug) && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2.5 text-xs text-cyan-300 hover:text-cyan-200"
                                onClick={() => openDetails(c)}
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                                Details
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2.5 text-xs text-primary hover:text-primary gap-1"
                                onClick={() => c.tenant_slug && handleStartViewAsClient(c.tenant_slug)}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View as
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filtered.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No clients yet</p>
                  <p className="text-xs mt-1">Assigned clients will appear here.</p>
                </CardContent>
              </Card>
            ) : filtered.map((c) => {
              const shown = c.services.slice(0, 2).map(toDisplayServiceName);
              const extra = c.services.length - shown.length;
              const fullList = c.services.map(toDisplayServiceName).join(", ");
              return (
                <Card key={c.id} className="bg-card border-border">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground break-words">{c.client_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {c.notes ? `${c.notes.slice(0, 84)}${c.notes.length > 84 ? "…" : ""}` : "Assigned client"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Assigned Services</p>
                      {c.services.length > 0 ? (
                        <div className="flex flex-wrap gap-1" title={fullList} aria-label={`Services: ${fullList}`}>
                          {shown.map((service) => (
                            <span
                              key={`${c.id}-${service}`}
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[service] ?? "text-muted-foreground border-border bg-muted/20"}`}
                            >
                              {service}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-muted-foreground border-border bg-muted/20">
                              +{extra} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No services assigned</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Status</p>
                      <Badge
                        variant="outline"
                        className={c.status === "active"
                          ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10 text-xs"
                          : "text-red-400 border-red-400/40 bg-red-400/10 text-xs"}
                      >
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {c.tenant_slug && assignedTenantSlugs.has(c.tenant_slug) && (
                        <>
                          <Button
                            variant="outline"
                            className="h-10 w-full justify-center"
                            onClick={() => openDetails(c)}
                          >
                            <SlidersHorizontal className="w-4 h-4 mr-2" />
                            Details
                          </Button>
                          <Button
                            className="h-10 w-full justify-center"
                            onClick={() => c.tenant_slug && handleStartViewAsClient(c.tenant_slug)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View as
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-3"><ColHeader field="client_name" label="Client" /></th>
                  <th className="text-left px-4 py-3"><ColHeader field="package" label="Service" /></th>
                  <th className="text-right px-4 py-3"><ColHeader field="monthly_amount" label="Monthly" /></th>
                  <th className="text-left px-4 py-3"><ColHeader field="signed_date" label="Signed" /></th>
                  <th className="text-left px-4 py-3"><ColHeader field="status" label="Status" /></th>
                  <th className="text-right px-4 py-3"><ColHeader field="tenure_months" label="Tenure" /></th>
                  <th className="text-right px-4 py-3"><ColHeader field="ltv" label="LTV" /></th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No clients yet</p>
                      <p className="text-xs mt-1">No client records available for this tenant yet.</p>
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
                      {c.services.length > 0 ? (() => {
                        const shown = c.services.slice(0, 2).map(toDisplayServiceName);
                        const extra = c.services.length - shown.length;
                        const fullList = c.services.map(toDisplayServiceName).join(", ");
                        return (
                          <div className="flex flex-wrap gap-1 justify-start" title={fullList} aria-label={`Services: ${fullList}`}>
                            {shown.map((service) => (
                              <span
                                key={`${c.id}-${service}`}
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[service] ?? "text-muted-foreground border-border bg-muted/20"}`}
                              >
                                {service}
                              </span>
                            ))}
                            {extra > 0 && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-muted-foreground border-border bg-muted/20">
                                +{extra} more
                              </span>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(c)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => { if (confirm(`Remove "${c.client_name}"?`)) deleteMutation.mutate({ tenantSlug: tenantSlug || undefined, id: c.id }); }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Staff Details Dialog — accountant/staff roster only */}
      {isStaffRosterMode && (
        <Dialog open={detailsOpen} onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedClient(null);
            setSelectedServices([]);
            setEditingServiceKey(null);
            setServiceInputError(null);
            resetServiceDraft();
          }
        }}>
          <DialogContent className="bg-card border-border w-[95vw] sm:w-[92vw] max-w-[740px] max-h-[92vh] overflow-hidden p-0">
            <DialogHeader className="px-5 sm:px-6 pt-5 pb-4 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Building2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                Client Details
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Manage services assigned to {selectedClient?.client_name ?? "Client"}
              </DialogDescription>
            </DialogHeader>

            <div className="px-5 sm:px-6 py-4 space-y-5 overflow-y-auto max-h-[calc(92vh-150px)]">
              <section className="rounded-lg border border-border bg-background/40 p-4 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold px-1.5">1</span>
                    <h3 className="text-sm font-semibold text-foreground">{editingServiceKey ? "Edit Service" : "Add or Edit Service"}</h3>
                    {editingServiceKey && (
                      <Badge variant="outline" className="text-[11px] border-cyan-500/40 text-cyan-300 bg-cyan-500/10">Editing</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Add a new service or update an existing service for this client.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Service name</Label>
                    <Input
                      value={serviceDraft.name}
                      onChange={(e) => {
                        setServiceDraft((prev) => ({ ...prev, name: e.target.value }));
                        if (serviceInputError) setServiceInputError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addOrUpdateService();
                        }
                      }}
                      placeholder="Enter a service name"
                      maxLength={MAX_SERVICE_NAME_LENGTH}
                      className="bg-background border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Monthly amount</Label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={Number.isFinite(Number(serviceDraft.monthlyAmount)) ? serviceDraft.monthlyAmount : 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const bounded = Number.isFinite(val) ? Math.max(0, Math.min(MAX_SERVICE_MONTHLY_AMOUNT, val)) : 0;
                          setServiceDraft((prev) => ({ ...prev, monthlyAmount: bounded }));
                          if (serviceInputError) setServiceInputError(null);
                        }}
                        placeholder="0.00"
                        className="bg-background border-border pl-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Start date</Label>
                    <div className="relative">
                      <CalendarDays className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                      <Input
                        type="date"
                        value={serviceDraft.startDate ?? ""}
                        onChange={(e) => {
                          setServiceDraft((prev) => ({ ...prev, startDate: e.target.value }));
                          if (serviceInputError) setServiceInputError(null);
                        }}
                        className="bg-background border-border pl-9"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
                    <Select
                      value={serviceDraft.status}
                      onValueChange={(v) => setServiceDraft((prev) => ({ ...prev, status: v as ServiceStatus }))}
                    >
                      <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="churned">Churned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-2 flex flex-col sm:flex-row gap-2 sm:justify-end">
                    {editingServiceKey && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full sm:w-auto"
                        onClick={() => {
                          resetServiceDraft();
                          setServiceInputError(null);
                        }}
                        disabled={updateServicesMutation.isPending}
                      >
                        Cancel Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="h-10 w-full sm:w-auto"
                      variant="secondary"
                      onClick={addOrUpdateService}
                      disabled={updateServicesMutation.isPending}
                    >
                      {editingServiceKey ? "Update Service" : "Add Service"}
                    </Button>
                  </div>
                </div>

                {serviceInputError && (
                  <p className="text-xs text-red-400 mt-1">{serviceInputError}</p>
                )}
              </section>

              <section className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold px-1.5">2</span>
                      <h3 className="text-sm font-semibold text-foreground">Assigned Services</h3>
                    </div>
                    <Badge variant="outline" className="text-[11px] text-muted-foreground border-border">
                      {selectedServices.length === 0 ? "No services" : selectedServices.length === 1 ? "1 service" : `${selectedServices.length} services`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">These are the services this client is currently receiving.</p>
                  <p className="text-xs text-muted-foreground">Changes are saved only after clicking Save Services.</p>
                </div>

                {selectedServices.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground/90">No services assigned yet</p>
                    <p className="text-xs mt-1">Add the first service using the form above.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                    {selectedServices.map((service) => {
                      const tenure = calcTenureMonths(service.startDate);
                      const serviceLtv = service.monthlyAmount * tenure;
                      const statusClass = service.status === "active"
                        ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
                        : service.status === "churned"
                          ? "text-red-300 border-red-500/40 bg-red-500/10"
                          : "text-muted-foreground border-border bg-muted/20";
                      return (
                        <article
                          key={canonicalServiceKey(service.name)}
                          className="rounded-md border border-border bg-card/50 p-3 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2">
                              <BriefcaseBusiness className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                              <p className="text-sm font-medium text-foreground break-words">{service.name}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge variant="outline" className={`text-[11px] capitalize ${statusClass}`}>
                                {service.status}
                              </Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => editSelectedService(service.name)}
                                disabled={updateServicesMutation.isPending}
                                aria-label={`Edit ${service.name}`}
                                title={`Edit ${service.name}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeSelectedService(service.name)}
                                disabled={updateServicesMutation.isPending}
                                aria-label={`Remove ${service.name}`}
                                title={`Remove ${service.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            <div className="rounded-md border border-border/70 px-2.5 py-2">
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />Monthly Amount</div>
                              <div className="text-sm font-medium text-foreground">{fmtDollar(service.monthlyAmount)} <span className="text-xs text-muted-foreground">/mo</span></div>
                            </div>
                            <div className="rounded-md border border-border/70 px-2.5 py-2">
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3" />Start Date</div>
                              <div className="text-sm font-medium text-foreground">{service.startDate ? new Date(service.startDate).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—"}</div>
                            </div>
                            <div className="rounded-md border border-border/70 px-2.5 py-2">
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock3 className="w-3 h-3" />Tenure</div>
                              <div className="text-sm font-medium text-foreground">{tenure.toFixed(1)} mo</div>
                            </div>
                            <div className="rounded-md border border-border/70 px-2.5 py-2">
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" />LTV</div>
                              <div className="text-sm font-medium text-foreground">{fmtDollar(Math.round(serviceLtv))}</div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <DialogFooter className="px-5 sm:px-6 py-4 border-t border-border bg-card sticky bottom-0 flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDetailsOpen(false);
                  setSelectedClient(null);
                  setSelectedServices([]);
                  setEditingServiceKey(null);
                  setServiceInputError(null);
                  resetServiceDraft();
                }}
                disabled={updateServicesMutation.isPending}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground w-full sm:w-auto"
                onClick={handleSaveServices}
                disabled={updateServicesMutation.isPending || !selectedClient || !hasServiceChanges}
              >
                {updateServicesMutation.isPending ? "Saving…" : "Save Services"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add/Edit Dialog — admin only */}
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
                <Input
                  value={form.clientName}
                  onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                  placeholder="e.g. Acme Media Co."
                  className="bg-background border-border"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Service Package</Label>
                <Select value={form.package} onValueChange={handlePackageChange}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PACKAGES.map(p => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name} <span className="text-muted-foreground ml-1">({fmtDollar(p.defaultAmount)}/mo)</span>
                      </SelectItem>
                    ))}
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
                <Input
                  value={form.monthlyAmount}
                  onChange={e => setForm(f => ({ ...f, monthlyAmount: e.target.value }))}
                  placeholder="14400"
                  className="bg-background border-border"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Signed Date</Label>
                <Input
                  type="date"
                  value={form.signedDate}
                  onChange={e => setForm(f => ({ ...f, signedDate: e.target.value }))}
                  className="bg-background border-border"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Tenure (months)</Label>
                <Input
                  value={form.tenureMonths}
                  onChange={e => setForm(f => ({ ...f, tenureMonths: e.target.value }))}
                  placeholder="12"
                  className="bg-background border-border"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">LTV ($)</Label>
                <Input
                  value={form.ltv}
                  onChange={e => setForm(f => ({ ...f, ltv: e.target.value }))}
                  placeholder="172800"
                  className="bg-background border-border"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Total Income ($)</Label>
                <Input
                  value={form.totalIncome}
                  onChange={e => setForm(f => ({ ...f, totalIncome: e.target.value }))}
                  placeholder="43200"
                  className="bg-background border-border"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes about this client..."
                  className="bg-background border-border min-h-[60px]"
                />
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
