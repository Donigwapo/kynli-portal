import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Search } from "lucide-react";

const DEFAULT_ACTIONS = [
  "all",
  "file_uploaded",
  "file_moved",
  "file_renamed",
  "file_deleted",
  "user_invited",
  "member_added",
  "member_removed",
  "role_changed",
  "message_sent",
  "message_deleted",
  "mention_created",
  "meeting_created",
  "meeting_updated",
  "meeting_deleted",
  "meeting_action_item_created",
  "meeting_action_item_updated",
  "meeting_action_item_completed",
  "internal_note_created",
  "internal_note_updated",
  "internal_note_deleted",
  "internal_note_pinned",
  "internal_note_archived",
  "internal_note_comment_created",
  "internal_note_comment_updated",
  "internal_note_comment_deleted",
] as const;

const ACTION_LABELS: Record<string, string> = {
  file_uploaded: "Uploaded a file",
  file_moved: "Moved a file",
  file_renamed: "Renamed a file",
  file_deleted: "Deleted a file",
  member_added: "Added a member",
  member_removed: "Removed a member",
  user_invited: "Invited a user",
  role_changed: "Changed a role",
  message_sent: "Sent a message",
  message_deleted: "Deleted a message",
  mention_created: "Mentioned a user",
  meeting_created: "Created a meeting",
  meeting_updated: "Updated a meeting",
  meeting_deleted: "Deleted a meeting",
  meeting_action_item_created: "Created a meeting action item",
  meeting_action_item_updated: "Updated a meeting action item",
  meeting_action_item_completed: "Completed a meeting action item",
  internal_note_created: "Created an internal note",
  internal_note_updated: "Updated an internal note",
  internal_note_deleted: "Deleted an internal note",
  internal_note_pinned: "Pinned an internal note",
  internal_note_archived: "Archived an internal note",
  internal_note_comment_created: "Created an internal note comment",
  internal_note_comment_updated: "Updated an internal note comment",
  internal_note_comment_deleted: "Deleted an internal note comment",
};

function getActionLabel(actionType?: string | null): string {
  if (!actionType) return "—";
  return ACTION_LABELS[actionType] ?? actionType;
}

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function ActivityLogPage() {
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState<string>("all");
  const [tenantSlug, setTenantSlug] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const { data: tenants = [] } = trpc.tenant.list.useQuery();

  const { data: rows = [], isLoading, error, refetch, isFetching } = trpc.activity.list.useQuery({
    search: search.trim() || undefined,
    actionType: actionType !== "all" ? actionType : undefined,
    tenantSlug: tenantSlug !== "all" ? tenantSlug : undefined,
    from: fromDate ? new Date(`${fromDate}T00:00:00.000Z`).toISOString() : undefined,
    to: toDate ? new Date(`${toDate}T23:59:59.999Z`).toISOString() : undefined,
    limit: 500,
  });

  const actionOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_ACTIONS);
    for (const row of rows as Array<any>) {
      if (row?.action_type) set.add(String(row.action_type));
    }
    return Array.from(set);
  }, [rows]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6 text-emerald-400" />
          Activity Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audit trail of key portal actions across documents, users, and access changes.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file or user"
                className="pl-9 bg-zinc-900 border-zinc-700"
              />
            </div>
          </div>

          <Select value={actionType} onValueChange={setActionType}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              {actionOptions.map((action) => (
                <SelectItem key={action} value={action}>{action === "all" ? "All actions" : getActionLabel(action)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tenantSlug} onValueChange={setTenantSlug}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue placeholder="Business" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All businesses</SelectItem>
              {tenants.map((t: any) => (
                <SelectItem key={t.slug} value={t.slug}>{t.company_name ?? t.slug}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-zinc-900 border-zinc-700" />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700"
            onClick={() => {
              setSearch("");
              setActionType("all");
              setTenantSlug("all");
              setFromDate("");
              setToDate("");
            }}
          >
            Clear Filters
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-zinc-900/80 border-b border-zinc-800">
              <tr className="text-left text-zinc-400">
                <th className="px-3 py-2">Date/Time</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Item/File</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Business/Client</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="px-3 py-6 text-zinc-400" colSpan={9}>Loading activity logs...</td></tr>
              ) : error ? (
                <tr><td className="px-3 py-6 text-red-400" colSpan={9}>{error.message}</td></tr>
              ) : (rows as Array<any>).length === 0 ? (
                <tr><td className="px-3 py-6 text-zinc-400" colSpan={9}>No activity found.</td></tr>
              ) : (
                (rows as Array<any>).map((row) => (
                  <tr key={row.id} className="border-b border-zinc-800/80 hover:bg-zinc-900/40">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="leading-tight">
                        <div className="text-zinc-200">{row.actor_name || row.actor_email || "Unknown"}</div>
                        {row.actor_email && <div className="text-xs text-zinc-500">{row.actor_email}</div>}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.actor_role ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{getActionLabel(row.action_type)}</td>
                    <td className="px-3 py-2 max-w-[260px] truncate" title={row.file_name ?? row.entity_id ?? ""}>{row.file_name ?? row.entity_id ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate" title={row.previous_value ?? ""}>{row.previous_value ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate" title={row.new_value ?? ""}>{row.new_value ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.tenant_slug ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={row.status === "success" ? "text-emerald-400" : "text-red-400"}>
                        {row.status ?? "success"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
