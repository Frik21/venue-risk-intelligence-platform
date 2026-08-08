const BASE = "/api";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type AssessmentStatus = "draft" | "under_review" | "approved" | "monitoring" | "review_required" | "escalated" | "archived";
export type RiskRating = "low" | "moderate" | "moderate_high" | "high" | "unknown";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type AlertPriority = "low" | "medium" | "high" | "critical";
export type AlertStatus = "pending" | "reviewed" | "dismissed" | "escalated";
export type OsintStatus = "pending" | "accepted" | "rejected";
export type UserRole = "admin" | "manager" | "cpo";
export type RouteType =
  | "primary_extraction" | "secondary_extraction" | "medical_evacuation"
  | "vip_arrival" | "vip_departure" | "staff_access" | "supplier_route" | "emergency_access";
export type RouteCreationMethod = "endpoint_marker" | "street_builder" | "freehand_draw";

export interface User {
  id: number; name: string; email: string; role: UserRole; avatarInitials: string | null; active: boolean; createdAt: string;
}

export interface Venue {
  id: number; name: string; venueType: string; address: string; city: string; country: string;
  lat: number | null; lng: number | null; googleMapsUrl: string | null; district: string | null;
  environmentType: string | null; notes: string | null; assessmentCount: number; createdAt: string; updatedAt: string;
}

export interface VenueDetail extends Venue {
  assessments: AssessmentSummary[];
  recentIncidents: Incident[];
}

// Drives the GDELT news-monitoring OSINT source for a venue - see
// artifacts/api-server/src/lib/gdelt.ts. A venue with no phrases simply
// isn't monitored.
export interface SearchPhrase {
  id: number;
  venueId: number;
  phrase: string;
  createdAt: string;
}

export type TaskStatus = "not_completed" | "in_progress" | "completed";

// Task Assignment - a Manager assigns a CPO a specific piece of
// structured work already in the platform, tied to a venue. The CPO
// moves it through TaskStatus; that status is what feeds back to the
// Manager. Not a general worklist or two-way chat.
export interface Task {
  id: number;
  venueId: number;
  venueName: string | null;
  assignedTo: number;
  assignedToName: string | null;
  assignedBy: number;
  assignedByName: string | null;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  completionNote: string | null;
  planSubmittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Operational Planning (Planner, Step 1: the pre-op readiness
// checklist) - one Plan per Task, going deeper than the task's own
// title. The checklist is a fixed, ordered list defined server-side
// (artifacts/api-server/src/lib/plan-checklist.ts), not user-managed.
export interface PlanChecklistEntry {
  key: string;
  label: string;
  checked: boolean;
}

export interface Plan {
  id: number;
  taskId: number;
  checklist: PlanChecklistEntry[];
  checkedCount: number;
  totalCount: number;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// The CPO's in-field venue risk assessment (Risk Assessments > Venues >
// a venue, after its task is selected) - one per (task, venue) pair.
// Distinct from AssessmentSummary/AssessmentDetail below, which is the
// separate, formal Manager/Analyst-facing Assessments feature. Every
// field is a single free-text comment box (per direct product
// direction), not a nested sub-list.
export interface VenueRiskAssessment {
  id: number;
  taskId: number;
  venueId: number;
  venueName: string | null;
  operatorId: number;
  operatorName: string | null;
  timezone: string | null;
  currentOperatingConditions: string;
  areaAdvisories: string;
  checkpoints: string;
  observedHazards: string;
  existingControls: string;
  recommendedActions: string;
  operatorNotes: string;
  attachments: string;
  status: "draft" | "submitted";
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentSummary {
  id: number; venueId: number | null; venueName: string | null; venueCity: string | null;
  title: string; description: string | null; status: AssessmentStatus; version: number;
  overallRating: string | null; createdAt: string; updatedAt: string;
}

export interface RiskMatrix {
  id: number; assessmentId: number; areaRisk: RiskRating; accessControl: RiskRating;
  arrivalDeparture: RiskRating; parking: RiskRating; personnel: RiskRating; medical: RiskRating;
  hse: RiskRating; extraction: RiskRating; overallRating: RiskRating; notes: string | null;
  createdAt: string; updatedAt: string;
}

export interface Risk {
  id: number; assessmentId: number; title: string; description: string | null; category: string;
  likelihood: number; impact: number; riskScore: number; riskLevel: string; mitigation: string | null;
  owner: string | null; status: string; createdAt: string; updatedAt: string;
}

export interface AssessmentDetail extends AssessmentSummary {
  intelSummary: string | null; analystNotes: string | null; overallRating: string | null;
  riskMatrix: RiskMatrix | null; risks: Risk[]; approvedAt: string | null;
}

export interface AssessmentVersion {
  id: number; assessmentId: number; version: number; changeSummary: string | null;
  createdByName: string | null; createdAt: string;
}

export interface AuditLogEntry {
  id: number; assessmentId: number | null; userId: number | null; userName: string | null;
  action: string; fieldChanged: string | null; oldValue: string | null; newValue: string | null;
  reason: string | null; createdAt: string;
}

export interface Incident {
  id: number; venueId: number | null; venueName: string | null; incidentType: string;
  severity: IncidentSeverity; incidentDate: string; summary: string; sourceName: string | null;
  sourceUrl: string | null; lat: number | null; lng: number | null;
  distanceFromVenue: number | null; confidenceLevel: string | null; verified: boolean; createdAt: string;
}

export interface Evidence {
  id: number; assessmentId: number; evidenceType: string; label: string; content: string | null;
  url: string | null; filename: string | null; section: string | null; analystNote: string | null;
  verified: boolean; uploadedByName: string | null; createdAt: string;
}

export interface Alert {
  id: number; venueId: number; venueName: string | null; incidentId: number | null;
  priority: AlertPriority; title: string; summary: string; status: AlertStatus;
  reviewedByName: string | null; reviewedAt: string | null; createdAt: string;
}

export interface OsintEvent {
  id: number; venueId: number; eventType: string; summary: string; sourceName: string | null;
  sourceUrl: string | null; lat: number | null; lng: number | null; status: OsintStatus;
  analystNote: string | null; createdAt: string;
}

export interface DashboardSummary {
  totalVenues: number; totalAssessments: number; totalIncidents: number; pendingAlerts: number;
  assessmentsByStatus: Record<string, number>;
  recentAssessments: AssessmentSummary[];
  recentAlerts: Alert[];
}

export interface Waypoint { lat: number; lng: number; label?: string; }

export interface RouteGeoJSON {
  type: "LineString" | "FeatureCollection";
  coordinates?: [number, number][];
  features?: unknown[];
}

export interface RouteFinding {
  id: number; routeId: number; assessmentId: number | null; venueId: number | null;
  findingType: string; severity: string; summary: string; sourceName: string | null;
  sourceUrl: string | null; distanceFromRoute: number | null; detectedAt: string;
  verified: boolean; analystNotes: string | null; createdAt: string;
}

export interface Route {
  id: number;
  assessmentId: number | null;
  venueId: number | null;
  routeName: string;
  routeType: RouteType;
  creationMethod: RouteCreationMethod;
  startLabel: string | null;
  startLat: number | null;
  startLng: number | null;
  endLabel: string | null;
  endLat: number | null;
  endLng: number | null;
  waypointsJson: Waypoint[] | null;
  routeGeometryGeojson: RouteGeoJSON | null;
  originalDrawnGeometryGeojson: RouteGeoJSON | null;
  snappedRouteGeometryGeojson: RouteGeoJSON | null;
  snappedToRoads: boolean;
  routeProvider: string | null;
  travelMode: string;
  routingApiResponseJson: unknown | null;
  estimatedDistance: number | null;
  estimatedTravelTime: number | null;
  constraints: string[] | null;
  analystNotes: string | null;
  verified: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  findings?: RouteFinding[];
}

export interface SnapResult {
  route: Route;
  snappedGeojson: RouteGeoJSON;
  distanceMetres: number;
  travelTimeMinutes: number;
  provider: string;
}

export const api = {
  dashboard: () => apiFetch<DashboardSummary>("/dashboard/summary"),
  users: {
    list: () => apiFetch<User[]>("/users"),
    create: (data: Partial<User>) => apiFetch<User>("/users", { method: "POST", body: JSON.stringify(data) }),
  },
  venues: {
    list: () => apiFetch<Venue[]>("/venues"),
    get: (id: number) => apiFetch<VenueDetail>(`/venues/${id}`),
    create: (data: Partial<Venue>) => apiFetch<Venue>("/venues", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Venue>) => apiFetch<Venue>(`/venues/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/venues/${id}`, { method: "DELETE" }),
    osint: (id: number) => apiFetch<OsintEvent[]>(`/venues/${id}/osint`),
  },
  searchPhrases: {
    list: (venueId: number) => apiFetch<SearchPhrase[]>(`/venues/${venueId}/search-phrases`),
    create: (venueId: number, phrase: string) =>
      apiFetch<SearchPhrase>(`/venues/${venueId}/search-phrases`, { method: "POST", body: JSON.stringify({ phrase }) }),
    delete: (id: number) => apiFetch<void>(`/search-phrases/${id}`, { method: "DELETE" }),
  },
  tasks: {
    list: (assignedTo?: number) => apiFetch<Task[]>(`/tasks${assignedTo != null ? `?assignedTo=${assignedTo}` : ""}`),
    create: (data: { venueId: number; assignedTo: number; assignedBy: number; title: string; dueDate?: string }) =>
      apiFetch<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
    updateStatus: (id: number, data: { status: TaskStatus; completionNote?: string }) =>
      apiFetch<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  plans: {
    forTask: (taskId: number) => apiFetch<Plan>(`/tasks/${taskId}/plan`),
    setChecklistItem: (planId: number, key: string, checked: boolean) =>
      apiFetch<Plan>(`/plans/${planId}/checklist`, { method: "PATCH", body: JSON.stringify({ key, checked }) }),
    submit: (planId: number) => apiFetch<Plan>(`/plans/${planId}/submit`, { method: "POST" }),
  },
  venueRiskAssessments: {
    forVenue: (taskId: number, venueId: number, timezone?: string) =>
      apiFetch<VenueRiskAssessment>(
        `/tasks/${taskId}/venues/${venueId}/risk-assessment${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`,
      ),
    update: (
      id: number,
      data: Partial<
        Pick<
          VenueRiskAssessment,
          | "currentOperatingConditions"
          | "areaAdvisories"
          | "checkpoints"
          | "observedHazards"
          | "existingControls"
          | "recommendedActions"
          | "operatorNotes"
          | "attachments"
        >
      >,
    ) => apiFetch<VenueRiskAssessment>(`/risk-assessments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    submit: (id: number) => apiFetch<VenueRiskAssessment>(`/risk-assessments/${id}/submit`, { method: "POST" }),
  },
  assessments: {
    list: () => apiFetch<AssessmentSummary[]>("/assessments"),
    get: (id: number) => apiFetch<AssessmentDetail>(`/assessments/${id}`),
    create: (data: Partial<AssessmentDetail>) => apiFetch<AssessmentSummary>("/assessments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<AssessmentDetail>) => apiFetch<AssessmentDetail>(`/assessments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/assessments/${id}`, { method: "DELETE" }),
    approve: (id: number, data: { userId: number; changeSummary: string }) => apiFetch<AssessmentDetail>(`/assessments/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),
    versions: (id: number) => apiFetch<AssessmentVersion[]>(`/assessments/${id}/versions`),
    auditLog: (id: number) => apiFetch<AuditLogEntry[]>(`/assessments/${id}/audit-log`),
    riskMatrix: (id: number) => apiFetch<RiskMatrix>(`/assessments/${id}/risk-matrix`),
    upsertRiskMatrix: (id: number, data: Partial<RiskMatrix>) => apiFetch<RiskMatrix>(`/assessments/${id}/risk-matrix`, { method: "PUT", body: JSON.stringify(data) }),
    evidence: (id: number) => apiFetch<Evidence[]>(`/assessments/${id}/evidence`),
    addEvidence: (id: number, data: Partial<Evidence>) => apiFetch<Evidence>(`/assessments/${id}/evidence`, { method: "POST", body: JSON.stringify(data) }),
  },
  incidents: {
    list: () => apiFetch<Incident[]>("/incidents"),
    create: (data: Partial<Incident>) => apiFetch<Incident>("/incidents", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Incident>) => apiFetch<Incident>(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/incidents/${id}`, { method: "DELETE" }),
  },
  evidence: {
    update: (id: number, data: Partial<Evidence>) => apiFetch<Evidence>(`/evidence/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/evidence/${id}`, { method: "DELETE" }),
  },
  alerts: {
    list: () => apiFetch<Alert[]>("/alerts"),
    update: (id: number, data: { status: AlertStatus; reviewedBy?: number }) => apiFetch<Alert>(`/alerts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  osint: {
    review: (id: number, data: { status: "accepted" | "rejected"; analystNote?: string }) => apiFetch<OsintEvent>(`/osint/${id}/review`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  routes: {
    list: (params?: { assessmentId?: number; venueId?: number }) => {
      const qs = params ? "?" + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)]))
      ).toString() : "";
      return apiFetch<Route[]>(`/routes${qs}`);
    },
    get: (id: number) => apiFetch<Route>(`/routes/${id}`),
    create: (data: Partial<Route> & { routeName: string; routeType: RouteType; creationMethod: RouteCreationMethod }) =>
      apiFetch<Route>("/routes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Route>) => apiFetch<Route>(`/routes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/routes/${id}`, { method: "DELETE" }),
    verify: (id: number) => apiFetch<Route>(`/routes/${id}/verify`, { method: "POST" }),
    analyze: (id: number) => apiFetch<{ route: Route; findings: RouteFinding[] }>(`/routes/${id}/analyze`, { method: "POST" }),
    snap: (id: number) => apiFetch<SnapResult>(`/routes/${id}/snap`, { method: "POST" }),
    restoreDrawn: (id: number) => apiFetch<Route>(`/routes/${id}/restore-drawn`, { method: "POST" }),
    findings: (id: number) => apiFetch<RouteFinding[]>(`/routes/${id}/findings`),
    updateFinding: (routeId: number, findingId: number, data: { verified?: boolean; analystNotes?: string }) =>
      apiFetch<RouteFinding>(`/routes/${routeId}/findings/${findingId}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  countries: {
    intelligence: (iso2: string, name: string) =>
      apiFetch<CountryIntelligence>(`/countries/${iso2}/intelligence?name=${encodeURIComponent(name)}`),
  },
};

// Country Intelligence Engine (Operational Canvas) - a Risk Rating from
// the US State Department travel advisory (a periodically-refreshed
// reference table, not a live fetch - no reliable live API exists for
// this rating, see artifacts/api-server/src/lib/travel-advisory-data.ts),
// plus a separate, live Public Health badge from CDC. See
// artifacts/api-server/src/routes/country-intelligence.ts for the real
// data sources.
export type CountryRiskLevel = "unrated" | "low" | "elevated" | "critical" | "do_not_travel";

export interface CountryTravelAdvisory {
  level: 1 | 2 | 3 | 4;
  label?: string;
  summary: string;
  sourceUrl: string;
  advisoryDate: string | null;
}

export type HealthRating = "low" | "moderate" | "high" | "critical";

export interface CountryHealthNotice {
  level: 1 | 2 | 3 | 4;
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string | null;
}

export interface CountryIntelligence {
  riskRating: { level: CountryRiskLevel; drivers: string[] };
  travelAdvisories: { us: CountryTravelAdvisory | null };
  health: { rating: HealthRating; notices: CountryHealthNotice[] };
}
