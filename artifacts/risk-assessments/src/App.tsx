import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Layout from "@/components/layout";
import Dashboard from "@/pages/dashboard";

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
import EvidencePage from "@/pages/evidence/list";
import MapsPage from "@/pages/maps/index";
import ReportsPage from "@/pages/reports/index";
import UsersPage from "@/pages/admin/users";

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
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />

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

        {/* Repository */}
        <Route path="/evidence" component={EvidencePage} />
        <Route path="/reports" component={ReportsPage} />

        {/* Admin */}
        <Route path="/admin/users" component={UsersPage} />

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
