import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Brain,
  ChevronLeft,
  Clock,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { hasAccess, PackageTier, TAB_ACCESS } from "../../../shared/tiers";
import { usePortal } from "../contexts/PortalContext";
import { trpc } from "../lib/trpc";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  adminOnly?: boolean;
}

const CLIENT_NAV: NavItem[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={18} />, href: "/portal" },
  { id: "financials", label: "Financials", icon: <BarChart3 size={18} />, href: "/portal/financials" },
  { id: "reports", label: "Reports", icon: <TrendingUp size={18} />, href: "/portal/reports" },
  { id: "documents", label: "Document Vault", icon: <FolderOpen size={18} />, href: "/portal/documents" },
  { id: "ai_summaries", label: "AI Summaries", icon: <Brain size={18} />, href: "/portal/ai-summaries" },
  { id: "coaching", label: "Coaching", icon: <BookOpen size={18} />, href: "/portal/coaching" },
  { id: "kpi_dashboard", label: "KPI Dashboard", icon: <Target size={18} />, href: "/portal/kpi" },
  { id: "time_intelligence", label: "Time Intelligence", icon: <Clock size={18} />, href: "/portal/time" },
  { id: "sales_tracker", label: "Sales Tracker", icon: <FileText size={18} />, href: "/portal/sales" },
];

const ADMIN_NAV: NavItem[] = [
  { id: "admin_clients", label: "Client Management", icon: <Users size={18} />, href: "/admin", adminOnly: true },
  { id: "admin_data_entry", label: "Data Entry", icon: <BarChart3 size={18} />, href: "/admin/data-entry", adminOnly: true },
];

interface PortalLayoutProps {
  children: ReactNode;
  isAdmin?: boolean;
}

export default function PortalLayout({ children, isAdmin = false }: PortalLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { effectiveTier, impersonatingTenantId, setImpersonatingTenantId } = usePortal();
  const { data: tenant } = trpc.tenant.me.useQuery(undefined, { enabled: !isAdmin });

  const activeTier: PackageTier = (tenant?.packageTier as PackageTier) ?? effectiveTier;

  const visibleNav = CLIENT_NAV.filter((item) =>
    hasAccess(activeTier, TAB_ACCESS[item.id] as PackageTier)
  );

  const navItems = isAdmin ? [...ADMIN_NAV] : visibleNav;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 shrink-0",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center gap-3 px-4 py-5 border-b border-sidebar-border", collapsed && "justify-center px-0")}>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-primary tracking-wide">KynLi</span>
              <span className="text-xs text-muted-foreground truncate">Command Center</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">K</span>
            </div>
          )}
        </div>

        {/* Impersonation banner */}
        {impersonatingTenantId && !collapsed && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-xs text-amber-400 font-medium">Viewing as client</p>
            <button
              onClick={() => setImpersonatingTenantId(null)}
              className="text-xs text-amber-300 underline mt-0.5"
            >
              Exit view
            </button>
          </div>
        )}

        {/* Package tier badge */}
        {!isAdmin && !collapsed && (
          <div className="px-4 pt-3">
            <Badge
              variant="outline"
              className="text-xs border-primary/30 text-primary bg-primary/10 capitalize"
            >
              {activeTier.replace("_", " ")} Plan
            </Badge>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/portal" && item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Tooltip key={item.id} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 group",
                        collapsed && "justify-center px-0 py-3",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}
                    >
                      <span className={cn("shrink-0", isActive && "text-primary")}>{item.icon}</span>
                      {!collapsed && (
                        <span className="text-sm font-medium truncate">{item.label}</span>
                      )}
                      {isActive && !collapsed && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="text-xs">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* User section */}
        <div className={cn("p-3 space-y-1", collapsed && "flex flex-col items-center")}>
          {!collapsed && (
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
            </div>
          )}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className={cn(
                  "w-full text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                  collapsed ? "px-0 justify-center" : "justify-start gap-2"
                )}
              >
                <LogOut size={16} />
                {!collapsed && <span className="text-xs">Sign Out</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Sign Out</TooltipContent>}
          </Tooltip>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-5 -right-3 w-6 h-6 rounded-full bg-sidebar-border border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors z-10"
          style={{ position: "relative", alignSelf: "flex-end", marginRight: "0.75rem", marginBottom: "0.5rem" }}
        >
          <ChevronLeft size={12} className={cn("transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-card/50">
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 bg-amber-500/10">
                Admin Portal
              </Badge>
            )}
            {impersonatingTenantId && (
              <Badge variant="outline" className="text-xs border-amber-400/40 text-amber-300 bg-amber-400/10">
                Viewing as Client #{impersonatingTenantId}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
