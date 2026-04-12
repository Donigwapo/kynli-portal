import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Brain,
  Clock,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Target,
  TrendingUp,
} from "lucide-react";
import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { hasAccess, PackageTier, TAB_ACCESS } from "../../../shared/tiers";
import { trpc } from "../lib/trpc";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
}

const CLIENT_NAV: NavItem[] = [
  { id: "overview",          label: "Overview",          icon: <LayoutDashboard size={16} />, href: "/portal" },
  { id: "financials",        label: "Financials",        icon: <BarChart3 size={16} />,       href: "/portal/financials" },
  { id: "reports",           label: "Reports",           icon: <TrendingUp size={16} />,      href: "/portal/reports" },
  { id: "documents",         label: "Portal",            icon: <FolderOpen size={16} />,      href: "/portal/documents" },
  { id: "ai_summaries",      label: "AI Summaries",      icon: <Brain size={16} />,           href: "/portal/ai-summaries" },
  { id: "coaching",          label: "Coaching",          icon: <BookOpen size={16} />,        href: "/portal/coaching" },
  { id: "kpi_dashboard",     label: "KPI Dashboard",     icon: <Target size={16} />,          href: "/portal/kpi" },
  { id: "time_intelligence", label: "Time Intelligence", icon: <Clock size={16} />,           href: "/portal/time" },
  { id: "sales_tracker",     label: "Sales Tracker",     icon: <FileText size={16} />,        href: "/portal/sales" },
];

interface PortalLayoutProps {
  children: ReactNode;
}

export default function PortalLayout({ children }: PortalLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  // Always resolve the real tenant for the logged-in user
  const { data: tenant } = trpc.tenant.me.useQuery(undefined);

  const activeTier: PackageTier = (tenant?.packageTier as PackageTier) ?? "legacy";

  // Only show tabs the client's tier has access to
  const visibleNav = CLIENT_NAV.filter((item) =>
    hasAccess(activeTier, TAB_ACCESS[item.id] as PackageTier)
  );

  // User initials for avatar
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex flex-col w-44 shrink-0 border-r border-sidebar-border"
        style={{ backgroundColor: "oklch(0.09 0.005 240)" }}
      >
        {/* Logo / Company name */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-xs leading-none">kc</span>
          </div>
          {tenant?.companyName && (
            <span className="text-xs text-muted-foreground truncate">{tenant.companyName}</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {visibleNav.map((item) => {
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
              <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                {user?.name ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground truncate leading-tight">
                {user?.email ?? ""}
              </p>
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
