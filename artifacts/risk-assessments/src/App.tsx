import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Layout from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ChangePasswordPage from "@/pages/change-password";
import { AuthProvider } from "@/lib/auth";
import RequireAuth from "@/components/require-auth";

import AssessmentsList from "@/pages/assessments/list";
import AssessmentNew from "@/pages/assessments/new";
import AssessmentDetail from "@/pages/assessments/detail";
import AssessmentEdit from "@/pages/assessments/edit";

import VenuesList from "@/pages/venues/list";
import VenueNew from "@/pages/venues/new";
import VenueDetail from "@/pages/venues/detail";

import IncidentsList from "@/pages/incidents/list";
import AlertsList from "@/pages/alerts/list";
import OsintList from "@/pages/osint/list";
import TasksList from "@/pages/tasks/list";
import EvidencePage from "@/pages/evidence/list";
import MapsPage from "@/pages/maps/index";
import ReportsPage from "@/pages/reports/index";
import UsersPage from "@/pages/admin/users";
import AdminDashboard from "@/pages/admin/dashboard";
import FieldIntelligence from "@/pages/admin/field-intelligence";
import DocumentsPage from "@/pages/admin/documents";
import AuditLogPage from "@/pages/admin/audit-log";
import TaskArchive from "@/pages/admin/task-archive";
import VendorsPage from "@/pages/admin/vendors";
import VendorDetailPage from "@/pages/admin/vendor-detail";
import PayrollPage from "@/pages/admin/payroll";
import CommunicationsPage from "@/pages/admin/communications";
import CpoDeployment from "@/pages/admin/cpo-deployment";
import InvoicesPage from "@/pages/admin/invoices";
import SchedulePage from "@/pages/admin/schedule";
import CalendarPage from "@/pages/admin/calendar";
import CostsPage from "@/pages/admin/costs";
import FinanceDashboard from "@/pages/admin/finance";
import OfficesPage from "@/pages/admin/offices";
import ClientsPage from "@/pages/admin/clients";
import ClientDetailPage from "@/pages/admin/client-detail";
import OnboardingPage from "@/pages/admin/onboarding";
import OwnerDashboard from "@/pages/owner/dashboard";
import SubscriptionsPage from "@/pages/owner/subscriptions";
import ItPage from "@/pages/owner/it";
import RoleSelect from "@/pages/role-select";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <RequireAuth>
      <Layout>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/change-password" component={ChangePasswordPage} />
        <Route path="/owner" component={OwnerDashboard} />
        <Route path="/owner/subscriptions" component={SubscriptionsPage} />
        <Route path="/owner/it" component={ItPage} />
        <Route path="/quick-access" component={RoleSelect} />
        <Route path="/cpo" component={Dashboard} />

        {/* Venues */}
        <Route path="/venues" component={VenuesList} />
        <Route path="/venues/new" component={VenueNew} />
        <Route path="/venues/:id" component={VenueDetail} />

        {/* Assessments */}
        <Route path="/assessments" component={AssessmentsList} />
        <Route path="/assessments/new" component={AssessmentNew} />
        <Route path="/assessments/:id/edit" component={AssessmentEdit} />
        <Route path="/assessments/:id" component={AssessmentDetail} />

        {/* Intelligence modules */}
        <Route path="/incidents" component={IncidentsList} />
        <Route path="/maps" component={MapsPage} />

        {/* Monitoring */}
        <Route path="/alerts" component={AlertsList} />
        <Route path="/osint" component={OsintList} />
        <Route path="/tasks" component={TasksList} />

        {/* Repository */}
        <Route path="/evidence" component={EvidencePage} />
        <Route path="/reports" component={ReportsPage} />

        {/* Admin */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/users" component={UsersPage} />
        <Route path="/admin/field-intelligence" component={FieldIntelligence} />
        <Route path="/admin/documents" component={DocumentsPage} />
        <Route path="/admin/audit-log" component={AuditLogPage} />
        <Route path="/admin/vendors" component={VendorsPage} />
        <Route path="/admin/vendors/:id" component={VendorDetailPage} />
        <Route path="/admin/payroll" component={PayrollPage} />
        <Route path="/admin/task-archive" component={TaskArchive} />
        <Route path="/admin/invoices" component={InvoicesPage} />
        <Route path="/admin/cpo-deployment" component={CpoDeployment} />
        <Route path="/admin/schedule" component={SchedulePage} />
        <Route path="/admin/calendar" component={CalendarPage} />
        <Route path="/admin/costs" component={CostsPage} />
        <Route path="/admin/finance" component={FinanceDashboard} />
        <Route path="/admin/offices" component={OfficesPage} />
        <Route path="/admin/communications" component={CommunicationsPage} />
        <Route path="/admin/clients" component={ClientsPage} />
        <Route path="/admin/clients/:id" component={ClientDetailPage} />
        <Route path="/admin/onboarding" component={OnboardingPage} />

        <Route component={NotFound} />
      </Switch>
      </Layout>
    </RequireAuth>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
