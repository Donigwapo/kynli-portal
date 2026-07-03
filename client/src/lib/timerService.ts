import { trpc } from "@/lib/trpc";

export type TimeEntryRow = {
  id: string;
  tenant_slug: string | null;
  organization_id: string | null;
  staff_user_id: string | number | null;
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

export function useTimerApi() {
  const utils = trpc.useUtils();

  const startMutation = trpc.time.timerStart.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.time.timerRunning.invalidate(),
        utils.time.timerTodayTracked.invalidate(),
      ]);
    },
  });

  const stopMutation = trpc.time.timerStop.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.time.timerRunning.invalidate(),
        utils.time.timerTodayTracked.invalidate(),
      ]);
    },
  });

  return {
    getRunningTimerForTenant: async (tenantSlug?: string) => {
      const data = await utils.time.timerRunning.fetch(tenantSlug ? { tenantSlug } : {});
      return (data as TimeEntryRow | null) ?? null;
    },
    getTodayTrackedSecondsForTenant: async (tenantSlug?: string) => {
      const data = await utils.time.timerTodayTracked.fetch(tenantSlug ? { tenantSlug } : {});
      return Number((data as any)?.seconds ?? 0);
    },
    startOrResumeTimer: async (params: {
      tenantSlug?: string;
      projectId?: string | null;
      taskId?: string | null;
      notes?: string | null;
      billable?: boolean;
    }) => {
      const res = await startMutation.mutateAsync({
        tenantSlug: params.tenantSlug,
        projectId: params.projectId ?? null,
        taskId: params.taskId ?? null,
        notes: params.notes ?? null,
        billable: params.billable ?? true,
      });
      return {
        entry: res.entry as TimeEntryRow,
        resumed: Boolean(res.resumed),
      };
    },
    stopTimer: async (params: {
      entryId: string;
      tenantSlug?: string;
      projectId?: string | null;
      taskId?: string | null;
      notes?: string | null;
      billable?: boolean;
    }) => {
      const res = await stopMutation.mutateAsync({
        entryId: params.entryId,
        tenantSlug: params.tenantSlug,
        projectId: params.projectId ?? null,
        taskId: params.taskId ?? null,
        notes: params.notes ?? null,
        billable: params.billable ?? true,
      });
      return res as TimeEntryRow;
    },
  };
}
