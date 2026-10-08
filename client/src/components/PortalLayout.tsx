import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  TrendingUp,
  Users,
  ShoppingCart,
  UserCog,
  Bell,
  Activity,
  StickyNote,
  Check,
  ChevronsUpDown,
  CalendarDays,
  ShieldAlert,
  Sun,
  Moon,
} from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { usePortal } from "../contexts/PortalContext";
import { useTheme } from "../contexts/ThemeContext";
import { trpc } from "../lib/trpc";
import { PACKAGE_TIERS, TAB_ACCESS, hasAccess, type PackageTier } from "../../../shared/tiers";
import ChangePasswordDialog from "./ChangePasswordDialog";
import FloatingTimerWidget from "./FloatingTimerWidget";
import PortalAiLauncher from "./portal-ai/PortalAiLauncher";
import PortalAiPanel from "./portal-ai/PortalAiPanel";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  disabled?: boolean;
  disabledLabel?: string;
  /** key into TAB_ACCESS — omit for items always visible (admin nav) */
  featureKey?: string;
}

// Nav order matches reference dashboard exactly
const CLIENT_NAV: NavItem[] = [
  { id: "overview",          label: "Overview",          featureKey: "overview",          icon: <LayoutDashboard size={16} />, href: "/portal" },
  { id: "clients",           label: "Clients",           featureKey: "clients",           icon: <Users size={16} />,           href: "/portal/clients" },
  { id: "sales_tracker",     label: "Sales Tracker",     featureKey: "sales_tracker",     icon: <ShoppingCart size={16} />,    href: "/portal/sales" },
  { id: "financials",        label: "Financials",        featureKey: "financials",        icon: <BarChart3 size={16} />,       href: "/portal/financials" },
  { id: "coaching",          label: "Coaching",          featureKey: "coaching",          icon: <ShieldAlert size={16} />,     href: "/portal/coaching" },
  { id: "client_meeting",    label: "Client Meeting",    featureKey: "client_meeting",    icon: <CalendarDays size={16} />,    href: "/portal/coaching/client-meeting", disabled: true, disabledLabel: "Coming soon" },
  { id: "documents",         label: "Portal",            featureKey: "documents",         icon: <FolderOpen size={16} />,      href: "/portal/documents" },
  { id: "reports",           label: "Reports",           featureKey: "reports",           icon: <TrendingUp size={16} />,      href: "/portal/reports" },
  { id: "chat",              label: "Workspace Chat",    featureKey: "chat",              icon: <MessageSquare size={16} />,   href: "/portal/chat" },
  { id: "notes",             label: "Notes",             featureKey: "overview",          icon: <StickyNote size={16} />,      href: "/portal/notes" },
  { id: "activity_log",      label: "Activity Log",      featureKey: "overview",          icon: <Activity size={16} />,        href: "/portal/activity-log" },
  { id: "profile",           label: "Settings",          featureKey: "overview",          icon: <Bell size={16} />,            href: "/portal/profile" },
];

const ADMIN_NAV: NavItem[] = [
  { id: "admin_dashboard",   label: "Dashboard",        icon: <LayoutDashboard size={16} />, href: "/admin" },
  { id: "admin_clients",     label: "Clients",          icon: <Users size={16} />,           href: "/admin/clients" },
  { id: "admin_team",        label: "Team",             icon: <UserCog size={16} />,         href: "/admin/team" },
  { id: "admin_chat",        label: "Chat",             icon: <MessageSquare size={16} />,   href: "/admin/chat" },
  { id: "admin_data_entry",  label: "Data Entry",       icon: <FolderOpen size={16} />,      href: "/admin/data-entry" },
  { id: "admin_activity_log",label: "Activity Log",     icon: <Activity size={16} />,        href: "/admin/activity-log" },
  { id: "admin_profile",     label: "Settings",         icon: <Bell size={16} />,            href: "/admin/profile" },
];

interface PortalLayoutProps {
  children: ReactNode;
  isAdmin?: boolean;
}

export default function PortalLayout({ children, isAdmin = false }: PortalLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { impersonatingTenantSlug, setImpersonatingTenantSlug, aiCoachingPeriod, aiFinancialPeriod } = usePortal();

  const isStaffPortfolioUser = !!user && ["accounting_manager", "tax_manager", "accountant"].includes(user.role);
  const isStaffOrAdmin = !!user && ["admin", "accounting_manager", "tax_manager", "accountant"].includes(user.role);

  const utils = trpc.useUtils();
  const { data: tenant } = trpc.tenant.me.useQuery(undefined, {
    enabled: !isAdmin && !impersonatingTenantSlug && !isStaffPortfolioUser,
  });

  const isClientUser = user?.role === "client";
  const isClientFacingExperience = isClientUser || !!impersonatingTenantSlug;
  const canShowPortalAi = !!user && !isClientFacingExperience;

  const { data: clientWorkspaces = [] } = trpc.clientWorkspaces.list.useQuery(undefined, {
    enabled: !!isClientUser,
    staleTime: 30_000,
  });
  const { data: currentClientWorkspace } = trpc.clientWorkspaces.current.useQuery(undefined, {
    enabled: !!isClientUser,
    staleTime: 10_000,
  });

  const switchClientWorkspace = trpc.clientWorkspaces.switch.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.tenant.me.invalidate(),
        utils.tenant.list.invalidate(),
        utils.clientWorkspaces.current.invalidate(),
        utils.clientWorkspaces.list.invalidate(),
        utils.roster?.list?.invalidate?.() ?? Promise.resolve(),
        utils.documents?.list?.invalidate?.() ?? Promise.resolve(),
        utils.documents?.dashboard?.invalidate?.() ?? Promise.resolve(),
        utils.documents?.listFolders?.invalidate?.() ?? Promise.resolve(),
        utils.chat?.list?.invalidate?.() ?? Promise.resolve(),
        utils.chat?.unreadSummary?.invalidate?.() ?? Promise.resolve(),
        utils.coaching?.meetingsList?.invalidate?.() ?? Promise.resolve(),
        utils.coaching?.meetingsGet?.invalidate?.() ?? Promise.resolve(),
        utils.notes?.list?.invalidate?.() ?? Promise.resolve(),
      ]);
      toast.success(`Switched to ${res.workspace.companyName}`);
      if (!location.startsWith("/portal/")) navigate("/portal");
    },
    onError: (error) => {
      toast.error(error.message || "Unable to switch workspace");
    },
  });

  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [impersonationTierLoading, setImpersonationTierLoading] = useState(false);
  const [exitViewConfirmOpen, setExitViewConfirmOpen] = useState(false);
  const [exitViewLoading, setExitViewLoading] = useState(false);
  const [pendingExitTimerEntryId, setPendingExitTimerEntryId] = useState<string | null>(null);

  const [switchTimerConfirmOpen, setSwitchTimerConfirmOpen] = useState(false);
  const [switchTimerLoading, setSwitchTimerLoading] = useState(false);
  const [pendingSwitchTargetSlug, setPendingSwitchTargetSlug] = useState<string | null>(null);
  const [pendingSwitchCurrentName, setPendingSwitchCurrentName] = useState<string | null>(null);
  const [pendingSwitchTargetName, setPendingSwitchTargetName] = useState<string | null>(null);
  const [pendingSwitchTimerEntryId, setPendingSwitchTimerEntryId] = useState<string | null>(null);

  const [portalAiOpen, setPortalAiOpen] = useState(false);
  const portalAiPanelRef = useRef<HTMLDivElement | null>(null);
  const portalAiLauncherRef = useRef<HTMLDivElement | null>(null);

  const runningTimerQuery = trpc.time.timerRunning.useQuery(
    impersonatingTenantSlug ? { tenantSlug: impersonatingTenantSlug } : undefined,
    {
      enabled: !!impersonatingTenantSlug,
      staleTime: 5_000,
      refetchInterval: 10_000,
    }
  );

  const stopTimerMutation = trpc.time.timerStop.useMutation();

  useEffect(() => {
    if (!user) {
      setImpersonatingTenantSlug(null);
      setImpersonationTierLoading(false);
      return;
    }

    const canUseViewAs = ["admin", "accounting_manager", "tax_manager", "accountant"].includes(user.role);
    if (!canUseViewAs) {
      setImpersonationTierLoading(false);
      return;
    }

    let canceled = false;

    (async () => {
      try {
        setImpersonationTierLoading(true);
        const res = await fetch("/api/auth/view-as-client/current", {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          if (!canceled && (res.status === 401 || res.status === 403)) {
            setImpersonatingTenantSlug(null);
          }
          if (!canceled) setImpersonationTierLoading(false);
          return;
        }

        const payload = await res.json().catch(() => ({} as any));
        const slug = typeof payload?.tenantSlug === "string" && payload.tenantSlug.trim()
          ? payload.tenantSlug.trim()
          : null;

        if (canceled) return;
        setImpersonatingTenantSlug(slug);
        // Never force cfo while impersonating; actual tenant tier is resolved below.
      } catch {
        // no-op; keep current local context on transient errors
        if (!canceled) setImpersonationTierLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [user?.id, user?.role, setImpersonatingTenantSlug]);

  const displayLabel = isAdmin
    ? "Admin"
    : impersonatingTenantSlug
      ? "Viewing as client"
      : isStaffPortfolioUser
        ? "Assigned Clients"
        : (tenant?.company_name ?? "Client Portal");

  const { data: staffWorkspaces = [] } = trpc.tenant.list.useQuery(undefined, {
    enabled: !!isStaffOrAdmin,
    staleTime: 30_000,
  });

  const matchedImpersonatedTenant = useMemo(() => {
    if (!impersonatingTenantSlug) return null;
    const normalized = String(impersonatingTenantSlug).trim().toLowerCase();
    return (staffWorkspaces as any[]).find((t: any) => String(t?.slug ?? "").trim().toLowerCase() === normalized) ?? null;
  }, [impersonatingTenantSlug, staffWorkspaces]);

  const impersonatedTier = (matchedImpersonatedTenant?.package_tier ?? null) as PackageTier | null;

  useEffect(() => {
    if (!impersonatingTenantSlug) {
      setImpersonationTierLoading(false);
      return;
    }
    const isKnownTier = !!impersonatedTier && PACKAGE_TIERS.includes(impersonatedTier);
    setImpersonationTierLoading(!isKnownTier);
  }, [impersonatingTenantSlug, impersonatedTier]);

  // Determine active tier used for package-gated sidebar visibility.
  // In View-as-Client mode, always use the impersonated tenant's real package tier.
  const activeTier: PackageTier = impersonatingTenantSlug
    ? ((impersonatedTier && PACKAGE_TIERS.includes(impersonatedTier)) ? impersonatedTier : "legacy")
    : isAdmin
      ? "cfo"
      : isStaffPortfolioUser
        ? "cfo"
        : (tenant?.package_tier ?? "legacy") as PackageTier;

  const workspaceOptions = useMemo(() => {
    if (isClientUser) {
      return (clientWorkspaces ?? []).map((w: any) => ({
        slug: String(w.slug),
        companyName: String(w.companyName || w.slug),
      }));
    }
    if (isStaffOrAdmin && impersonatingTenantSlug) {
      return (staffWorkspaces ?? []).map((w: any) => ({
        slug: String(w.slug),
        companyName: String(w.company_name || w.slug),
      }));
    }
    return [] as Array<{ slug: string; companyName: string }>;
  }, [isClientUser, clientWorkspaces, isStaffOrAdmin, impersonatingTenantSlug, staffWorkspaces]);

  const activeWorkspaceSlug = isClientUser
    ? (currentClientWorkspace?.tenantSlug ?? user?.tenant_slug ?? null)
    : (impersonatingTenantSlug ?? null);

  // UX-only AI persistence scope. This does NOT authorize data access.
  // Server-side auth + tenant resolution remains authoritative.
  const aiTenantScopeKey = useMemo(() => {
    const slug = typeof activeWorkspaceSlug === "string" ? activeWorkspaceSlug.trim().toLowerCase() : "";
    return slug || "no-active-tenant";
  }, [activeWorkspaceSlug]);

  const activeWorkspaceName = useMemo(() => {
    const hit = workspaceOptions.find((w) => w.slug === activeWorkspaceSlug);
    return hit?.companyName ?? null;
  }, [workspaceOptions, activeWorkspaceSlug]);

  const canSwitchWorkspace = workspaceOptions.length > 1;

  const isPortalChatPage = location === "/portal/chat" || location.startsWith("/portal/chat/");

  // Collision strategy:
  // - default: bottom-right with standard margin
  // - timer present in view-as-client: move AI up to avoid overlap with timer widget area
  // - /portal/chat: move AI up further to keep floating DM window usable
  const aiBottomOffset = isPortalChatPage
    ? 420
    : impersonatingTenantSlug
      ? 120
      : 16;

  useEffect(() => {
    if (!canShowPortalAi && portalAiOpen) {
      setPortalAiOpen(false);
    }
  }, [canShowPortalAi, portalAiOpen]);

  useEffect(() => {
    if (!portalAiOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const insidePanel = !!portalAiPanelRef.current?.contains(target);
      const insideLauncher = !!portalAiLauncherRef.current?.contains(target);

      if (!insidePanel && !insideLauncher) {
        setPortalAiOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [portalAiOpen]);

  console.log("[PortalShellScope]", {
    userId: user?.id,
    role: user?.role,
    tenantSlug: user?.tenant_slug,
    displayLabel,
  });

  const baseNav = isAdmin && !impersonatingTenantSlug ? ADMIN_NAV : CLIENT_NAV;

  const isActualClientLogin = user?.role === "client";

  const navItems = baseNav.filter(item => {
        if (item.id === "activity_log") {
          // Admin-only, and hidden during View-as-Client impersonation.
          return !!user && user.role === "admin" && !impersonatingTenantSlug;
        }
        if (item.id === "notes") {
          // Internal notes are available only in View-as-Client for staff/admin users.
          return isStaffOrAdmin && !!impersonatingTenantSlug;
        }
        if (item.id === "profile") {
          // Hide Settings in client-like experiences:
          // - real client login
          // - staff/admin View-as-Client impersonation
          return !!user && user.role !== "client" && !impersonatingTenantSlug;
        }
        if (!impersonatingTenantSlug && isStaffPortfolioUser && (item.featureKey === "sales_tracker" || item.featureKey === "financials")) {
          return false;
        }
        // Hide Coaching and Client Meeting in accountant's regular (non View-as-Client) sidebar only.
        if (user?.role === "accountant" && (item.id === "coaching" || item.id === "client_meeting") && !impersonatingTenantSlug) {
          return false;
        }
        // Accountants access client portal via Admin/Clients -> View As Client,
        // so hide direct "Portal" nav entry in their normal sidebar only.
        // Keep it visible while impersonating (View As Client).
        if (user?.role === "accountant" && item.id === "documents" && !impersonatingTenantSlug) {
          return false;
        }
        if (impersonatingTenantSlug && impersonationTierLoading) {
          // Restrictive fallback while resolving impersonated tenant package.
          return false;
        }
        return !item.featureKey || hasAccess(activeTier, TAB_ACCESS[item.featureKey] ?? "legacy");
      });


  const sidebarDisplayName = user?.role === "client"
    ? (activeWorkspaceName ?? displayLabel ?? user?.name ?? "—")
    : (user?.name ?? "—");

  const initials = sidebarDisplayName
    ? sidebarDisplayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const workspaceInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  async function performExitViewCleanup() {
    try {
      await fetch("/api/auth/view-as-client/stop", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // no-op: local state reset still proceeds
    }
    setImpersonatingTenantSlug(null);
    if (user?.role === "admin") {
      navigate("/admin/clients");
    }
  }

  async function handleExitViewClick() {
    if (!impersonatingTenantSlug) {
      await performExitViewCleanup();
      return;
    }

    const running = runningTimerQuery.data as any;
    const hasRunningClientTimer = !!running?.id && String(running?.status || "") === "running";

    if (!hasRunningClientTimer) {
      await performExitViewCleanup();
      return;
    }

    setPendingExitTimerEntryId(String(running.id));
    setExitViewConfirmOpen(true);
  }

  async function handleConfirmStopTimerAndExit() {
    if (!impersonatingTenantSlug || !pendingExitTimerEntryId) {
      setExitViewConfirmOpen(false);
      return;
    }

    setExitViewLoading(true);
    try {
      await stopTimerMutation.mutateAsync({
        entryId: pendingExitTimerEntryId,
        tenantSlug: impersonatingTenantSlug,
      });

      setExitViewConfirmOpen(false);
      setPendingExitTimerEntryId(null);
      await runningTimerQuery.refetch();
      await performExitViewCleanup();
    } catch (e: any) {
      toast.error(e?.message || "Couldn’t stop timer. Please try again.");
      setExitViewConfirmOpen(false);
      // Stay in current client context and keep timer running.
    } finally {
      setExitViewLoading(false);
    }
  }

  async function performStaffWorkspaceSwitch(targetSlug: string) {
    const res = await fetch("/api/auth/view-as-client/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tenantSlug: targetSlug }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || "Unable to switch workspace");

    setImpersonatingTenantSlug(targetSlug);
    setImpersonationTierLoading(true);

    await Promise.all([
      utils.tenant.me.invalidate(),
      utils.tenant.list.invalidate(),
      utils.roster?.list?.invalidate?.() ?? Promise.resolve(),
      utils.documents?.list?.invalidate?.() ?? Promise.resolve(),
      utils.documents?.dashboard?.invalidate?.() ?? Promise.resolve(),
      utils.documents?.listFolders?.invalidate?.() ?? Promise.resolve(),
      utils.chat?.list?.invalidate?.() ?? Promise.resolve(),
      utils.chat?.unreadSummary?.invalidate?.() ?? Promise.resolve(),
      utils.coaching?.meetingsList?.invalidate?.() ?? Promise.resolve(),
      utils.coaching?.meetingsGet?.invalidate?.() ?? Promise.resolve(),
      utils.notes?.list?.invalidate?.() ?? Promise.resolve(),
      utils.time?.timerRunning?.invalidate?.() ?? Promise.resolve(),
      utils.time?.timerTodayTracked?.invalidate?.() ?? Promise.resolve(),
    ]);

    toast.success(`Switched to ${payload?.workspace?.companyName || targetSlug}`);
    if (!location.startsWith("/portal/")) navigate("/portal");
  }

  async function handleConfirmStopTimerAndSwitch() {
    if (!impersonatingTenantSlug || !pendingSwitchTargetSlug || !pendingSwitchTimerEntryId) {
      setSwitchTimerConfirmOpen(false);
      return;
    }

    setSwitchTimerLoading(true);
    try {
      await stopTimerMutation.mutateAsync({
        entryId: pendingSwitchTimerEntryId,
        tenantSlug: impersonatingTenantSlug,
      });

      await runningTimerQuery.refetch();
      await performStaffWorkspaceSwitch(pendingSwitchTargetSlug);

      setSwitchTimerConfirmOpen(false);
      setPendingSwitchTargetSlug(null);
      setPendingSwitchCurrentName(null);
      setPendingSwitchTargetName(null);
      setPendingSwitchTimerEntryId(null);
    } catch (e: any) {
      toast.error(e?.message || "Couldn’t stop timer. Workspace was not switched.");
      // Stay in current workspace and keep current timer running.
    } finally {
      setSwitchTimerLoading(false);
      setWorkspacePickerOpen(false);
    }
  }

  async function handleWorkspaceSwitch(targetSlug: string) {
    if (!targetSlug || targetSlug === activeWorkspaceSlug) {
      setWorkspacePickerOpen(false);
      return;
    }

    if (isClientUser) {
      await switchClientWorkspace.mutateAsync({ tenantSlug: targetSlug });
      setWorkspacePickerOpen(false);
      return;
    }

    if (isStaffOrAdmin) {
      try {
        if (impersonatingTenantSlug) {
          const runningResult = await runningTimerQuery.refetch();
          const running = runningResult.data as any;
          const hasRunningClientTimer = !!running?.id && String(running?.status || "") === "running";

          if (hasRunningClientTimer) {
            const targetCompanyName = workspaceOptions.find((w) => w.slug === targetSlug)?.companyName ?? targetSlug;
            setPendingSwitchTargetSlug(targetSlug);
            setPendingSwitchCurrentName(activeWorkspaceName ?? impersonatingTenantSlug);
            setPendingSwitchTargetName(targetCompanyName);
            setPendingSwitchTimerEntryId(String(running.id));
            setSwitchTimerConfirmOpen(true);
            return;
          }
        }

        await performStaffWorkspaceSwitch(targetSlug);
      } catch (e: any) {
        toast.error(e?.message || "Unable to switch workspace");
      } finally {
        setWorkspacePickerOpen(false);
      }
    }
  }

  const isDark = theme === "dark";

  const shellBackgroundColor = isDark ? "#0a0a0a" : "var(--background)";
  const sidebarBackgroundColor = isDark ? "#111111" : "var(--sidebar)";
  const sidebarBorderColor = isDark ? "#1f1f1f" : "var(--sidebar-border)";
  const sidebarCaptionColor = isDark ? "#666" : "var(--muted-foreground)";
  const navDefaultColor = isDark ? "#888" : "var(--sidebar-foreground)";
  const navDisabledColor = isDark ? "#666" : "var(--muted-foreground)";
  const navActiveColor = isDark ? "#00d4aa" : "var(--sidebar-primary)";
  const navActiveBackground = isDark ? "rgba(0,212,170,0.08)" : "var(--sidebar-accent)";
  const accountNameColor = isDark ? "#e5e5e5" : "var(--sidebar-foreground)";
  const accountMetaColor = isDark ? "#555" : "var(--muted-foreground)";
  const avatarBg = isDark ? "rgba(0,212,170,0.15)" : "color-mix(in oklab, var(--sidebar-primary) 18%, transparent)";
  const avatarColor = isDark ? "#00d4aa" : "var(--sidebar-primary)";
  const navDotColor = isDark ? "#00d4aa" : "var(--sidebar-primary)";
  const appearanceLabelColor = isDark ? "#666" : "var(--muted-foreground)";
  const appearanceCardBg = isDark ? "rgba(255,255,255,0.02)" : "var(--sidebar-accent)";
  const appearanceCardBorder = isDark ? "rgba(255,255,255,0.10)" : "var(--sidebar-border)";

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: shellBackgroundColor }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-48 shrink-0 border-r"
        style={{ backgroundColor: sidebarBackgroundColor, borderColor: sidebarBorderColor }}
      >
        {/* Logo / Workspace switcher */}
        <div className="relative flex flex-col items-center px-3 py-4 border-b gap-1.5" style={{ borderColor: sidebarBorderColor }}>
          {canSwitchWorkspace ? (
            <Popover open={workspacePickerOpen} onOpenChange={setWorkspacePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="group relative flex flex-col items-center gap-1.5"
                  aria-label="Workspace switcher"
                >
                  <div className="relative bg-white rounded-lg px-2 py-1.5 transition-transform duration-200 group-hover:scale-[1.05]">
                    <img
                      src="https://d2xsxph8kpxj0f.cloudfront.net/310519663280358154/DHoPFRmeekJSRWmQf4bAQb/kynli-logo_c9409708.png"
                      alt="KynLi Consulting"
                      className="h-7 w-auto object-contain"
                    />
                    {canSwitchWorkspace && (
                      <span
                        title="Switch Business"
                        className={cn(
                          "absolute top-0.5 right-0.5 h-4 w-4 rounded-full border shadow-sm flex items-center justify-center pointer-events-none",
                          isDark ? "border-white/20 bg-zinc-900/80" : "border-border bg-card"
                        )}
                      >
                        <ChevronsUpDown size={10} className={cn(isDark ? "text-white" : "text-foreground")} />
                      </span>
                    )}
                  </div>
                  {!impersonatingTenantSlug && (
                    <span className="text-xs truncate w-full text-center" style={{ color: sidebarCaptionColor }}>
                      {isClientUser ? (activeWorkspaceName ?? displayLabel) : displayLabel}
                    </span>
                  )}
                </button>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                side="right"
                className={cn(
                  "w-72 p-2",
                  isDark ? "border-zinc-800 bg-zinc-950 text-zinc-100" : "border-border bg-popover text-popover-foreground"
                )}
              >
                <div className={cn("px-2 py-1.5 text-xs uppercase tracking-wide", isDark ? "text-zinc-500" : "text-muted-foreground")}>Switch workspace</div>
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {workspaceOptions.map((w) => {
                    const active = w.slug === activeWorkspaceSlug;
                    return (
                      <button
                        key={w.slug}
                        type="button"
                        onClick={() => void handleWorkspaceSwitch(w.slug)}
                        className={cn(
                          "w-full flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                          active
                            ? (isDark ? "bg-teal-500/15 text-teal-300" : "bg-primary/10 text-primary")
                            : (isDark ? "hover:bg-zinc-900 text-zinc-200" : "hover:bg-accent text-foreground"),
                        )}
                      >
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold", isDark ? "bg-zinc-800 text-zinc-300" : "bg-muted text-muted-foreground")}>
                          {workspaceInitials(w.companyName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{w.companyName}</div>
                          <div className={cn("truncate text-xs", isDark ? "text-zinc-500" : "text-muted-foreground")}>{w.slug}</div>
                        </div>
                        {active ? <Check size={14} className={cn(isDark ? "text-teal-300" : "text-primary")} /> : null}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="group relative flex flex-col items-center gap-1.5">
              <div className="relative bg-white rounded-lg px-2 py-1.5">
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663280358154/DHoPFRmeekJSRWmQf4bAQb/kynli-logo_c9409708.png"
                  alt="KynLi Consulting"
                  className="h-7 w-auto object-contain"
                />
              </div>
              {!impersonatingTenantSlug && (
                <span className="text-xs truncate w-full text-center" style={{ color: sidebarCaptionColor }}>
                  {isClientUser ? (activeWorkspaceName ?? displayLabel) : displayLabel}
                </span>
              )}
            </div>
          )}

          {/* switch badge is rendered inside logo block below */}
        </div>

        {/* Impersonation banner */}
        {impersonatingTenantSlug && (
          <div
            className="mx-3 mt-2 px-2 py-1.5 rounded"
            style={{
              backgroundColor: isDark ? "rgba(245,158,11,0.1)" : "color-mix(in oklab, var(--chart-5) 16%, transparent)",
              border: isDark ? "1px solid rgba(245,158,11,0.2)" : "1px solid color-mix(in oklab, var(--chart-5) 35%, var(--border))",
            }}
          >
            <p className="text-xs font-medium leading-tight" style={{ color: isDark ? "#f59e0b" : "color-mix(in oklab, var(--chart-5) 75%, var(--foreground))" }}>Viewing as client</p>
            <button
              onClick={() => {
                void handleExitViewClick();
              }}
              className="text-xs underline mt-0.5 hover:opacity-80 transition-opacity"
              style={{ color: isDark ? "rgba(245,158,11,0.7)" : "color-mix(in oklab, var(--chart-5) 60%, var(--foreground))" }}
            >
              Exit view
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isCoachingNav = item.id === "coaching";
            const isClientMeetingNav = item.id === "client_meeting";
            const isCoachingActive = location === "/portal/coaching";
            const isClientMeetingActive = location === "/portal/coaching/client-meeting" || location.startsWith("/portal/coaching/client-meeting/");
            const isActive = isCoachingNav
              ? isCoachingActive
              : isClientMeetingNav
                ? isClientMeetingActive
                : (location === item.href || (item.href !== "/portal" && item.href.length > 6 && location.startsWith(item.href)));

            const clientComingSoon = isActualClientLogin && (item.id === "clients" || item.id === "sales_tracker");
            const isDisabled = !!item.disabled || clientComingSoon;
            const disabledLabel = isDisabled ? (item.disabledLabel ?? "Coming soon") : undefined;

            const navRow = (
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150",
                  isDisabled
                    ? "opacity-45 cursor-not-allowed"
                    : isActive
                      ? "font-medium"
                      : "hover:opacity-80"
                )}
                style={isDisabled
                  ? { color: navDisabledColor, backgroundColor: "transparent" }
                  : isActive
                    ? { color: navActiveColor, backgroundColor: navActiveBackground }
                    : { color: navDefaultColor }
                }
                aria-disabled={isDisabled ? "true" : undefined}
                title={disabledLabel || undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {disabledLabel ? (
                  <span className={cn("ml-auto text-[10px] uppercase tracking-wide", isDark ? "text-zinc-500" : "text-muted-foreground")}>{disabledLabel}</span>
                ) : isActive ? (
                  <span className="ml-auto shrink-0 w-1 h-1 rounded-full" style={{ backgroundColor: navDotColor }} />
                ) : null}
              </div>
            );

            if (isDisabled) {
              return <div key={item.id}>{navRow}</div>;
            }

            return (
              <Link key={item.id} href={item.href}>
                {navRow}
              </Link>
            );
          })}
        </nav>

        {/* Appearance + User section */}
        <div className="border-t p-3" style={{ borderColor: sidebarBorderColor }}>
          <div
            className="mb-2.5 rounded-md border p-2"
            style={{ backgroundColor: appearanceCardBg, borderColor: appearanceCardBorder }}
          >
            <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: appearanceLabelColor }}>
              Appearance
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn(
                  "h-7 rounded-md border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors",
                  theme === "light"
                    ? (isDark
                      ? "border-teal-400/40 bg-teal-500/15 text-teal-200"
                      : "border-primary/40 bg-primary/15 text-primary")
                    : (isDark
                      ? "border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06]"
                      : "border-border bg-background text-foreground/80 hover:bg-accent")
                )}
                aria-pressed={theme === "light"}
                aria-label="Switch to Light Mode"
                title="Light Mode"
              >
                <Sun size={12} />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn(
                  "h-7 rounded-md border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors",
                  theme === "dark"
                    ? (isDark
                      ? "border-teal-400/40 bg-teal-500/15 text-teal-200"
                      : "border-primary/40 bg-primary/15 text-primary")
                    : (isDark
                      ? "border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06]"
                      : "border-border bg-background text-foreground/80 hover:bg-accent")
                )}
                aria-pressed={theme === "dark"}
                aria-label="Switch to Dark Mode"
                title="Dark Mode"
              >
                <Moon size={12} />
                <span>Dark</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
              style={{ backgroundColor: avatarBg, color: avatarColor }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate leading-tight" style={{ color: accountNameColor }}>{sidebarDisplayName}</p>
              <p className="text-xs truncate leading-tight" style={{ color: accountMetaColor }}>{user?.email ?? ""}</p>
            </div>
          </div>
          {/* Change Password — only for client users (not admins, not impersonating) */}
          {!isAdmin && !impersonatingTenantSlug && user?.role !== "admin" && (
            <button
              onClick={() => setChangePasswordOpen(true)}
              className="flex items-center gap-1.5 text-xs transition-colors w-full hover:opacity-80 mb-1.5"
              style={{ color: accountMetaColor }}
            >
              <KeyRound size={12} />
              <span>Change Password</span>
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await fetch("/api/auth/view-as-client/stop", {
                  method: "POST",
                  credentials: "include",
                });
              } catch {
                // ignore; logout will still proceed and clear local state
              }
              setImpersonatingTenantSlug(null);
              await logout();
            }}
            className="flex items-center gap-1.5 text-xs transition-colors w-full hover:opacity-80"
            style={{ color: accountMetaColor }}
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Exit View confirmation */}
      <Dialog open={exitViewConfirmOpen}>
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn("max-w-md text-foreground", isDark ? "border-white/15 bg-[#111111]" : "border-border bg-card")}
        >
          <DialogHeader>
            <DialogTitle>Stop timer and exit client view?</DialogTitle>
            <DialogDescription>
              You’re currently tracking time for {activeWorkspaceName ?? impersonatingTenantSlug ?? "this client"}. Exiting client view will stop this timer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                if (exitViewLoading) return;
                setExitViewConfirmOpen(false);
                setPendingExitTimerEntryId(null);
              }}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm",
                isDark ? "border-white/15 bg-white/[0.02] hover:bg-white/[0.05]" : "border-border bg-background hover:bg-accent"
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={exitViewLoading}
              onClick={() => void handleConfirmStopTimerAndExit()}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm disabled:opacity-60",
                isDark ? "bg-teal-500 text-black hover:bg-teal-400" : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {exitViewLoading ? "Stopping..." : "Stop Timer & Exit"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workspace switch + timer confirmation */}
      <Dialog open={switchTimerConfirmOpen}>
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn("max-w-md text-foreground", isDark ? "border-white/15 bg-[#111111]" : "border-border bg-card")}
        >
          <DialogHeader>
            <DialogTitle>Switch workspace and stop timer?</DialogTitle>
            <DialogDescription>
              You’re currently tracking time for {pendingSwitchCurrentName ?? "this client"}. Switching to {pendingSwitchTargetName ?? "the selected client"} will stop the current timer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                if (switchTimerLoading) return;
                setSwitchTimerConfirmOpen(false);
                setPendingSwitchTargetSlug(null);
                setPendingSwitchCurrentName(null);
                setPendingSwitchTargetName(null);
                setPendingSwitchTimerEntryId(null);
              }}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm",
                isDark ? "border-white/15 bg-white/[0.02] hover:bg-white/[0.05]" : "border-border bg-background hover:bg-accent"
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={switchTimerLoading}
              onClick={() => void handleConfirmStopTimerAndSwitch()}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm disabled:opacity-60",
                isDark ? "bg-teal-500 text-black hover:bg-teal-400" : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {switchTimerLoading ? "Stopping..." : "Stop Timer & Switch"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: shellBackgroundColor }}>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {canShowPortalAi && (
          <>
            <PortalAiPanel
              ref={portalAiPanelRef}
              isOpen={portalAiOpen}
              pathname={location}
              bottomOffset={aiBottomOffset}
              aiUserId={user?.id != null ? String(user.id) : null}
              aiTenantScopeKey={aiTenantScopeKey}
              coachingSelectedPeriod={location.startsWith("/portal/coaching") ? aiCoachingPeriod : null}
              financialSelectedPeriod={location.startsWith("/portal/financials") ? aiFinancialPeriod : null}
              onClose={() => setPortalAiOpen(false)}
            />
            <div ref={portalAiLauncherRef}>
              <PortalAiLauncher
                isOpen={portalAiOpen}
                onClick={() => setPortalAiOpen((prev) => !prev)}
                bottomOffset={aiBottomOffset}
              />
            </div>
          </>
        )}

        <FloatingTimerWidget />
      </main>
    </div>
  );
}
