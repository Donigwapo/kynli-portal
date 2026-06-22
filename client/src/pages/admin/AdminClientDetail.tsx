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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { PACKAGE_COLORS, PACKAGE_LABELS, PackageTier } from "../../../../shared/tiers";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";


function initials(name?: string | null, email?: string | null) {
  const base = (name && name.trim()) || (email && email.trim()) || "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function roleLabel(role: string) {
  switch (role) {
    case "admin":
      return "Admin";
    case "accounting_manager":
      return "Accounting Manager";
    case "tax_manager":
      return "Tax Manager";
    case "accountant":
      return "Accountant";
    case "client":
      return "Client";
    default:
      return role;
  }
}

export default function AdminClientDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { setImpersonatingTenantSlug, setEffectiveTier } = usePortal();

  const { data: tenant, isLoading, refetch } = trpc.tenant.getBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug },
  );

  const membersQuery = trpc.tenant.members.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug },
  );

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    packageTier: "legacy" as PackageTier,
    isActive: true,
  });

  const utils = trpc.useUtils();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({
    fullName: "",
    email: "",
    title: "",
  });

  const archiveMutation = trpc.tenant.archive.useMutation({
    onSuccess: () => {
      toast.success("Client archived — status set to Churned.");
      refetch();
      utils.tenant.list.invalidate();
    },
    onError: (e) => toast.error(`Archive failed: ${e.message}`),
  });

  const restoreMutation = trpc.tenant.restore.useMutation({
    onSuccess: () => {
      toast.success("Client restored — status set to Active.");
      refetch();
      utils.tenant.list.invalidate();
    },
    onError: (e) => toast.error(`Restore failed: ${e.message}`),
  });

  const deleteMutation = trpc.tenant.delete.useMutation({
    onSuccess: () => {
      toast.success("Client permanently deleted.");
      navigate("/admin/clients");
    },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  const upsert = trpc.tenant.upsert.useMutation({
    onSuccess: () => {
      toast.success("Client updated");
      setEditMode(false);
      refetch();
      utils.tenant.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendInvite = trpc.tenant.sendInvite.useMutation({
    onSuccess: () => {
      toast.success("Invite email sent successfully");
      refetch();
      membersQuery.refetch();
    },
    onError: (e) => toast.error(`Failed to send invite: ${e.message}`),
  });

  const addMember = trpc.tenant.addMember.useMutation({
    onSuccess: (res) => {
      toast.success("Member invited successfully");
      setMemberDialogOpen(false);
      setMemberForm({
        fullName: "",
        email: "",
        title: "",
      });
      membersQuery.refetch();
    },
    onError: (e) => toast.error(`Failed to add member: ${e.message}`),
  });

  const resendMemberInvite = trpc.tenant.resendMemberInvite.useMutation({
    onSuccess: () => {
      toast.success("Invite resent");
      membersQuery.refetch();
    },
    onError: (e) => toast.error(`Failed to resend invite: ${e.message}`),
  });

  const removeMember = trpc.tenant.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed from this client");
      membersQuery.refetch();
    },
    onError: (e) => toast.error(`Failed to remove member: ${e.message}`),
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

  async function handleImpersonate() {
    if (!tenant) return;
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

  const members = membersQuery.data ?? [];

  const activeMemberCount = useMemo(
    () => members.filter((m) => m.source === "tenant_user" || m.source === "staff_assignment").length,
    [members],
  );

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
        <p className="text-sm text-muted-foreground">
          Client not found: <code className="font-mono">{slug}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/admin/clients")}
          >
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
          {tenant.is_churned && (
            <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400 bg-orange-500/10">
              Churned
            </Badge>
          )}
          {!tenant.is_churned && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-border text-muted-foreground hover:text-primary"
              onClick={handleImpersonate}
            >
              <Eye size={13} /> View as Client
            </Button>
          )}
          {tenant.is_churned ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => restoreMutation.mutate({ slug: tenant.slug })}
              disabled={restoreMutation.isPending}
            >
              <RefreshCw size={13} /> {restoreMutation.isPending ? "Restoring…" : "Restore Client"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
              onClick={() => archiveMutation.mutate({ slug: tenant.slug })}
              disabled={archiveMutation.isPending}
            >
              <Archive size={13} /> {archiveMutation.isPending ? "Archiving…" : "Archive (Churn)"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 size={13} /> Delete
          </Button>
          {!editMode && !tenant.is_churned && (
            <Button size="sm" className="bg-primary text-primary-foreground" onClick={startEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Client Info Card (full-width) */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground">Client Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {editMode ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Company Name</Label>
                  <Input
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    className="bg-background border-border text-foreground text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Contact Name</Label>
                  <Input
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="bg-background border-border text-foreground text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="bg-background border-border text-foreground text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Package Tier</Label>
                  <Select value={form.packageTier} onValueChange={(v) => setForm({ ...form, packageTier: v as PackageTier })}>
                    <SelectTrigger className="bg-background border-border text-foreground text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {Object.entries(PACKAGE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-sm">
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Active</Label>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground"
                  disabled={upsert.isPending}
                  onClick={() =>
                    upsert.mutate({
                      slug: tenant.slug,
                      companyName: form.companyName,
                      contactName: form.contactName || undefined,
                      email: form.email || undefined,
                      packageTier: form.packageTier,
                      isActive: form.isActive,
                    })
                  }
                >
                  {upsert.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
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
                    <Badge
                      variant="outline"
                      className={`text-xs ${tenant.is_active ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}
                    >
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
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Portal Invite</dt>
                  <dd>
                    {tenant.invite_accepted ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 size={11} /> Accepted
                      </span>
                    ) : tenant.invite_sent_at ? (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <Clock size={11} /> Sent {new Date(tenant.invite_sent_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not sent</span>
                    )}
                  </dd>
                </div>
              </dl>

              {tenant.email && !tenant.invite_accepted && (
                <div className="pt-3 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-border text-muted-foreground hover:text-primary hover:border-primary/50"
                    disabled={sendInvite.isPending}
                    onClick={() =>
                      sendInvite.mutate({
                        slug: tenant.slug,
                        email: tenant.email!,
                        contactName: tenant.contact_name ?? undefined,
                        portalOrigin: window.location.origin,
                      })
                    }
                  >
                    <Mail size={13} />
                    {sendInvite.isPending ? "Sending…" : tenant.invite_sent_at ? "Resend Invite" : "Send Invite"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Business Members */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium text-foreground">Business Members</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{activeMemberCount} members connected to this business</p>
            </div>

            <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-primary-foreground gap-2">
                  <Plus size={14} /> Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Invite Business Member</DialogTitle>
                  <DialogDescription>Invite a business member to {tenant.company_name}.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Full Name</Label>
                    <Input
                      value={memberForm.fullName}
                      onChange={(e) => setMemberForm((f) => ({ ...f, fullName: e.target.value }))}
                      className="bg-background border-border"
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
                    <Input
                      type="email"
                      value={memberForm.email}
                      onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                      className="bg-background border-border"
                      placeholder="jane@company.com"
                    />
                  </div>
                                    <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Title / Position (optional)</Label>
                    <Input
                      value={memberForm.title}
                      onChange={(e) => setMemberForm((f) => ({ ...f, title: e.target.value }))}
                      className="bg-background border-border"
                      placeholder="Senior Bookkeeper"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Used for display context in this invite flow.</p>
                  </div>
                  
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-primary text-primary-foreground"
                    disabled={
                      addMember.isPending ||
                      !memberForm.fullName.trim() ||
                      !memberForm.email.trim()
                    }
                    onClick={() =>
                      addMember.mutate({
                        slug: tenant.slug,
                        fullName: memberForm.fullName.trim(),
                        email: memberForm.email.trim(),
                        title: memberForm.title.trim() || undefined,
                        portalOrigin: window.location.origin,
                      })
                    }
                  >
                    {addMember.isPending ? "Inviting…" : "Invite Member"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {membersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members connected to this business yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invite Accepted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isPending = !!m.invite_sent_at && !m.invite_accepted;
                  const canResend = isPending;

                  return (
                    <TableRow key={`${m.id}-${m.email}`}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="size-8">
                            <AvatarFallback className="text-[11px]">
                              {initials(m.name, m.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">{m.name ?? "Unnamed"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{m.source === "staff_assignment" ? "Assigned staff" : "Tenant member"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs border-border text-foreground">
                          {roleLabel(m.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${m.source === "staff_assignment" ? "border-cyan-500/30 text-cyan-400 bg-cyan-500/10" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"}`}
                        >
                          {m.source === "staff_assignment" ? "Assigned" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {m.invite_accepted ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 size={11} /> Accepted
                          </span>
                        ) : m.invite_sent_at ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                            <Clock size={11} /> Pending
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not sent</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            {canResend && (
                              <DropdownMenuItem
                                onClick={() =>
                                  resendMemberInvite.mutate({
                                    slug: tenant.slug,
                                    email: m.email,
                                    fullName: m.name ?? undefined,
                                    portalOrigin: window.location.origin,
                                  })
                                }
                              >
                                <Mail size={14} /> Resend Invite
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-400 focus:text-red-300"
                              onClick={() => {
                                if (confirm(`Remove ${m.name ?? m.email} from ${tenant.company_name}?`)) {
                                  removeMember.mutate({ slug: tenant.slug, memberId: m.id });
                                }
                              }}
                            >
                              <Trash2 size={14} /> Remove / Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Client Permanently?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently remove <strong className="text-foreground">{tenant.company_name}</strong> from the portal.
              Their Supabase data tables will be preserved, but the client record and portal access will be gone.
              <br />
              <br />
              <span className="text-red-400 font-medium">This action cannot be undone.</span> Consider archiving instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-border text-foreground hover:bg-muted/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteMutation.mutate({ slug: tenant.slug })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
