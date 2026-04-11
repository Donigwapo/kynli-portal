import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { BarChart3, BookOpen, Brain, FileText, FolderOpen, Loader2, Shield, Target, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      if (user?.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/portal");
      }
    }
  }, [loading, isAuthenticated, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const features = [
    { icon: <BarChart3 size={20} />, label: "Financials", desc: "Revenue, expenses, margins & budget tracking" },
    { icon: <TrendingUp size={20} />, label: "Reports", desc: "Historical data and annual summaries" },
    { icon: <FolderOpen size={20} />, label: "Document Vault", desc: "Secure file storage — replaces SmartVault" },
    { icon: <Brain size={20} />, label: "AI Summaries", desc: "Monthly AI-generated financial insights" },
    { icon: <BookOpen size={20} />, label: "Coaching", desc: "Quarterly goals and accountability tracking" },
    { icon: <Target size={20} />, label: "KPI Dashboard", desc: "CAC, Churn Rate, and Lifetime Value" },
    { icon: <FileText size={20} />, label: "Sales Tracker", desc: "Pipeline, targets, and referral breakdown" },
    { icon: <Shield size={20} />, label: "Secure Access", desc: "Tenant-isolated data with role-based access" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">K</span>
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">KynLi</span>
            <span className="text-xs text-muted-foreground ml-2">Command Center</span>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => window.location.href = getLoginUrl()}
        >
          Sign In
        </Button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Shield size={12} />
            Secure Client Portal
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
            Your Financial Command{" "}
            <span className="gradient-text">Center</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Access your financials, reports, documents, and coaching — all in one secure, personalized portal built for KynLi clients.
          </p>
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 h-12 text-base font-semibold"
            onClick={() => window.location.href = getLoginUrl()}
          >
            Access Your Portal
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Your account must be enrolled by your KynLi advisor to access the portal.
          </p>
        </div>
      </main>

      {/* Features grid */}
      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs text-muted-foreground uppercase tracking-wider text-center mb-6">What's inside your portal</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {features.map((f) => (
              <div key={f.label} className="p-4 rounded-lg bg-card border border-border text-left">
                <div className="text-primary mb-2">{f.icon}</div>
                <p className="text-sm font-semibold text-foreground">{f.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} KynLi Consulting LLC. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
