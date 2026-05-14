import { supabaseClient } from "@/lib/supabase";

export type TimeEntryRow = {
  id: string;
  tenant_slug: string | null;
  organization_id: string | null;
  staff_user_id: string | null;
  project_id: string | null;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  status: "running" | "stopped" | string;
  billable: boolean | null;
  created_at: string;
  updated_at: string;
};

function startOfTodayIso() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayIso() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return d.toISOString();
}

export async function getRunningTimerForStaff(staffUserId: string | number): Promise<TimeEntryRow | null> {
  const { data, error } = await supabaseClient
    .from("time_entries")
    .select("*")
    .eq("staff_user_id", String(staffUserId))
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as TimeEntryRow | null) ?? null;
}

export async function getTodayTrackedSeconds(
  staffUserId: string | number,
  tenantSlug?: string | null,
): Promise<number> {
  let query = supabaseClient
    .from("time_entries")
    .select("started_at, ended_at, duration_seconds, status")
    .eq("staff_user_id", String(staffUserId))
    .gte("started_at", startOfTodayIso())
    .lt("started_at", endOfTodayIso());

  if (tenantSlug) query = query.eq("tenant_slug", tenantSlug);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const nowMs = Date.now();
  return (data ?? []).reduce((sum, row: any) => {
    const stored = Number(row.duration_seconds ?? 0);
    if (stored > 0) return sum + stored;

    if (row.status === "running" && row.started_at) {
      const startedMs = new Date(row.started_at).getTime();
      return sum + Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    }

    if (row.started_at && row.ended_at) {
      const startedMs = new Date(row.started_at).getTime();
      const endedMs = new Date(row.ended_at).getTime();
      return sum + Math.max(0, Math.floor((endedMs - startedMs) / 1000));
    }

    return sum;
  }, 0);
}

export async function startOrResumeTimer(params: {
  staffUserId: string | number;
  tenantSlug: string;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  notes?: string | null;
  billable?: boolean;
}): Promise<{ entry: TimeEntryRow; resumed: boolean }> {
  const existing = await getRunningTimerForStaff(params.staffUserId);
  if (existing) return { entry: existing, resumed: true };

  const payload = {
    tenant_slug: params.tenantSlug,
    organization_id: params.organizationId ?? null,
    staff_user_id: String(params.staffUserId),
    project_id: params.projectId ?? null,
    task_id: params.taskId ?? null,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_seconds: null,
    notes: params.notes ?? null,
    status: "running",
    billable: params.billable ?? true,
  };

  const { data, error } = await supabaseClient
    .from("time_entries")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { entry: data as TimeEntryRow, resumed: false };
}

export async function stopTimer(params: {
  entryId: string;
  staffUserId: string | number;
  startedAt: string;
  notes?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  billable?: boolean;
}): Promise<TimeEntryRow> {
  const endedAt = new Date();
  const startedMs = new Date(params.startedAt).getTime();
  const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - startedMs) / 1000));

  const { data, error } = await supabaseClient
    .from("time_entries")
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      status: "stopped",
      notes: params.notes ?? null,
      project_id: params.projectId ?? null,
      task_id: params.taskId ?? null,
      billable: params.billable ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.entryId)
    .eq("staff_user_id", String(params.staffUserId))
    .eq("status", "running")
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as TimeEntryRow;
}
