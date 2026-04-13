import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Clock,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  TrendingUp,
  Users,
  ShoppingCart,
} from "lucide-react";
import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { usePortal } from "../contexts/PortalContext";
import { trpc } from "../lib/trpc";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
}

// Nav order matches reference dashboard exactly
const CLIENT_NAV: NavItem[] = [
  { id: "overview",          label: "Overview",         icon: <LayoutDashboard size={16} />, href: "/portal" },
  { id: "clients",           label: "Clients",          icon: <Users size={16} />,           href: "/portal/clients" },
  { id: "sales_tracker",     label: "Sales Tracker",    icon: <ShoppingCart size={16} />,    href: "/portal/sales" },
  { id: "financials",        label: "Financials",       icon: <BarChart3 size={16} />,       href: "/portal/financials" },
  { id: "time_intelligence", label: "Time Intelligence",icon: <Clock size={16} />,           href: "/portal/time" },
  { id: "coaching",          label: "Coaching",         icon: <BookOpen size={16} />,        href: "/portal/coaching" },
  { id: "documents",         label: "Portal",           icon: <FolderOpen size={16} />,      href: "/portal/documents" },
  { id: "reports",           label: "Reports",          icon: <TrendingUp size={16} />,      href: "/portal/reports" },
];

const ADMIN_NAV: NavItem[] = [
  { id: "admin_clients",     label: "Clients",          icon: <Users size={16} />,           href: "/admin" },
  { id: "admin_overview",    label: "Overview",         icon: <LayoutDashboard size={16} />, href: "/admin/overview" },
  { id: "admin_sales",       label: "Sales Tracker",    icon: <ShoppingCart size={16} />,    href: "/admin/sales" },
  { id: "admin_financials",  label: "Financials",       icon: <BarChart3 size={16} />,       href: "/admin/financials" },
  { id: "admin_time",        label: "Time Intelligence",icon: <Clock size={16} />,           href: "/admin/time" },
  { id: "admin_coaching",    label: "Coaching",         icon: <BookOpen size={16} />,        href: "/admin/coaching" },
  { id: "admin_portal",      label: "Portal",           icon: <FolderOpen size={16} />,      href: "/admin/data-entry" },
  { id: "admin_reports",     label: "Reports",          icon: <TrendingUp size={16} />,      href: "/admin/reports" },
];

interface PortalLayoutProps {
  children: ReactNode;
  isAdmin?: boolean;
}

export default function PortalLayout({ children, isAdmin = false }: PortalLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { impersonatingTenantSlug, setImpersonatingTenantSlug, setEffectiveTier } = usePortal();
  const { data: tenant } = trpc.tenant.me.useQuery(undefined, { enabled: !isAdmin && !impersonatingTenantSlug });

  const navItems = isAdmin ? ADMIN_NAV : CLIENT_NAV;

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-48 shrink-0 border-r"
        style={{ backgroundColor: "#111111", borderColor: "#1f1f1f" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center px-3 py-4 border-b gap-1.5" style={{ borderColor: "#1f1f1f" }}>
          <div className="bg-white rounded-lg px-2 py-1.5">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663280358154/DHoPFRmeekJSRWmQf4bAQb/kynli-logo_c9409708.png"
              alt="KynLi Consulting"
              className="h-7 w-auto object-contain"
            />
          </div>
          {!isAdmin && !impersonatingTenantSlug && tenant?.company_name && (
            <span className="text-xs truncate w-full text-center" style={{ color: "#666" }}>
              {tenant.company_name}
            </span>
          )}
          {isAdmin && (
            <span className="text-xs" style={{ color: "#666" }}>Admin</span>
          )}
        </div>

        {/* Impersonation banner */}
        {impersonatingTenantSlug && (
          <div className="mx-3 mt-2 px-2 py-1.5 rounded" style={{ backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <p className="text-xs font-medium leading-tight" style={{ color: "#f59e0b" }}>Viewing as client</p>
            <button
              onClick={() => { setImpersonatingTenantSlug(null); setEffectiveTier("cfo"); }}
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
            const isActive =
              location === item.href ||
              (item.href.length > 6 && location.startsWith(item.href));
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
                  <span className="truncate">{item.label}</span>
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
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs transition-colors w-full hover:opacity-80"
            style={{ color: "#555" }}
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
