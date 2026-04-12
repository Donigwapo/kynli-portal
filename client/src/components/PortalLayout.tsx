import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Brain,
  Clock,
  DollarSign,
  FileBarChart,
  FolderOpen,
  LogOut,
  TrendingUp,
  Users,
} from "lucide-react";
import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "../lib/trpc";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
}

// Exact order from the mockup screenshot
const CLIENT_NAV: NavItem[] = [
  { id: "overview",          label: "Overview",          icon: <BarChart3 size={16} />,      href: "/portal" },
  { id: "clients",           label: "Clients",           icon: <Users size={16} />,          href: "/portal/clients" },
  { id: "sales_tracker",     label: "Sales Tracker",     icon: <TrendingUp size={16} />,     href: "/portal/sales" },
  { id: "financials",        label: "Financials",        icon: <DollarSign size={16} />,     href: "/portal/financials" },
  { id: "time_intelligence", label: "Time Intelligence", icon: <Clock size={16} />,          href: "/portal/time" },
  { id: "coaching",          label: "Coaching",          icon: <BookOpen size={16} />,       href: "/portal/coaching" },
  { id: "documents",         label: "Portal",            icon: <FolderOpen size={16} />,     href: "/portal/documents" },
  { id: "reports",           label: "Reports",           icon: <FileBarChart size={16} />,   href: "/portal/reports" },
  { id: "ai_summaries",      label: "AI Summaries",      icon: <Brain size={16} />,          href: "/portal/ai-summaries" },
  { id: "kpi_dashboard",     label: "KPI Dashboard",     icon: <BarChart3 size={16} />,      href: "/portal/kpi" },
];

interface PortalLayoutProps {
  children: ReactNode;
}

export default function PortalLayout({ children }: PortalLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { data: tenant } = trpc.tenant.me.useQuery(undefined);

  // User initials for avatar
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex flex-col w-48 shrink-0 border-r border-sidebar-border"
        style={{ backgroundColor: "oklch(0.09 0.005 240)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-xs leading-none">kc</span>
          </div>
          {tenant?.companyName && (
            <span className="text-xs text-muted-foreground truncate leading-tight">{tenant.companyName}</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {CLIENT_NAV.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/portal" && location.startsWith(item.href));
            return (
              <Link key={item.id} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer",
                    isActive
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/5"
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {isActive && (
                    <span className="text-primary/60 text-xs">›</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section — bottom */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-7 h-7 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
              <span className="text-foreground text-xs font-semibold">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                {user?.name ?? "—"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate leading-tight">
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
