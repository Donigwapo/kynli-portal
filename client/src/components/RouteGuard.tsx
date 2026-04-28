import { useAuth } from "@/_core/hooks/useAuth";
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
 * - Client users with must_reset_password=true are redirected to /portal/set-password.
 */
export default function RouteGuard({ children, requireAdmin = false }: RouteGuardProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (requireAdmin && user?.role !== "admin") {
      navigate("/portal");
      return;
    }
    // First-login: client must set a password before accessing the portal
    if (
      user?.must_reset_password &&
      user.role !== "admin" &&
      location !== "/portal/set-password"
    ) {
      navigate("/portal/set-password");
    }
  }, [loading, isAuthenticated, user, requireAdmin, location]);

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
