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
import AuthCallback from "./pages/AuthCallback";

// Portal pages
import Overview from "./pages/portal/Overview";
import Profile from "./pages/portal/Profile";
import Financials from "./pages/portal/Financials";
import Reports from "./pages/portal/Reports";
import Documents from "./pages/portal/Documents";
import Coaching from "./pages/portal/Coaching";
import CoachingClientMeeting from "./pages/portal/CoachingClientMeeting";
import CoachingCheckInCalls from "./pages/portal/CoachingCheckInCalls";
import CoachingClientMeetingDetail from "./pages/portal/CoachingClientMeetingDetail";
import KpiDashboard from "./pages/portal/KpiDashboard";
import TimeIntelligence from "./pages/portal/TimeIntelligence";
import SalesTracker from "./pages/portal/SalesTracker";
import Clients from "./pages/portal/Clients";
import Chat from "./pages/portal/Chat";
import SetPassword from "./pages/portal/SetPassword";
import ActivityLogPage from "./pages/portal/ActivityLog";
import TierGate from "./components/TierGate";

// Admin pages
import AdminClients from "./pages/admin/AdminClients";
import AdminDataEntry from "./pages/admin/AdminDataEntry";
import AdminClientDetail from "./pages/admin/AdminClientDetail";
import AdminChat from "./pages/admin/AdminChat";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTeam from "./pages/admin/AdminTeam";
import AdminProfile from "./pages/admin/AdminProfile";

function PortalRoute({ component: Component, featureKey }: { component: React.ComponentType; featureKey?: string }) {
  return (
    <RouteGuard>
      <PortalLayout>
        {featureKey ? (
          <TierGate featureKey={featureKey}>
            <Component />
          </TierGate>
        ) : (
          <Component />
        )}
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
      <Route path="/auth/callback" component={AuthCallback} />

      {/* Client Portal — protected, tier-gated */}
      {/* Set password page — shown after magic-link invite, no layout wrapper needed */}
      <Route path="/portal/set-password" component={() => <RouteGuard><SetPassword /></RouteGuard>} />
      <Route path="/portal"              component={() => <PortalRoute component={Overview}         featureKey="overview" />} />
      <Route path="/portal/profile"      component={() => <PortalRoute component={Profile}          featureKey="overview" />} />
      <Route path="/portal/clients"      component={() => <PortalRoute component={Clients}          featureKey="clients" />} />
      <Route path="/portal/financials"   component={() => <PortalRoute component={Financials}       featureKey="financials" />} />
      <Route path="/portal/reports"      component={() => <PortalRoute component={Reports}          featureKey="reports" />} />
      <Route path="/portal/documents"    component={() => <PortalRoute component={Documents}        featureKey="documents" />} />
      <Route path="/portal/coaching"     component={() => <PortalRoute component={Coaching}         featureKey="coaching" />} />
      <Route path="/portal/coaching/deep-dive" component={() => <PortalRoute component={Coaching} featureKey="coaching" />} />
      <Route path="/portal/coaching/client-meeting" component={() => <PortalRoute component={CoachingClientMeeting} featureKey="coaching" />} />
      <Route path="/portal/coaching/client-meeting/:meetingId" component={() => <PortalRoute component={CoachingClientMeetingDetail} featureKey="coaching" />} />
      <Route path="/portal/coaching/check-in-calls" component={() => <PortalRoute component={CoachingCheckInCalls} featureKey="coaching" />} />
      <Route path="/portal/kpi"          component={() => <PortalRoute component={KpiDashboard}     featureKey="kpi_dashboard" />} />
      <Route path="/portal/time"         component={() => <PortalRoute component={TimeIntelligence} featureKey="time_intelligence" />} />
      <Route path="/portal/sales"        component={() => <PortalRoute component={SalesTracker}     featureKey="sales_tracker" />} />
      <Route path="/portal/chat"         component={() => <PortalRoute component={Chat}             featureKey="chat" />} />
      <Route path="/portal/activity-log" component={() => <PortalRoute component={ActivityLogPage}  featureKey="overview" />} />

      {/* Admin Portal — protected + admin-only */}
      <Route path="/admin" component={() => <AdminRoute component={AdminDashboard} />} />
      <Route path="/admin/clients" component={() => <AdminRoute component={AdminClients} />} />
      <Route path="/admin/clients/:slug" component={() => <AdminRoute component={AdminClientDetail} />} />
      <Route path="/admin/chat" component={() => <AdminRoute component={AdminChat} />} />
      <Route path="/admin/data-entry" component={() => <AdminRoute component={AdminDataEntry} />} />
      <Route path="/admin/team" component={() => <AdminRoute component={AdminTeam} />} />
      <Route path="/admin/profile" component={() => <AdminRoute component={AdminProfile} />} />
      <Route path="/admin/activity-log" component={() => <AdminRoute component={ActivityLogPage} />} />

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
