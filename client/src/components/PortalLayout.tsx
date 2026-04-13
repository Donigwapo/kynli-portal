import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Clock,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { hasAccess, PackageTier, TAB_ACCESS } from "../../../shared/tiers";
import { usePortal } from "../contexts/PortalContext";
import { trpc } from "../lib/trpc";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
}

const CLIENT_NAV: NavItem[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={16} />, href: "/portal" },
  { id: "clients", label: "Clients", icon: <Users size={16} />, href: "/portal/clients" },
  { id: "financials", label: "Financials", icon: <BarChart3 size={16} />, href: "/portal/financials" },
  { id: "reports", label: "Reports", icon: <TrendingUp size={16} />, href: "/portal/reports" },
  { id: "documents", label: "Portal", icon: <FolderOpen size={16} />, href: "/portal/documents" },
  { id: "coaching", label: "Coaching", icon: <BookOpen size={16} />, href: "/portal/coaching" },
  { id: "kpi_dashboard", label: "KPI Dashboard", icon: <Target size={16} />, href: "/portal/kpi" },
  { id: "time_intelligence", label: "Time Intelligence", icon: <Clock size={16} />, href: "/portal/time" },
  { id: "sales_tracker", label: "Sales Tracker", icon: <FileText size={16} />, href: "/portal/sales" },
];

const ADMIN_NAV: NavItem[] = [
  { id: "admin_clients", label: "Clients", icon: <Users size={16} />, href: "/admin" },
  { id: "admin_overview", label: "Overview", icon: <LayoutDashboard size={16} />, href: "/admin/overview" },
  { id: "admin_sales", label: "Sales Tracker", icon: <FileText size={16} />, href: "/admin/sales" },
  { id: "admin_financials", label: "Financials", icon: <BarChart3 size={16} />, href: "/admin/financials" },
  { id: "admin_time", label: "Time Intelligence", icon: <Clock size={16} />, href: "/admin/time" },
  { id: "admin_coaching", label: "Coaching", icon: <BookOpen size={16} />, href: "/admin/coaching" },
  { id: "admin_portal", label: "Portal", icon: <FolderOpen size={16} />, href: "/admin/data-entry" },
  { id: "admin_reports", label: "Reports", icon: <TrendingUp size={16} />, href: "/admin/reports" },
];

interface PortalLayoutProps {
  children: ReactNode;
  isAdmin?: boolean;
}

export default function PortalLayout({ children, isAdmin = false }: PortalLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { effectiveTier, impersonatingTenantSlug, setImpersonatingTenantSlug, setEffectiveTier } = usePortal();
  const { data: tenant } = trpc.tenant.me.useQuery(undefined, { enabled: !isAdmin && !impersonatingTenantSlug });

  const activeTier: PackageTier = (tenant?.package_tier as PackageTier) ?? effectiveTier;

  const visibleNav = CLIENT_NAV.filter((item) =>
    hasAccess(activeTier, TAB_ACCESS[item.id] as PackageTier)
  );

  const navItems = isAdmin ? ADMIN_NAV : visibleNav;

  // User initials for avatar
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar — matches mockup exactly */}
      <aside className="flex flex-col w-44 shrink-0 border-r border-sidebar-border" style={{ backgroundColor: "oklch(0.09 0.005 240)" }}>

        {/* Logo */}
        <div className="flex flex-col items-center px-3 py-3 border-b border-sidebar-border gap-1">
          <div className="bg-white rounded-lg px-2 py-1">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663280358154/DHoPFRmeekJSRWmQf4bAQb/kynli-logo_c9409708.png"
              alt="KynLi Consulting"
              className="h-7 w-auto object-contain"
            />
          </div>
          {!isAdmin && !impersonatingTenantSlug && tenant?.company_name && (
            <span className="text-xs text-muted-foreground truncate w-full text-center">{tenant.company_name}</span>
          )}
          {isAdmin && (
            <span className="text-xs text-muted-foreground truncate">Admin</span>
          )}
        </div>

        {/* Impersonation banner */}
        {impersonatingTenantSlug && (
          <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400 font-medium leading-tight">Viewing as client</p>
            <button
              onClick={() => {
                setImpersonatingTenantSlug(null);
                setEffectiveTier("cfo");
              }}
              className="text-xs text-amber-300/70 underline mt-0.5 hover:text-amber-300"
            >
              Exit view
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href.length > 6 && location.startsWith(item.href));
            return (
              <Link key={item.id} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-2 rounded text-sm transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section — bottom */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-semibold">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">{user?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate leading-tight">{user?.email ?? ""}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-sidebar-foreground transition-colors w-full"
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
