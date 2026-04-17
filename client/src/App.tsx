import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PortalLayout from "./components/PortalLayout";
import RouteGuard from "./components/RouteGuard";
import { PortalProvider } from "./contexts/PortalContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";

// Portal pages
import Overview from "./pages/portal/Overview";
import Financials from "./pages/portal/Financials";
import Reports from "./pages/portal/Reports";
import Documents from "./pages/portal/Documents";
import Coaching from "./pages/portal/Coaching";
import KpiDashboard from "./pages/portal/KpiDashboard";
import TimeIntelligence from "./pages/portal/TimeIntelligence";
import SalesTracker from "./pages/portal/SalesTracker";
import Clients from "./pages/portal/Clients";
import Chat from "./pages/portal/Chat";

// Admin pages
import AdminClients from "./pages/admin/AdminClients";
import AdminDataEntry from "./pages/admin/AdminDataEntry";

function PortalRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <RouteGuard>
      <PortalLayout>
        <Component />
      </PortalLayout>
    </RouteGuard>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <RouteGuard requireAdmin>
      <PortalLayout isAdmin>
        <Component />
      </PortalLayout>
    </RouteGuard>
  );
}

function Router() {
  return (
    <Switch>
      {/* Landing / Login */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />

      {/* Client Portal — protected */}
      <Route path="/portal" component={() => <PortalRoute component={Overview} />} />
      <Route path="/portal/clients" component={() => <PortalRoute component={Clients} />} />
      <Route path="/portal/financials" component={() => <PortalRoute component={Financials} />} />
      <Route path="/portal/reports" component={() => <PortalRoute component={Reports} />} />
      <Route path="/portal/documents" component={() => <PortalRoute component={Documents} />} />
      <Route path="/portal/coaching" component={() => <PortalRoute component={Coaching} />} />
      <Route path="/portal/kpi" component={() => <PortalRoute component={KpiDashboard} />} />
      <Route path="/portal/time" component={() => <PortalRoute component={TimeIntelligence} />} />
      <Route path="/portal/sales" component={() => <PortalRoute component={SalesTracker} />} />
      <Route path="/portal/chat" component={() => <PortalRoute component={Chat} />} />

      {/* Admin Portal — protected + admin-only */}
      <Route path="/admin" component={() => <AdminRoute component={AdminClients} />} />
      <Route path="/admin/data-entry" component={() => <AdminRoute component={AdminDataEntry} />} />

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <PortalProvider>
            <Toaster />
            <Router />
          </PortalProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
