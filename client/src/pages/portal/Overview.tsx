import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, BarChart3, DollarSign, Percent, TrendingUp } from "lucide-react";
import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { usePortal } from "../../contexts/PortalContext";

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  loading?: boolean;
}) {
  return (
    <Card className="bg-card border-border metric-card">
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 bg-muted" />
            <Skeleton className="h-8 w-32 bg-muted" />
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{title}</p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  {trend === "up" && <ArrowUpRight size={12} className="text-emerald-400" />}
                  {trend === "down" && <ArrowDownRight size={12} className="text-red-400" />}
                  {subtitle}
                </p>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              {icon}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const { impersonatingTenantId } = usePortal();
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const { data: tenant } = trpc.tenant.me.useQuery();
  const { data: financialData, isLoading } = trpc.financials.get.useQuery(
    { year, month, tenantId: impersonatingTenantId ?? undefined },
    { enabled: true }
  );

  const current = financialData?.[0];

  const fmt = (val: string | null | undefined) =>
    val ? `$${parseFloat(val).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

  return (
    <div className="p-6 space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here's your financial overview for {new Date(year, month - 1).toLocaleString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Revenue"
          value={fmt(current?.revenue)}
          subtitle={current?.budgetRevenue ? `Budget: ${fmt(current.budgetRevenue)}` : undefined}
          icon={<DollarSign size={18} />}
          trend="up"
          loading={isLoading}
        />
        <MetricCard
          title="Expenses"
          value={fmt(current?.expenses)}
          subtitle={current?.budgetExpenses ? `Budget: ${fmt(current.budgetExpenses)}` : undefined}
          icon={<BarChart3 size={18} />}
          trend="neutral"
          loading={isLoading}
        />
        <MetricCard
          title="Net Profit"
          value={fmt(current?.netProfit)}
          icon={<TrendingUp size={18} />}
          trend={current?.netProfit && parseFloat(current.netProfit) > 0 ? "up" : "down"}
          loading={isLoading}
        />
        <MetricCard
          title="Margin"
          value={current?.margin ? `${parseFloat(current.margin).toFixed(1)}%` : "—"}
          icon={<Percent size={18} />}
          trend={current?.margin && parseFloat(current.margin) > 20 ? "up" : "neutral"}
          loading={isLoading}
        />
      </div>

      {/* Quick nav cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {[
            { label: "Financials", href: "/portal/financials", desc: "Revenue, expenses & margins" },
            { label: "Reports", href: "/portal/reports", desc: "Historical data viewer" },
            { label: "Document Vault", href: "/portal/documents", desc: "Secure file storage" },
            { label: "AI Summaries", href: "/portal/ai-summaries", desc: "Monthly insights" },
            { label: "Coaching", href: "/portal/coaching", desc: "Goals & accountability" },
            { label: "KPI Dashboard", href: "/portal/kpi", desc: "CAC, Churn, LTV" },
            { label: "Time Intelligence", href: "/portal/time", desc: "Hours & delegation" },
            { label: "Sales Tracker", href: "/portal/sales", desc: "Pipeline & targets" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block p-4 rounded-lg bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group"
            >
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </a>
          ))}
        </div>
      </div>

      {/* Tenant info */}
      {tenant && (
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{tenant.companyName ?? "Your Company"}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                {tenant.packageTier?.replace("_", " ")} Plan · Active since {new Date(tenant.signedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </p>
            </div>
            <div className="text-xs text-primary font-medium bg-primary/10 px-3 py-1 rounded-full capitalize">
              {tenant.packageTier?.replace("_", " ")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
