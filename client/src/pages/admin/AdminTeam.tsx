import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
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

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  accounting_manager: "Accounting Manager",
  tax_manager: "Tax Manager",
  accountant: "Accountant",
};

const ROLE_COLORS: Record<StaffRole, string> = {
  admin: "bg-red-500/20 text-red-400 border-red-500/30",
  accounting_manager: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  tax_manager: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  accountant: "bg-blue-500/20 text-blue-400 border-blue-500/30",
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

  // Remove confirm state
  const [removeId, setRemoveId] = useState<number | null>(null);

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

  const removeMutation = trpc.staff.remove.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      setRemoveId(null);
      toast.success("Team member removed");
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-400" />
            Team Members
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage your team of {staff.length} advisor{staff.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          className="bg-teal-500 hover:bg-teal-600 text-black font-semibold"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add Team Member
        </Button>
      </div>

      {/* Staff List */}
      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading team members...</div>
      ) : staff.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No team members yet</p>
          <p className="text-sm mt-1">Click "Add Team Member" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((member) => (
            <StaffCard
              key={member.id}
              member={member}
              tenants={tenants}
              isExpanded={expandedId === member.id}
              onToggleExpand={() => setExpandedId(expandedId === member.id ? null : member.id)}
              onEdit={() => openEdit(member)}
              onRemove={() => setRemoveId(member.id)}
              onAssign={(tenantSlug) => assignMutation.mutate({ staffId: member.id, tenantSlug })}
              onUnassign={(tenantSlug) => unassignMutation.mutate({ staffId: member.id, tenantSlug })}
            />
          ))}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-[#111] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-400" />
              Add Team Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Full Name</label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Sarah Johnson"
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email Address</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="e.g. sarah@kynliconsulting.com"
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Role</label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as StaffRole)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10">
                  {(Object.entries(ROLE_LABELS) as [StaffRole, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val} className="text-white hover:bg-white/10">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500">
              After adding, create a Supabase Auth account for this email and run the SQL to link their UID.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail || !inviteName || inviteMutation.isPending}
              className="bg-teal-500 hover:bg-teal-600 text-black font-semibold"
            >
              {inviteMutation.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMember} onOpenChange={(o) => !o && setEditMember(null)}>
        <DialogContent className="bg-[#111] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Pencil className="w-5 h-5 text-teal-400" />
              Edit Team Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Full Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Role</label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as StaffRole)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10">
                  {(Object.entries(ROLE_LABELS) as [StaffRole, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val} className="text-white hover:bg-white/10">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditMember(null)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={!editName || updateMutation.isPending}
              className="bg-teal-500 hover:bg-teal-600 text-black font-semibold"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm */}
      <AlertDialog open={removeId !== null} onOpenChange={(o) => !o && setRemoveId(null)}>
        <AlertDialogContent className="bg-[#111] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will permanently remove them from the portal. Their Supabase Auth account will not be deleted automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeId !== null && removeMutation.mutate({ id: removeId })}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  onRemove,
  onAssign,
  onUnassign,
}: {
  member: { id: number; name: string | null; email: string; role: string; created_at: string };
  tenants: { slug: string; company_name: string; is_active: boolean }[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onAssign: (slug: string) => void;
  onUnassign: (slug: string) => void;
}) {
  const role = member.role as StaffRole;
  const { data: assignments = [] } = trpc.staff.getAssignments.useQuery(
    { staffId: member.id },
    { enabled: isExpanded }
  );

  const assignedSlugs = new Set(assignments.map((a) => a.tenant_slug));
  const activeClients = tenants.filter((t) => t.is_active);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 font-bold text-sm flex-shrink-0">
          {(member.name ?? member.email)[0].toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">{member.name ?? "—"}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[role] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{member.email}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleExpand}
            className="text-gray-400 hover:text-teal-400 hover:bg-white/5 h-8 px-2 gap-1"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span className="text-xs">{assignments.length > 0 ? assignments.length : "Clients"}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="text-gray-400 hover:text-white hover:bg-white/5 h-8 w-8 p-0"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Client Assignments Panel */}
      {isExpanded && (
        <div className="border-t border-white/10 p-4 bg-black/20">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Client Assignments
          </p>
          {activeClients.length === 0 ? (
            <p className="text-xs text-gray-600">No active clients found.</p>
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
                        : "bg-white/3 border-white/8 hover:bg-white/5"
                    }`}
                  >
                    <span className={assigned ? "text-teal-300" : "text-gray-300"}>
                      {tenant.company_name}
                    </span>
                    <button
                      onClick={() => assigned ? onUnassign(tenant.slug) : onAssign(tenant.slug)}
                      className={`ml-2 rounded-full p-1 transition-colors ${
                        assigned
                          ? "bg-teal-500/20 text-teal-400 hover:bg-red-500/20 hover:text-red-400"
                          : "bg-white/10 text-gray-400 hover:bg-teal-500/20 hover:text-teal-400"
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
