import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePortal } from "@/contexts/PortalContext";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckSquare, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function CoachingDashboard() {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();
  const now = new Date();
  const currentYear = now.getFullYear();

  const isStaff = !!user && ["admin", "accounting_manager", "tax_manager", "accountant"].includes(user.role);
  const canEditPriorities = user?.role !== "client";
  const allowClientSelector = isStaff && !impersonatingTenantSlug;

  const { data: staffWorkspaces = [] } = trpc.tenant.list.useQuery(undefined, {
    enabled: allowClientSelector,
    staleTime: 30_000,
  });

  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!allowClientSelector) {
      setSelectedTenantSlug(null);
      return;
    }
    if (!selectedTenantSlug && staffWorkspaces.length > 0) {
      const first = staffWorkspaces[0] as any;
      setSelectedTenantSlug(String(first?.slug || ""));
    }
  }, [allowClientSelector, selectedTenantSlug, staffWorkspaces]);

  const tenantSlug = impersonatingTenantSlug ?? selectedTenantSlug ?? undefined;

  const triggerQuery = trpc.coaching.triggerMonitorLatest.useQuery(
    { tenantSlug },
    { enabled: !allowClientSelector || !!tenantSlug, staleTime: 30_000 },
  );

  const prioritiesQuery = trpc.coaching.prioritiesList.useQuery(
    { year: currentYear, tenantSlug },
    { enabled: !allowClientSelector || !!tenantSlug, staleTime: 10_000 },
  );

  const createMutation = trpc.coaching.prioritiesCreate.useMutation({
    onSuccess: async () => {
      await prioritiesQuery.refetch();
      setNewTitle("");
    },
    onError: (err) => toast.error(err.message || "Unable to create priority."),
  });

  const toggleMutation = trpc.coaching.prioritiesToggle.useMutation({
    onSuccess: async () => {
      await prioritiesQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Unable to update priority."),
  });

  const deleteMutation = trpc.coaching.prioritiesDelete.useMutation({
    onSuccess: async () => {
      await prioritiesQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Unable to delete priority."),
  });

  const [newTitle, setNewTitle] = useState("");

  const priorities = (prioritiesQuery.data as Array<any>) || [];
  const openPriorities = priorities.filter((p) => !p.completed);
  const completedPriorities = priorities.filter((p) => !!p.completed);

  const monitorItems = (triggerQuery.data?.items as Array<any>) || [];
  const monitorSummary = triggerQuery.data?.summary || { total: 17, triggered: 0, clear: 0, unknown: 17 };

  const activeWorkspaceName = useMemo(() => {
    if (!allowClientSelector) return null;
    const hit = (staffWorkspaces as Array<any>).find((w) => String(w.slug) === String(selectedTenantSlug || ""));
    return hit?.company_name || hit?.slug || null;
  }, [allowClientSelector, selectedTenantSlug, staffWorkspaces]);

  return (
    <div className="px-6 py-8 xl:px-10">
      <div className="w-full max-w-[1800px] mx-auto space-y-8 xl:space-y-10">
        <header className="space-y-3 xl:space-y-4">
          <p className="text-xs uppercase tracking-[0.18em] font-semibold text-teal-300">Coaching Priorities</p>
          <h1 className="text-3xl sm:text-4xl xl:text-[2.7rem] leading-tight font-semibold text-foreground">
            {currentYear} coaching priorities
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground/90 max-w-5xl leading-relaxed">
            Keep every commitment open until it is complete. The trigger monitor surfaces the latest submitted
            financial review; red blocks deserve an immediate client conversation.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-zinc-900/45 p-5 sm:p-6 xl:p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-6 mb-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-zinc-200" />
                <h2 className="text-base sm:text-lg font-semibold text-foreground">CFO trigger monitor</h2>
              </div>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Only red blocks require attention. Select a client to review the latest submitted financials.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex items-center rounded-full border border-red-500/35 bg-red-950/30 px-2.5 py-1 text-[11px] font-medium text-red-200">
                  {monitorSummary.triggered} triggered
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-600/25 bg-emerald-950/20 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                  {monitorSummary.clear} clear
                </span>
                <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/50 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                  {monitorSummary.unknown} unknown
                </span>
                {triggerQuery.data?.latestSnapshot?.reportMonthLabel ? (
                  <span className="inline-flex items-center rounded-full border border-zinc-700/70 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                    Latest: {triggerQuery.data.latestSnapshot.reportMonthLabel}
                  </span>
                ) : activeWorkspaceName ? (
                  <span className="inline-flex items-center rounded-full border border-zinc-700/70 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                    {activeWorkspaceName}
                  </span>
                ) : null}
              </div>
            </div>

            {allowClientSelector ? (
              <div className="w-full lg:w-[320px]">
                <Select value={selectedTenantSlug ?? ""} onValueChange={(v) => setSelectedTenantSlug(v)}>
                  <SelectTrigger className="h-11 bg-zinc-950/70 border-zinc-700 rounded-xl">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(staffWorkspaces as Array<any>).map((w) => (
                      <SelectItem key={String(w.slug)} value={String(w.slug)}>
                        {String(w.company_name || w.slug)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {triggerQuery.isLoading ? (
            <div className="text-sm text-muted-foreground py-6">Loading trigger monitor…</div>
          ) : triggerQuery.isError ? (
            <div className="text-sm text-red-300 py-6">Unable to load trigger monitor.</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(185px,1fr))] gap-3.5 xl:gap-4">
              {monitorItems.map((item) => {
                const status = String(item.status || "unknown");
                const isTriggered = status === "triggered";
                const isUnknown = status === "unknown";

                const toneClass = isTriggered
                  ? "border-red-400/45 bg-gradient-to-b from-red-900/45 to-red-950/35"
                  : isUnknown
                    ? "border-zinc-700/80 bg-zinc-900/55"
                    : "border-zinc-700/75 bg-zinc-900/25";

                const titleClass = isTriggered
                  ? "text-red-100"
                  : isUnknown
                    ? "text-zinc-300"
                    : "text-zinc-100";

                const valueClass = isTriggered
                  ? "text-red-200/95"
                  : isUnknown
                    ? "text-zinc-500"
                    : "text-zinc-300";

                return (
                  <div
                    key={item.trigger_key}
                    className={`min-h-[132px] rounded-2xl border p-4 xl:p-4.5 flex flex-col justify-between ${toneClass}`}
                  >
                    <p className={`text-sm font-semibold leading-snug ${titleClass}`}>{item.label}</p>
                    <p className={`text-xs sm:text-sm mt-3 leading-relaxed ${valueClass}`}>
                      {item.display_value || "Not enough data"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-900/45 p-5 sm:p-6 xl:p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(260px,30%)_1fr] gap-4 xl:gap-6 items-start mb-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <CheckSquare className="w-4 h-4 text-teal-300" />
                <h3 className="text-xl sm:text-2xl font-semibold text-foreground">{currentYear} coaching priorities</h3>
              </div>
              <p className="text-sm text-muted-foreground">{openPriorities.length} open · {completedPriorities.length} complete</p>
            </div>

            <div className="flex items-center gap-2.5">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Add a coaching priority..."
                className="h-12 sm:h-14 rounded-xl bg-zinc-950/70 border-zinc-700 text-sm sm:text-base"
                disabled={!canEditPriorities}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!canEditPriorities || !newTitle.trim() || createMutation.isPending) return;
                    createMutation.mutate({ year: currentYear, tenantSlug, title: newTitle.trim() });
                  }
                }}
              />
              <Button
                type="button"
                variant="default"
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl shrink-0 bg-teal-400 text-black hover:bg-teal-300"
                disabled={!canEditPriorities || !newTitle.trim() || createMutation.isPending}
                onClick={() => {
                  if (!canEditPriorities || !newTitle.trim()) return;
                  createMutation.mutate({ year: currentYear, tenantSlug, title: newTitle.trim() });
                }}
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {prioritiesQuery.isLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading priorities…</div>
          ) : prioritiesQuery.isError ? (
            <div className="text-sm text-red-300 py-4">Unable to load priorities.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,56%)_minmax(0,44%)] gap-4 xl:gap-6 items-start">
              <div className="space-y-2.5">
                {openPriorities.length > 0 ? openPriorities.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center justify-between rounded-2xl border border-zinc-700/80 bg-zinc-900/35 px-4 py-3"
                  >
                    <label className="flex items-center gap-3 min-w-0 cursor-pointer">
                      <Checkbox
                        checked={!!p.completed}
                        onCheckedChange={(checked) => {
                          if (!canEditPriorities) return;
                          toggleMutation.mutate({ id: p.id, completed: checked === true, tenantSlug });
                        }}
                        disabled={!canEditPriorities || toggleMutation.isPending}
                      />
                      <span className="text-[15px] sm:text-base font-medium text-foreground truncate">{p.title}</span>
                    </label>
                    <button
                      type="button"
                      className="opacity-20 group-hover:opacity-60 transition-opacity text-zinc-400 hover:text-zinc-200"
                      onClick={() => deleteMutation.mutate({ id: p.id, tenantSlug })}
                      disabled={!canEditPriorities || deleteMutation.isPending}
                      aria-label={`Delete ${p.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )) : (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/30 p-4 text-sm text-zinc-400">
                    No open priorities yet.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Completed</p>
                <div className="space-y-2.5">
                  {completedPriorities.length > 0 ? completedPriorities.map((p) => (
                    <div
                      key={p.id}
                      className="group flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/20 px-4 py-3"
                    >
                      <label className="flex items-center gap-3 min-w-0 cursor-pointer">
                        <Checkbox
                          checked={!!p.completed}
                          onCheckedChange={(checked) => {
                            if (!canEditPriorities) return;
                            toggleMutation.mutate({ id: p.id, completed: checked === true, tenantSlug });
                          }}
                          disabled={!canEditPriorities || toggleMutation.isPending}
                        />
                        <span className="text-[15px] text-zinc-500 line-through truncate">{p.title}</span>
                      </label>
                      <button
                        type="button"
                        className="opacity-20 group-hover:opacity-60 transition-opacity text-zinc-500 hover:text-zinc-300"
                        onClick={() => deleteMutation.mutate({ id: p.id, tenantSlug })}
                        disabled={!canEditPriorities || deleteMutation.isPending}
                        aria-label={`Delete ${p.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/15 p-4 text-sm text-zinc-500">
                      No completed priorities yet.
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
                  Check a box to complete an item. Completed priorities remain below so the year’s progress is visible.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
