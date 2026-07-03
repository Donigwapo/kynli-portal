import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useTimerApi, type TimeEntryRow } from "@/lib/timerService";
import { useFloatingTimerStore } from "@/store/floatingTimerStore";

const STAFF_ROLES = new Set(["admin", "accounting_manager", "tax_manager", "accountant"]);
const IDLE_REMINDER_DELAY_MS = 10_000;
const IDLE_REMINDER_COOLDOWN_MS = 5 * 60_000;

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useFloatingTimer() {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();

  // Store state selectors
  const expanded = useFloatingTimerStore((s) => s.expanded);
  const loading = useFloatingTimerStore((s) => s.loading);
  const error = useFloatingTimerStore((s) => s.error);
  const notesDraft = useFloatingTimerStore((s) => s.notesDraft);
  const projectId = useFloatingTimerStore((s) => s.projectId);
  const taskId = useFloatingTimerStore((s) => s.taskId);
  const billable = useFloatingTimerStore((s) => s.billable);
  const tickingSeconds = useFloatingTimerStore((s) => s.tickingSeconds);
  const todayTrackedSeconds = useFloatingTimerStore((s) => s.todayTrackedSeconds);
  const runningEntry = useFloatingTimerStore((s) => s.runningEntry);
  const position = useFloatingTimerStore((s) => s.position);
  const dragging = useFloatingTimerStore((s) => s.dragging);

  // Store actions selectors (stable)
  const setMounted = useFloatingTimerStore((s) => s.setMounted);
  const setExpanded = useFloatingTimerStore((s) => s.setExpanded);
  const setTickingSeconds = useFloatingTimerStore((s) => s.setTickingSeconds);
  const setRunningEntry = useFloatingTimerStore((s) => s.setRunningEntry);
  const setTenantLabel = useFloatingTimerStore((s) => s.setTenantLabel);
  const setNotesDraft = useFloatingTimerStore((s) => s.setNotesDraft);
  const setProjectId = useFloatingTimerStore((s) => s.setProjectId);
  const setTaskId = useFloatingTimerStore((s) => s.setTaskId);
  const setBillable = useFloatingTimerStore((s) => s.setBillable);
  const setTodayTrackedSeconds = useFloatingTimerStore((s) => s.setTodayTrackedSeconds);
  const setLoading = useFloatingTimerStore((s) => s.setLoading);
  const setError = useFloatingTimerStore((s) => s.setError);
  const resetDrafts = useFloatingTimerStore((s) => s.resetDrafts);
  const setPosition = useFloatingTimerStore((s) => s.setPosition);
  const persistPosition = useFloatingTimerStore((s) => s.persistPosition);
  const setDragging = useFloatingTimerStore((s) => s.setDragging);
  const idleReminderVisible = useFloatingTimerStore((s) => s.idleReminderVisible);
  const idleReminderLastShownAtByTenant = useFloatingTimerStore((s) => s.idleReminderLastShownAtByTenant);
  const hideIdleReminder = useFloatingTimerStore((s) => s.hideIdleReminder);
  const markIdleReminderShown = useFloatingTimerStore((s) => s.markIdleReminderShown);

  const isStaff = !!user && STAFF_ROLES.has(user.role);
  const canShow = isStaff;
  const activeTenantSlug = impersonatingTenantSlug ?? null;
  const isViewAsTimerContext = !!activeTenantSlug;
  const timerMode: "client" | "internal" = isViewAsTimerContext ? "client" : "internal";

  const { data: tenants = [] } = trpc.tenant.list.useQuery(undefined, {
    enabled: !!user && isStaff,
    staleTime: 60_000,
  });

  const tenantLabel = useMemo(() => {
    if (!activeTenantSlug) return "Internal Work";
    const found = tenants.find((t: any) => t.slug === activeTenantSlug);
    return found?.company_name ?? activeTenantSlug;
  }, [activeTenantSlug, tenants]);

  const tickerRef = useRef<number | null>(null);
  const restoreGuardRef = useRef<string | null>(null);
  const idleReminderTimerRef = useRef<number | null>(null);
  const timerApi = useTimerApi();

  const hydrate = useCallback(async () => {
    // Non-blocking fail-safe: never throw outside.
    try {
      if (!user || !isStaff) {
        setMounted(true);
        return;
      }

      // Internal mode (no View-as tenant) is valid for staff/admin time tracking.

      // Prevent repeated restore calls for same user+tenant scope.
      const restoreKey = `${user.id}:${activeTenantSlug}`;
      if (restoreGuardRef.current === restoreKey) {
        return;
      }
      restoreGuardRef.current = restoreKey;

      setLoading(true);
      setError(null);

      console.log("[FloatingTimerHydrate] start", {
        userId: user.id,
        role: user.role,
        tenantSlug: activeTenantSlug,
      });

      const running = await timerApi.getRunningTimerForTenant(activeTenantSlug ?? undefined);
      console.log("[FloatingTimerRestore] running lookup", {
        userId: user.id,
        tenantSlug: activeTenantSlug,
        found: !!running,
        runningTenantSlug: running?.tenant_slug ?? null,
      });

      // Server query is already tenant-scoped.
      const scopedRunning = running;
      setRunningEntry(scopedRunning);

      if (scopedRunning?.started_at) {
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(scopedRunning.started_at).getTime()) / 1000));
        setTickingSeconds(elapsed);
        if (!notesDraft && scopedRunning.notes) setNotesDraft(scopedRunning.notes);
      } else {
        setTickingSeconds(0);
      }

      const tracked = await timerApi.getTodayTrackedSecondsForTenant(activeTenantSlug ?? undefined);
      setTodayTrackedSeconds(tracked);
    } catch (e) {
      console.error("[FloatingTimerHydrate] error", e);
      setError(e instanceof Error ? e.message : "Failed to load timer");
    } finally {
      setLoading(false);
      setMounted(true);
    }
  }, [
    user,
    isStaff,
    activeTenantSlug,
    notesDraft,
    setMounted,
    setRunningEntry,
    setTickingSeconds,
    setTodayTrackedSeconds,
    setLoading,
    setError,
    setNotesDraft,
  ]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setTenantLabel(tenantLabel);
  }, [tenantLabel, setTenantLabel]);

  useEffect(() => {
    if (idleReminderTimerRef.current) {
      window.clearTimeout(idleReminderTimerRef.current);
      idleReminderTimerRef.current = null;
    }

    // Only remind staff/admin while actively viewing as client, once hydration is done.
    if (!user || !isStaff || !isViewAsTimerContext || loading) {
      hideIdleReminder();
      return;
    }

    // Do not remind when timer is already running.
    if (runningEntry?.id) {
      hideIdleReminder();
      return;
    }

    // Respect per-tenant cooldown. If already visible, keep it visible.
    const reminderTenantKey = activeTenantSlug;
    const lastShownAt = Number(idleReminderLastShownAtByTenant[reminderTenantKey] ?? 0);
    const now = Date.now();
    if (lastShownAt > 0 && now - lastShownAt < IDLE_REMINDER_COOLDOWN_MS) {
      if (!idleReminderVisible) {
        hideIdleReminder();
      }
      return;
    }

    idleReminderTimerRef.current = window.setTimeout(() => {
      markIdleReminderShown(reminderTenantKey, Date.now());
    }, IDLE_REMINDER_DELAY_MS);

    return () => {
      if (idleReminderTimerRef.current) {
        window.clearTimeout(idleReminderTimerRef.current);
        idleReminderTimerRef.current = null;
      }
    };
  }, [
    user?.id,
    isStaff,
    isViewAsTimerContext,
    activeTenantSlug,
    runningEntry?.id,
    loading,
    idleReminderVisible,
    idleReminderLastShownAtByTenant,
    hideIdleReminder,
    markIdleReminderShown,
  ]);

  useEffect(() => {
    if (tickerRef.current) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }

    if (!runningEntry?.started_at) return;

    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(runningEntry.started_at).getTime()) / 1000));
      setTickingSeconds(elapsed);
    };

    tick();
    tickerRef.current = window.setInterval(tick, 1000);

    return () => {
      if (tickerRef.current) {
        window.clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, [runningEntry?.started_at, setTickingSeconds]);

  const start = useCallback(async () => {
    if (!user || !isStaff) return;

    setLoading(true);
    setError(null);
    try {
      console.log("[FloatingTimerStart]", {
        userId: user.id,
        tenantSlug: activeTenantSlug,
        mode: timerMode,
      });

      const { entry } = await timerApi.startOrResumeTimer({
        tenantSlug: activeTenantSlug ?? undefined,
        notes: notesDraft || null,
        projectId: projectId || null,
        taskId: taskId || null,
        billable: timerMode === "internal" ? false : billable,
      });

      setRunningEntry(entry as TimeEntryRow);
      setExpanded(false);
      const tracked = await timerApi.getTodayTrackedSecondsForTenant(activeTenantSlug ?? undefined);
      setTodayTrackedSeconds(tracked);
    } catch (e) {
      console.error("[FloatingTimerStart] error", e);
      setError(e instanceof Error ? e.message : "Failed to start timer");
    } finally {
      setLoading(false);
    }
  }, [
    user,
    isStaff,
    activeTenantSlug,
    timerMode,
    notesDraft,
    projectId,
    taskId,
    billable,
    setLoading,
    setError,
    setRunningEntry,
    setExpanded,
    setTodayTrackedSeconds,
  ]);

  const stop = useCallback(async () => {
    if (!user || !isStaff) return;
    if (!runningEntry?.id || !runningEntry.started_at) return;

    setLoading(true);
    setError(null);
    try {
      console.log("[FloatingTimerStop]", {
        userId: user.id,
        tenantSlug: activeTenantSlug,
        mode: timerMode,
        entryId: runningEntry.id,
      });

      await timerApi.stopTimer({
        entryId: String(runningEntry.id),
        tenantSlug: activeTenantSlug ?? undefined,
        notes: notesDraft || null,
        projectId: projectId || null,
        taskId: taskId || null,
        billable: timerMode === "internal" ? false : billable,
      });

      setRunningEntry(null);
      setTickingSeconds(0);
      const tracked = await timerApi.getTodayTrackedSecondsForTenant(activeTenantSlug ?? undefined);
      setTodayTrackedSeconds(tracked);
      resetDrafts();
    } catch (e) {
      console.error("[FloatingTimerStop] error", e);
      setError(e instanceof Error ? e.message : "Failed to stop timer");
    } finally {
      setLoading(false);
    }
  }, [
    user,
    isStaff,
    runningEntry?.id,
    runningEntry?.started_at,
    activeTenantSlug,
    timerMode,
    notesDraft,
    projectId,
    taskId,
    billable,
    setLoading,
    setError,
    setRunningEntry,
    setTickingSeconds,
    setTodayTrackedSeconds,
    resetDrafts,
  ]);

  return {
    canShow,
    isStaff,
    isImpersonating: !!activeTenantSlug,
    timerMode,
    activeTenantSlug,
    tenantLabel,
    running: !!runningEntry,
    expanded,
    loading,
    error,
    notesDraft,
    projectId,
    taskId,
    billable,
    tickingSeconds,
    todayTrackedSeconds,
    position,
    dragging,
    tickingLabel: formatDuration(tickingSeconds),
    todayTrackedLabel: formatDuration(todayTrackedSeconds),

    setExpanded,
    setNotesDraft,
    setProjectId,
    setTaskId,
    setBillable,
    setPosition,
    persistPosition,
    setDragging,

    start,
    stop,
    dismissIdleReminder: hideIdleReminder,
    idleReminderVisible,
    refresh: hydrate,
  };
}
