import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Pencil,
  UserX,
  UserCheck,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// ─── Types ────────────────────────────────────────────────────────────────────
type StaffRole = "admin" | "accounting_manager" | "tax_manager" | "accountant";
type StaffStatus = "active" | "inactive";
type StaffFilter = "all" | "active" | "inactive";

type ReactivationClassification =
  | "eligible_restore"
  | "assigned_to_active_accountant"
  | "client_inactive_or_missing"
  | "not_authorized";

type ReactivationPreviewItem = {
  tenantSlug: string;
  tenantName: string;
  classification: ReactivationClassification;
  blockingStaffIds: number[];
  blockingStaffNames: string[];
};

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  accounting_manager: "Accounting Manager",
  tax_manager: "Tax Manager",
  accountant: "Accountant",
};

const ROLE_COLORS: Record<StaffRole, string> = {
  admin: "bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/20 dark:text-red-400",
  accounting_manager: "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:bg-teal-500/20 dark:text-teal-400",
  tax_manager: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-400",
  accountant: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminTeam() {
  const utils = trpc.useUtils();

  // Data queries
  const { data: staff = [], isLoading } = trpc.staff.list.useQuery();
  const { data: tenants = [] } = trpc.tenant.list.useQuery();

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("accountant");

  // Edit dialog state
  const [editMember, setEditMember] = useState<{ id: number; name: string; role: StaffRole } | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("accountant");

  // Deactivate/reactivate state
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<{ id: number; name: string | null; email: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StaffFilter>("all");

  // Expanded assignment panel per staff member
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Mutations
  const inviteMutation = trpc.staff.invite.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("accountant");
      toast.success("Team member added successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      setEditMember(null);
      toast.success("Team member updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deactivateMutation = trpc.staff.deactivate.useMutation({
    onSuccess: (data) => {
      utils.staff.list.invalidate();
      setDeactivateId(null);
      toast.success(`Team member deactivated. ${data.releasedAssignmentCount} client assignment${data.releasedAssignmentCount === 1 ? "" : "s"} released.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const reactivatePreviewQuery = trpc.staff.reactivatePreview.useQuery(
    { id: reactivateTarget?.id ?? 0 },
    { enabled: !!reactivateTarget }
  );

  const reactivateMutation = trpc.staff.reactivate.useMutation({
    onSuccess: (data) => {
      utils.staff.list.invalidate();
      setReactivateTarget(null);
      toast.success(
        `Team member reactivated. Restored ${data.restoredCount} assignment${data.restoredCount === 1 ? "" : "s"}; skipped ${data.skippedConflictCount + data.skippedIneligibleCount + data.skippedMissingCount}.`
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const assignMutation = trpc.staff.assignClient.useMutation({
    onSuccess: (_, vars) => {
      utils.staff.getAssignments.invalidate({ staffId: vars.staffId });
      toast.success("Client assigned");
    },
    onError: (e) => toast.error(e.message),
  });

  const unassignMutation = trpc.staff.unassignClient.useMutation({
    onSuccess: (_, vars) => {
      utils.staff.getAssignments.invalidate({ staffId: vars.staffId });
      toast.success("Client unassigned");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleInvite = () => {
    if (!inviteEmail || !inviteName) return;
    inviteMutation.mutate({ email: inviteEmail, name: inviteName, role: inviteRole });
  };

  const handleEdit = () => {
    if (!editMember) return;
    updateMutation.mutate({ id: editMember.id, name: editName, role: editRole });
  };

  const openEdit = (m: { id: number; name: string | null; role: string }) => {
    setEditMember({ id: m.id, name: m.name ?? "", role: m.role as StaffRole });
    setEditName(m.name ?? "");
    setEditRole(m.role as StaffRole);
  };

  const filteredStaff = useMemo(() => {
    return staff.filter((member: any) => {
      const status = (member.status ?? "active") as StaffStatus;
      if (statusFilter === "all") return true;
      return status === statusFilter;
    });
  }, [staff, statusFilter]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-primary dark:text-teal-400" />
            Team Members
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your team of {staff.length} advisor{staff.length !== 1 ? "s" : ""}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "active" ? "default" : "outline"}
              onClick={() => setStatusFilter("active")}
            >
              Active
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "inactive" ? "default" : "outline"}
              onClick={() => setStatusFilter("inactive")}
            >
              Inactive
            </Button>
          </div>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-teal-500 dark:hover:bg-teal-600 dark:text-black font-semibold"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add Team Member
        </Button>
      </div>

      {/* Staff List */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading team members...</div>
      ) : filteredStaff.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No team members for this filter</p>
          <p className="text-sm mt-1">Try another filter or add a team member</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStaff.map((member: any) => (
            <StaffCard
              key={member.id}
              member={member}
              tenants={tenants}
              isExpanded={expandedId === member.id}
              onToggleExpand={() => setExpandedId(expandedId === member.id ? null : member.id)}
              onEdit={() => openEdit(member)}
              onDeactivate={() => setDeactivateId(member.id)}
              onReactivate={() => setReactivateTarget({ id: member.id, name: member.name ?? null, email: member.email })}
              onAssign={(tenantSlug) => assignMutation.mutate({ staffId: member.id, tenantSlug })}
              onUnassign={(tenantSlug) => unassignMutation.mutate({ staffId: member.id, tenantSlug })}
            />
          ))}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-card dark:bg-[#111] border-border dark:border-white/10 text-foreground dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary dark:text-teal-400" />
              Add Team Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Full Name</label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Sarah Johnson"
                className="bg-background dark:bg-white/5 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email Address</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="e.g. sarah@kynliconsulting.com"
                className="bg-background dark:bg-white/5 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Role</label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as StaffRole)}>
                <SelectTrigger className="bg-background dark:bg-white/5 border-border dark:border-white/10 text-foreground dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover dark:bg-[#1a1a1a] border-border dark:border-white/10">
                  {(Object.entries(ROLE_LABELS) as [StaffRole, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val} className="text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              After adding, create a Supabase Auth account for this email and run the SQL to link their UID.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)} className="text-muted-foreground">
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail || !inviteName || inviteMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-teal-500 dark:hover:bg-teal-600 dark:text-black font-semibold"
            >
              {inviteMutation.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMember} onOpenChange={(o) => !o && setEditMember(null)}>
        <DialogContent className="bg-card dark:bg-[#111] border-border dark:border-white/10 text-foreground dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground dark:text-white flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary dark:text-teal-400" />
              Edit Team Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Full Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-background dark:bg-white/5 border-border dark:border-white/10 text-foreground dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Role</label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as StaffRole)}>
                <SelectTrigger className="bg-background dark:bg-white/5 border-border dark:border-white/10 text-foreground dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover dark:bg-[#1a1a1a] border-border dark:border-white/10">
                  {(Object.entries(ROLE_LABELS) as [StaffRole, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val} className="text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditMember(null)} className="text-muted-foreground">
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={!editName || updateMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-teal-500 dark:hover:bg-teal-600 dark:text-black font-semibold"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <AlertDialog open={deactivateId !== null} onOpenChange={(o) => !o && setDeactivateId(null)}>
        <AlertDialogContent className="bg-card dark:bg-[#111] border-border dark:border-white/10 text-foreground dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground dark:text-white">Deactivate Team Member?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <span className="block">
                Deactivating this accountant will revoke their portal access and unassign their current clients.
              </span>
              <span className="block">
                Their previous assignments will be saved and may be automatically restored when they are reactivated, provided those clients have not been assigned to another accountant.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent dark:bg-white/5 border-border dark:border-white/10 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateId !== null && deactivateMutation.mutate({ id: deactivateId })}
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate Preview Dialog */}
      <Dialog open={!!reactivateTarget} onOpenChange={(open) => !open && setReactivateTarget(null)}>
        <DialogContent className="bg-card dark:bg-[#111] border-border dark:border-white/10 text-foreground dark:text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary dark:text-teal-400" />
              Reactivate Team Member
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              Reactivating <span className="font-semibold">{reactivateTarget?.name ?? reactivateTarget?.email}</span> may restore previous assignments where no active accountant currently exists.
            </p>

            {reactivatePreviewQuery.isLoading ? (
              <p className="text-muted-foreground">Loading assignment preview...</p>
            ) : reactivatePreviewQuery.error ? (
              <p className="text-red-600">Failed to load preview: {reactivatePreviewQuery.error.message}</p>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {(reactivatePreviewQuery.data?.preview ?? []).length === 0 ? (
                  <p className="text-muted-foreground">No previous assignments found for this deactivation cycle.</p>
                ) : (
                  (reactivatePreviewQuery.data?.preview ?? []).map((item: ReactivationPreviewItem) => {
                    const classificationLabel =
                      item.classification === "eligible_restore"
                        ? "Eligible for automatic restoration"
                        : item.classification === "assigned_to_active_accountant"
                        ? "Currently assigned to another active accountant"
                        : item.classification === "not_authorized"
                        ? "No longer authorized"
                        : "Client inactive or missing";

                    return (
                      <div key={item.tenantSlug} className="rounded border border-border dark:border-white/10 px-3 py-2">
                        <div className="font-medium">{item.tenantName}</div>
                        <div className="text-xs text-muted-foreground">{item.tenantSlug}</div>
                        <div className="mt-1 text-xs">{classificationLabel}</div>
                        {item.blockingStaffNames.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Assigned to: {item.blockingStaffNames.join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReactivateTarget(null)} className="text-muted-foreground">
              Cancel
            </Button>
            <Button
              onClick={() => reactivateTarget && reactivateMutation.mutate({ id: reactivateTarget.id })}
              disabled={reactivateMutation.isPending || reactivatePreviewQuery.isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-teal-500 dark:hover:bg-teal-600 dark:text-black font-semibold"
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────
function StaffCard({
  member,
  tenants,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDeactivate,
  onReactivate,
  onAssign,
  onUnassign,
}: {
  member: {
    id: number;
    name: string | null;
    email: string;
    role: string;
    created_at: string;
    status?: StaffStatus | null;
    assigned_client_count?: number;
    previous_assignment_count?: number;
  };
  tenants: { slug: string; company_name: string; is_active: boolean }[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onAssign: (slug: string) => void;
  onUnassign: (slug: string) => void;
}) {
  const role = member.role as StaffRole;
  const status = (member.status ?? "active") as StaffStatus;
  const isInactive = status === "inactive";

  const { data: assignments = [] } = trpc.staff.getAssignments.useQuery(
    { staffId: member.id },
    { enabled: isExpanded && !isInactive }
  );

  const assignedSlugs = new Set(assignments.map((a) => a.tenant_slug));
  const activeClients = tenants.filter((t) => t.is_active);

  return (
    <div className="bg-card dark:bg-white/5 border border-border dark:border-white/10 rounded-xl overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-teal-500/20 border border-primary/20 dark:border-teal-500/30 flex items-center justify-center text-primary dark:text-teal-400 font-bold text-sm flex-shrink-0">
          {(member.name ?? member.email)[0].toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground dark:text-white text-sm">{member.name ?? "—"}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[role] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
              {ROLE_LABELS[role] ?? role}
            </span>
            <Badge
              variant="outline"
              className={isInactive
                ? "text-amber-700 border-amber-500/40 bg-amber-500/10 dark:text-amber-300"
                : "text-emerald-700 border-emerald-500/40 bg-emerald-500/10 dark:text-emerald-300"
              }
            >
              {isInactive ? "Inactive" : "Active"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground dark:text-gray-500 mt-0.5 truncate">{member.email}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleExpand}
            className="text-muted-foreground dark:text-gray-400 hover:text-primary dark:hover:text-teal-400 hover:bg-muted dark:hover:bg-white/5 h-8 px-2 gap-1"
            disabled={isInactive}
            title={isInactive ? "Inactive team members cannot hold active assignments" : "View and manage assignments"}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span className="text-xs">
              {isInactive
                ? `${Number(member.previous_assignment_count ?? 0)} previous`
                : (member.assigned_client_count != null ? String(member.assigned_client_count) : (assignments.length > 0 ? String(assignments.length) : "Clients"))}
            </span>
            {!isInactive && (isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="text-muted-foreground dark:text-gray-400 hover:text-foreground dark:hover:text-white hover:bg-muted dark:hover:bg-white/5 h-8 w-8 p-0"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {isInactive ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onReactivate}
              className="text-muted-foreground dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/10 h-8 px-2"
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              <span className="text-xs">Reactivate</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDeactivate}
              className="text-muted-foreground dark:text-gray-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-500/10 h-8 px-2"
            >
              <UserX className="w-3.5 h-3.5 mr-1" />
              <span className="text-xs">Deactivate</span>
            </Button>
          )}
        </div>
      </div>

      {/* Client Assignments Panel */}
      {isExpanded && !isInactive && (
        <div className="border-t border-border dark:border-white/10 p-4 bg-muted/20 dark:bg-black/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Client Assignments
          </p>
          {activeClients.length === 0 ? (
            <p className="text-xs text-muted-foreground dark:text-gray-600">No active clients found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeClients.map((tenant) => {
                const assigned = assignedSlugs.has(tenant.slug);
                return (
                  <div
                    key={tenant.slug}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                      assigned
                        ? "bg-teal-500/10 border-teal-500/30"
                        : "bg-background dark:bg-white/3 border-border dark:border-white/8 hover:bg-muted/40 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className={assigned ? "text-primary dark:text-teal-300" : "text-foreground/80 dark:text-gray-300"}>
                      {tenant.company_name}
                    </span>
                    <button
                      onClick={() => assigned ? onUnassign(tenant.slug) : onAssign(tenant.slug)}
                      className={`ml-2 rounded-full p-1 transition-colors ${
                        assigned
                          ? "bg-primary/20 text-primary dark:bg-teal-500/20 dark:text-teal-400 hover:bg-red-500/15 dark:hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-400"
                          : "bg-muted text-muted-foreground dark:bg-white/10 dark:text-gray-400 hover:bg-primary/20 dark:hover:bg-teal-500/20 hover:text-primary dark:hover:text-teal-400"
                      }`}
                      title={assigned ? "Unassign" : "Assign"}
                    >
                      {assigned ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
