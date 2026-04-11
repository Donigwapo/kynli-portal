import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Loader2 } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";

interface RouteGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

/**
 * RouteGuard — wraps protected routes.
 * - Unauthenticated users are redirected to the login page.
 * - Non-admin users attempting to access admin routes are redirected to /portal.
 */
export default function RouteGuard({ children, requireAdmin = false }: RouteGuardProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    if (requireAdmin && user?.role !== "admin") {
      navigate("/portal");
    }
  }, [loading, isAuthenticated, user, requireAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (requireAdmin && user?.role !== "admin") return null;

  return <>{children}</>;
}
