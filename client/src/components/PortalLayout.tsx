import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
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
} from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { usePortal } from "../contexts/PortalContext";
import { trpc } from "../lib/trpc";
import { TAB_ACCESS, hasAccess, type PackageTier } from "../../../shared/tiers";
import ChangePasswordDialog from "./ChangePasswordDialog";
import FloatingTimerWidget from "./FloatingTimerWidget";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { toast } from "sonner";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  /** key into TAB_ACCESS — omit for items always visible (admin nav) */
  featureKey?: string;
}

// Nav order matches reference dashboard exactly
const CLIENT_NAV: NavItem[] = [
  { id: "overview",          label: "Overview",          featureKey: "overview",          icon: <LayoutDashboard size={16} />, href: "/portal" },
  { id: "clients",           label: "Clients",           featureKey: "clients",           icon: <Users size={16} />,           href: "/portal/clients" },
  { id: "sales_tracker",     label: "Sales Tracker",     featureKey: "sales_tracker",     icon: <ShoppingCart size={16} />,    href: "/portal/sales" },
  { id: "financials",        label: "Financials",        featureKey: "financials",        icon: <BarChart3 size={16} />,       href: "/portal/financials" },
  { id: "coaching",          label: "Coaching",          featureKey: "coaching",          icon: <BookOpen size={16} />,        href: "/portal/coaching" },
  { id: "documents",         label: "Portal",            featureKey: "documents",         icon: <FolderOpen size={16} />,      href: "/portal/documents" },
  { id: "reports",           label: "Reports",           featureKey: "reports",           icon: <TrendingUp size={16} />,      href: "/portal/reports" },
  { id: "chat",              label: "Chat",              featureKey: "chat",              icon: <MessageSquare size={16} />,   href: "/portal/chat" },
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
  const [coachingExpanded, setCoachingExpanded] = useState(false);
  const { user, logout } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { impersonatingTenantSlug, setImpersonatingTenantSlug, effectiveTier, setEffectiveTier } = usePortal();

  const isStaffPortfolioUser = !!user && ["accounting_manager", "tax_manager", "accountant"].includes(user.role);
  const isStaffOrAdmin = !!user && ["admin", "accounting_manager", "tax_manager", "accountant"].includes(user.role);

  const utils = trpc.useUtils();
  const { data: tenant } = trpc.tenant.me.useQuery(undefined, {
    enabled: !isAdmin && !impersonatingTenantSlug && !isStaffPortfolioUser,
  });

  const isClientUser = user?.role === "client";
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

  // Determine the active tier: impersonated tenant uses effectiveTier set by admin;
  // client users use their own tenant tier; staff portfolio users get full client nav visibility.
  const activeTier: PackageTier = isAdmin
    ? "cfo"
    : isStaffPortfolioUser
      ? "cfo"
      : (impersonatingTenantSlug ? effectiveTier : (tenant?.package_tier ?? "legacy")) as PackageTier;

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

  const activeWorkspaceName = useMemo(() => {
    const hit = workspaceOptions.find((w) => w.slug === activeWorkspaceSlug);
    return hit?.companyName ?? null;
  }, [workspaceOptions, activeWorkspaceSlug]);

  const canSwitchWorkspace = workspaceOptions.length > 1;

  console.log("[PortalShellScope]", {
    userId: user?.id,
    role: user?.role,
    tenantSlug: user?.tenant_slug,
    displayLabel,
  });

  const baseNav = isAdmin && !impersonatingTenantSlug ? ADMIN_NAV : CLIENT_NAV;

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
        if (isStaffPortfolioUser && (item.featureKey === "sales_tracker" || item.featureKey === "financials")) {
          return false;
        }
        // Hide Coaching in accountant's regular (non View-as-Client) sidebar only.
        if (user?.role === "accountant" && item.id === "coaching" && !impersonatingTenantSlug) {
          return false;
        }
        // Accountants access client portal via Admin/Clients -> View As Client,
        // so hide direct "Portal" nav entry in their normal sidebar only.
        // Keep it visible while impersonating (View As Client).
        if (user?.role === "accountant" && item.id === "documents" && !impersonatingTenantSlug) {
          return false;
        }
        return !item.featureKey || hasAccess(activeTier, TAB_ACCESS[item.featureKey] ?? "legacy");
      });

  useEffect(() => {
    if (location.startsWith("/portal/coaching")) {
      setCoachingExpanded(true);
    }
  }, [location]);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const workspaceInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

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
        const res = await fetch("/api/auth/view-as-client/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenantSlug: targetSlug }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || "Unable to switch workspace");

        setImpersonatingTenantSlug(targetSlug);
        setEffectiveTier("cfo");

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
        ]);

        toast.success(`Switched to ${payload?.workspace?.companyName || targetSlug}`);
        if (!location.startsWith("/portal/")) navigate("/portal");
      } catch (e: any) {
        toast.error(e?.message || "Unable to switch workspace");
      } finally {
        setWorkspacePickerOpen(false);
      }
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-48 shrink-0 border-r"
        style={{ backgroundColor: "#111111", borderColor: "#1f1f1f" }}
      >
        {/* Logo / Workspace switcher */}
        <div className="relative flex flex-col items-center px-3 py-4 border-b gap-1.5" style={{ borderColor: "#1f1f1f" }}>
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
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full border border-white/20 bg-zinc-900/80 shadow-sm flex items-center justify-center pointer-events-none"
                      >
                        <ChevronsUpDown size={10} className="text-white" />
                      </span>
                    )}
                  </div>
                  {!impersonatingTenantSlug && (
                    <span className="text-xs truncate w-full text-center" style={{ color: "#666" }}>
                      {isClientUser ? (activeWorkspaceName ?? displayLabel) : displayLabel}
                    </span>
                  )}
                </button>
              </PopoverTrigger>

              <PopoverContent align="start" side="right" className="w-72 p-2 border-zinc-800 bg-zinc-950 text-zinc-100">
                <div className="px-2 py-1.5 text-xs uppercase tracking-wide text-zinc-500">Switch workspace</div>
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
                          active ? "bg-teal-500/15 text-teal-300" : "hover:bg-zinc-900 text-zinc-200",
                        )}
                      >
                        <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-semibold text-zinc-300">
                          {workspaceInitials(w.companyName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{w.companyName}</div>
                          <div className="truncate text-xs text-zinc-500">{w.slug}</div>
                        </div>
                        {active ? <Check size={14} className="text-teal-300" /> : null}
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
                <span className="text-xs truncate w-full text-center" style={{ color: "#666" }}>
                  {isClientUser ? (activeWorkspaceName ?? displayLabel) : displayLabel}
                </span>
              )}
            </div>
          )}

          {/* switch badge is rendered inside logo block below */}
        </div>

        {/* Impersonation banner */}
        {impersonatingTenantSlug && (
          <div className="mx-3 mt-2 px-2 py-1.5 rounded" style={{ backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <p className="text-xs font-medium leading-tight" style={{ color: "#f59e0b" }}>Viewing as client</p>
            <button
              onClick={async () => {
                try {
                  await fetch("/api/auth/view-as-client/stop", {
                    method: "POST",
                    credentials: "include",
                  });
                } catch {
                  // no-op: local state reset still proceeds
                }
                setImpersonatingTenantSlug(null);
                setEffectiveTier("cfo");
                if (user?.role === "admin") {
                  navigate("/admin/clients");
                }
              }}
              className="text-xs underline mt-0.5 hover:opacity-80 transition-opacity"
              style={{ color: "rgba(245,158,11,0.7)" }}
            >
              Exit view
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isCoaching = item.id === "coaching";
            const coachingChildren = [
              { id: "deep_dive", label: "Deep Dive", href: "/portal/coaching/deep-dive" },
              { id: "client_meeting", label: "Client Meeting", href: "/portal/coaching/client-meeting" },
              { id: "check_in_calls", label: "Check-in Calls", href: "/portal/coaching/check-in-calls" },
            ];
            const isActive = isCoaching
              ? location.startsWith("/portal/coaching")
              : (location === item.href || (item.href.length > 6 && location.startsWith(item.href)));

            if (isCoaching) {
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => setCoachingExpanded((v) => !v)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150",
                      isActive ? "font-medium" : "hover:opacity-80"
                    )}
                    style={isActive
                      ? { color: "#00d4aa", backgroundColor: "rgba(0,212,170,0.08)" }
                      : { color: "#888" }
                    }
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto text-[10px]" style={{ color: isActive ? "#00d4aa" : "#666" }}>
                      {coachingExpanded ? "▾" : "▸"}
                    </span>
                  </button>
                  {coachingExpanded && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {coachingChildren.map((child) => {
                        const childActive = location === child.href;
                        return (
                          <Link key={child.id} href={child.href}>
                            <div
                              className={cn(
                                "px-3 py-1.5 rounded-md text-xs transition-all duration-150",
                                childActive ? "font-medium" : "hover:opacity-80"
                              )}
                              style={childActive
                                ? { color: "#00d4aa", backgroundColor: "rgba(0,212,170,0.08)" }
                                : { color: "#777" }
                              }
                            >
                              {child.label}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link key={item.id} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150",
                    isActive
                      ? "font-medium"
                      : "hover:opacity-80"
                  )}
                  style={isActive
                    ? { color: "#00d4aa", backgroundColor: "rgba(0,212,170,0.08)" }
                    : { color: "#888" }
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{impersonatingTenantSlug && item.id === "chat" ? "Workspace Chat" : item.label}</span>
                  {isActive && <span className="ml-auto shrink-0 w-1 h-1 rounded-full" style={{ backgroundColor: "#00d4aa" }} />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t p-3" style={{ borderColor: "#1f1f1f" }}>
          <div className="flex items-center gap-2 mb-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
              style={{ backgroundColor: "rgba(0,212,170,0.15)", color: "#00d4aa" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate leading-tight" style={{ color: "#e5e5e5" }}>{user?.name ?? "—"}</p>
              <p className="text-xs truncate leading-tight" style={{ color: "#555" }}>{user?.email ?? ""}</p>
            </div>
          </div>
          {/* Change Password — only for client users (not admins, not impersonating) */}
          {!isAdmin && !impersonatingTenantSlug && user?.role !== "admin" && (
            <button
              onClick={() => setChangePasswordOpen(true)}
              className="flex items-center gap-1.5 text-xs transition-colors w-full hover:opacity-80 mb-1.5"
              style={{ color: "#555" }}
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
              setEffectiveTier("cfo");
              await logout();
            }}
            className="flex items-center gap-1.5 text-xs transition-colors w-full hover:opacity-80"
            style={{ color: "#555" }}
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        <FloatingTimerWidget />
      </main>
    </div>
  );
}
