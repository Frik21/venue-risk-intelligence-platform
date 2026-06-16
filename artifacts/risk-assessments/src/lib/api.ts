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
export type UserRole = "admin" | "analyst" | "reviewer" | "viewer";
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
    findings: (id: number) => apiFetch<RouteFinding[]>(`/routes/${id}/findings`),
    updateFinding: (routeId: number, findingId: number, data: { verified?: boolean; analystNotes?: string }) =>
      apiFetch<RouteFinding>(`/routes/${routeId}/findings/${findingId}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
};
