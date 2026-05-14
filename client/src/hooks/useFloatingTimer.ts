import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePortal } from "@/contexts/PortalContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  getRunningTimerForStaff,
  getTodayTrackedSeconds,
  startOrResumeTimer,
  stopTimer,
  type TimeEntryRow,
} from "@/lib/timerService";
import { useFloatingTimerStore } from "@/store/floatingTimerStore";

const STAFF_ROLES = new Set(["accounting_manager", "tax_manager", "accountant"]);

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

  const isStaff = !!user && STAFF_ROLES.has(user.role);
  const canShow = isStaff;
  const activeTenantSlug = impersonatingTenantSlug ?? null;

  const { data: tenants = [] } = trpc.tenant.list.useQuery(undefined, {
    enabled: !!user && isStaff,
    staleTime: 60_000,
  });

  const tenantLabel = useMemo(() => {
    if (!activeTenantSlug) return "No client selected";
    const found = tenants.find((t: any) => t.slug === activeTenantSlug);
    return found?.company_name ?? activeTenantSlug;
  }, [activeTenantSlug, tenants]);

  const tickerRef = useRef<number | null>(null);
  const restoreGuardRef = useRef<string | null>(null);

  const hydrate = useCallback(async () => {
    // Non-blocking fail-safe: never throw outside.
    try {
      if (!user || !isStaff) {
        setMounted(true);
        return;
      }

      // Defensive guard requested: skip restore if no impersonation context.
      // Timer remains usable, but we avoid restore queries in neutral mode.
      if (!activeTenantSlug) {
        console.log("[FloatingTimerHydrate] skipped (no impersonation)", {
          userId: user.id,
          role: user.role,
        });
        setRunningEntry(null);
        setTickingSeconds(0);
        setTodayTrackedSeconds(0);
        setMounted(true);
        return;
      }

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

      const running = await getRunningTimerForStaff(user.id);
      console.log("[FloatingTimerRestore] running lookup", {
        userId: user.id,
        tenantSlug: activeTenantSlug,
        found: !!running,
        runningTenantSlug: running?.tenant_slug ?? null,
      });

      // Only auto-restore when running entry matches current impersonated tenant.
      const scopedRunning = running && running.tenant_slug === activeTenantSlug ? running : null;
      setRunningEntry(scopedRunning);

      if (scopedRunning?.started_at) {
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(scopedRunning.started_at).getTime()) / 1000));
        setTickingSeconds(elapsed);
        if (!notesDraft && scopedRunning.notes) setNotesDraft(scopedRunning.notes);
      } else {
        setTickingSeconds(0);
      }

      const tracked = await getTodayTrackedSeconds(user.id, activeTenantSlug);
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
    if (!activeTenantSlug) {
      setError("Select a client with View as before starting timer.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const tenant = tenants.find((t: any) => t.slug === activeTenantSlug);

      console.log("[FloatingTimerStart]", {
        userId: user.id,
        tenantSlug: activeTenantSlug,
      });

      const { entry } = await startOrResumeTimer({
        staffUserId: user.id,
        tenantSlug: activeTenantSlug,
        organizationId: tenant?.id != null ? String(tenant.id) : null,
        notes: notesDraft || null,
        projectId: projectId || null,
        taskId: taskId || null,
        billable,
      });

      setRunningEntry(entry as TimeEntryRow);
      setExpanded(false);
      const tracked = await getTodayTrackedSeconds(user.id, activeTenantSlug);
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
    tenants,
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
        entryId: runningEntry.id,
      });

      await stopTimer({
        entryId: String(runningEntry.id),
        staffUserId: user.id,
        startedAt: runningEntry.started_at,
        notes: notesDraft || null,
        projectId: projectId || null,
        taskId: taskId || null,
        billable,
      });

      setRunningEntry(null);
      setTickingSeconds(0);
      const tracked = await getTodayTrackedSeconds(user.id, activeTenantSlug);
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
    refresh: hydrate,
  };
}
