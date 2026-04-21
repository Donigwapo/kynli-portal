import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  MessageSquare,
  Package,
  Users,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { PACKAGE_COLORS, PACKAGE_LABELS, PackageTier } from "../../../../shared/tiers";
import { trpc } from "../../lib/trpc";

const TIER_ORDER: PackageTier[] = ["legacy", "momentum", "growth_1", "growth_2", "cfo"];

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { data: tenants = [], isLoading } = trpc.tenant.list.useQuery();

  const active = tenants.filter((t) => t.is_active);
  const inactive = tenants.filter((t) => !t.is_active);

  const tierCounts = TIER_ORDER.reduce<Record<string, number>>((acc, tier) => {
    acc[tier] = tenants.filter((t) => t.package_tier === tier).length;
    return acc;
  }, {});

  const recentClients = [...tenants]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of all KynLi clients and portal activity</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Clients</p>
              <Users size={14} className="text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold text-foreground">{isLoading ? "—" : tenants.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Active</p>
              <CheckCircle2 size={14} className="text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-emerald-400">{isLoading ? "—" : active.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Inactive</p>
              <XCircle size={14} className="text-red-400" />
            </div>
            <p className="text-3xl font-bold text-red-400">{isLoading ? "—" : inactive.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">CFO Clients</p>
              <Package size={14} className="text-violet-400" />
            </div>
            <p className="text-3xl font-bold text-violet-400">{isLoading ? "—" : tierCounts["cfo"] ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Package Tier Breakdown */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Package size={14} className="text-primary" />
              Clients by Package Tier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {TIER_ORDER.map((tier) => {
              const count = tierCounts[tier] ?? 0;
              const pct = tenants.length > 0 ? (count / tenants.length) * 100 : 0;
              return (
                <div key={tier} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="outline" className={`text-xs ${PACKAGE_COLORS[tier]}`}>
                      {PACKAGE_LABELS[tier]}
                    </Badge>
                    <span className="text-muted-foreground">{count} client{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {tenants.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground">No clients yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Manage Clients", desc: "View, edit, and add clients", icon: Users, path: "/admin/clients" },
              { label: "Admin Chat", desc: "Join any client's chat room", icon: MessageSquare, path: "/admin/chat" },
              { label: "Data Entry", desc: "Enter financials, KPIs, coaching data", icon: Building2, path: "/admin/data-entry" },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                    <action.icon size={14} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.desc}</p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Clients */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Users size={14} className="text-primary" />
              Recent Clients
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary gap-1" onClick={() => navigate("/admin/clients")}>
              View all <ArrowRight size={11} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-muted/30 rounded-md animate-pulse" />
              ))}
            </div>
          ) : recentClients.length === 0 ? (
            <p className="text-xs text-muted-foreground">No clients yet. Add your first client from the Clients page.</p>
          ) : (
            <div className="space-y-1">
              {recentClients.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => navigate(`/admin/clients/${t.slug}`)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/30 transition-colors group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {t.company_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.company_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${PACKAGE_COLORS[t.package_tier as PackageTier]}`}>
                      {PACKAGE_LABELS[t.package_tier as PackageTier]}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${t.is_active ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <ArrowRight size={12} className="text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
