const BASE = "/api";

// Fired on any 401 from any endpoint - AuthContext listens for this to
// force a redirect to /login, so none of the ~35 call sites using
// apiFetch need their own 401 handling. Not fired for /auth/login
// itself (a bad password there is an expected, inline-handled result,
// not a "your session died" event).
export const SESSION_EXPIRED_EVENT = "venueguard-session-expired";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (res.status === 401 && path !== "/auth/login") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    // Error responses are JSON ({ error: "..." }) from both zod
    // validation (400s) and the server's catch-all handler (500s) -
    // pull out just the message rather than showing the raw body.
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") message = parsed.error;
    } catch {
      // Not JSON - fall back to the raw text as-is.
    }
    throw new Error(message);
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
export type UserRole = "admin" | "manager" | "cpo" | "finance" | "human_resources" | "operations";
export type RouteType =
  | "primary_extraction" | "secondary_extraction" | "medical_evacuation"
  | "vip_arrival" | "vip_departure" | "staff_access" | "supplier_route" | "emergency_access";
export type RouteCreationMethod = "endpoint_marker" | "street_builder" | "freehand_draw";

export interface User {
  id: number; companyId: number | null; name: string; email: string; role: UserRole; avatarInitials: string | null; active: boolean;
  dayRate: number | null; nightRate: number | null; officeId: number | null; mustChangePassword: boolean; createdAt: string;
}

// The logged-in session's own view of itself - a trimmed subset of
// User (no active/dayRate/nightRate/officeId/createdAt, none of which
// matter for "who am I").
export interface SessionUser {
  id: number; companyId: number | null; companyName: string | null; name: string; email: string; role: UserRole;
  avatarInitials: string | null; mustChangePassword: boolean;
  // True only while an Owner (role: "admin") session is in Preview mode
  // - see lib/api.ts's auth.enterPreview/exitPreview and the Owner
  // Console's "Preview" button, pages/owner/dashboard.tsx.
  isPreviewing: boolean;
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

// Drives the GDELT news-monitoring OSINT source - see
// artifacts/api-server/src/lib/gdelt.ts. venueId is currently unused by
// the UI (a flat, global phrase list for now - see venueId comment in
// lib/db/src/schema/monitoring.ts).
export interface SearchPhrase {
  id: number;
  venueId: number | null;
  phrase: string;
  createdAt: string;
}

export type TaskStatus = "not_completed" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type QuotationStatus = "approved" | "awaiting_approval" | "denied";

// Task Assignment - a Manager assigns CPOs a specific piece of
// structured work already in the platform, tied to a venue. The CPO
// moves it through TaskStatus; that status is what feeds back to the
// Manager. Not a general worklist or two-way chat.
//
// assignedTo/assignedToName is the primary CPO (nullable - a task can
// be created "unassigned" and covered later); assignedToIds/Names is
// the full roster, which can hold several CPOs when a client needs
// more than one operator. assignedTo is always the first entry of the
// roster when the roster is non-empty.
export interface Task {
  id: number;
  taskNumber: string;
  // Nullable - a task can be created before a location is picked; see
  // Pending Details in lib/task-bucket.ts.
  venueId: number | null;
  venueName: string | null;
  officeId: number | null;
  assignedTo: number | null;
  assignedToName: string | null;
  assignedToIds: number[];
  assignedToNames: string[];
  assignedBy: number;
  assignedByName: string | null;
  title: string;
  dueDate: string | null;
  endDate: string | null;
  status: TaskStatus;
  // Stamped server-side the first time status moves into "completed" -
  // see completedAt in lib/db/src/schema/tasks.ts. Powers the
  // Dashboard's Tasks Completed trend line.
  completedAt: string | null;
  priority: TaskPriority;
  archived: boolean;
  invoiced: boolean;
  completionNote: string | null;
  // Manager-set, independent of status - see clientConfirmedAt in
  // lib/db/src/schema/tasks.ts. null until a Manager confirms with the
  // client (PATCH .../tasks with clientConfirmed: true).
  clientConfirmedAt: string | null;
  // Where the client's quotation stands, set by hand on the task form -
  // independent of clientConfirmedAt/status, nothing derives from it yet.
  quotationStatus: QuotationStatus;
  // Optional link to a saved Client record (see Client above) - picking
  // one on the task form pre-fills clientName/clientContact but those
  // stay the real freeform fields, so this can be null for a one-off
  // client with no record.
  clientId: number | null;
  clientName: string;
  clientContact: string;
  clientRequirements: string;
  operatorsRequired: number;
  armedRequired: boolean;
  vehiclesRequired: number;
  estimatedCost: number | null;
  estimatedCostCurrency: string;
  // Manual line items a Manager builds up on the Quotations page to
  // work out estimatedCost - feeds the client-facing quotation PDF
  // (GET /tasks/:id/quotation-pdf). No rate lookups yet.
  quotationLineItems: { description: string; amount: number }[];
  planSubmittedAt: string | null;
  // Task-lifecycle flagging on the Alerts page - see alertReviewedBucket
  // in lib/db/src/schema/tasks.ts. alertReviewedBucket is the bucket name
  // (from lib/task-bucket.ts) that was last marked reviewed; stale once
  // the task moves to a different bucket.
  alertReviewedBucket: string | null;
  alertReviewedAt: string | null;
  alertReviewedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CompanyTier = "enterprise" | "micro_enterprise";
export type CompanyStatus = "trial" | "active" | "suspended" | "cancelled";

// A subscriber of VenueGuard itself - the Owner page's own entity, not
// a company-side concept. Aggregate-only fields (counts, timestamps) -
// never row-level content from that company's own data.
export interface Company {
  id: number;
  name: string;
  tier: CompanyTier;
  status: CompanyStatus;
  // The Owner's own sandbox for testing the Management/CPO pages - see
  // SessionUser.isPreviewing. Only a company flagged true here can ever
  // be entered via auth.enterPreview, enforced server-side.
  isInternal: boolean;
  managementUserCount: number;
  cpoCount: number;
  venueCount: number;
  clientCount: number;
  taskCount: number;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface CompanySummary {
  totalCompanies: number;
  byStatus: Record<CompanyStatus, number>;
  byTier: Record<CompanyTier, number>;
  estimatedMonthlyRevenue: number;
}

export interface Office {
  id: number;
  name: string;
  address: string;
  city: string;
  country: string;
  managerId: number | null;
  managerName: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ClientStatus = "lead" | "active" | "inactive" | "vip";

export interface Client {
  id: number;
  name: string;
  status: ClientStatus;
  industry: string;
  primaryContactName: string;
  primaryContactRole: string;
  email: string;
  phone: string;
  address: string;
  dayRate: number | null;
  nightRate: number | null;
  officeId: number | null;
  createdAt: string;
  updatedAt: string;
}

// A dated activity/communication log entry against a Client - see
// clientActivitiesTable in schema/client-activities.ts.
export interface ClientActivity {
  id: number;
  clientId: number;
  note: string;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
}

export type VendorStatus = "lead" | "active" | "inactive" | "preferred";

export interface Vendor {
  id: number;
  name: string;
  status: VendorStatus;
  category: string;
  primaryContactName: string;
  primaryContactRole: string;
  email: string;
  phone: string;
  address: string;
  officeId: number | null;
  createdAt: string;
  updatedAt: string;
}

// A dated activity/communication log entry against a Vendor - see
// vendorActivitiesTable in schema/vendor-activities.ts.
export interface VendorActivity {
  id: number;
  vendorId: number;
  note: string;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
}

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected";
export type QuoteMarkupType = "percent" | "fixed";
export const QUOTE_COST_CATEGORIES = [
  "cpo_rate", "overtime", "vehicles", "fuel_mileage", "accommodation",
  "flights_travel", "equipment", "subcontractors", "allowances", "misc",
] as const;
export type QuoteCostCategory = (typeof QUOTE_COST_CATEGORIES)[number];

// A formal sales quote - its own entity/lifecycle, separate from a
// Task's lighter quotationStatus/quotationLineItems price gate (see
// schema/quotes.ts on the backend for why). internalCost/markupAmount/
// clientPrice/taxAmount/totalQuoteValue are all computed server-side on
// every read, never stored.
export interface Quote {
  id: number;
  quoteNumber: string;
  taskId: number | null;
  officeId: number | null;
  title: string;
  status: QuoteStatus;
  validUntil: string | null;
  clientId: number | null;
  clientName: string;
  clientContact: string;
  billingDetails: string;
  venueId: number | null;
  venueName: string | null;
  clientRequirements: string;
  startDate: string | null;
  endDate: string | null;
  priority: TaskPriority;
  operatorsRequired: number;
  armedRequired: boolean;
  vehiclesRequired: number;
  additionalEquipment: string;
  costLineItems: { category: QuoteCostCategory; description: string; amount: number }[];
  markupType: QuoteMarkupType;
  markupValue: number;
  taxRatePercent: number;
  currency: string;
  assignedBy: number;
  assignedByName: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  internalCost: number;
  markupAmount: number;
  clientPrice: number;
  taxAmount: number;
  totalQuoteValue: number;
}

export type InvoiceStatus = "draft" | "sent" | "paid";

// A client-facing Invoice - money owed TO VenueGuard, the natural next
// step after a Task/Quote is approved and completed (see
// schema/invoices.ts). Deliberately simpler than Quote: billing line
// items + a tax rate, no cost-category build-up or markup.
// subtotal/taxAmount/totalAmount are computed server-side on every
// read, never stored.
export interface Invoice {
  id: number;
  invoiceNumber: string;
  taskId: number | null;
  quoteId: number | null;
  clientId: number | null;
  officeId: number | null;
  title: string;
  status: InvoiceStatus;
  clientName: string;
  clientContact: string;
  billingDetails: string;
  dueDate: string | null;
  lineItems: { category: QuoteCostCategory | null; description: string; amount: number }[];
  taxRatePercent: number;
  currency: string;
  assignedBy: number;
  assignedByName: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
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

// The CPO's in-field risk assessment (Risk Assessments > Venues > a
// task) - a task can have several of these (slotIndex 1, 2, 3...), so
// it isn't tied to a real venue record; the CPO types the actual
// location into the Location field on each one. Distinct from
// AssessmentSummary/AssessmentDetail below, which is the separate,
// formal Manager/Analyst-facing Assessments feature. Every field is a
// single free-text comment box (per direct product direction), not a
// nested sub-list.
export interface VenueRiskAssessment {
  id: number;
  taskId: number;
  slotIndex: number;
  operatorId: number;
  operatorName: string | null;
  timezone: string | null;
  location: string;
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

// Mirrors artifacts/api-server/src/lib/weather.ts's WeatherFinding -
// this frontend package can't import a backend module directly. Only
// returned when conditions are genuinely notable (see that file's own
// comment on why "nothing to report" is a real, positive result, not
// an omission).
export type WeatherSeverity = "moderate" | "high" | "critical";

export interface WeatherFinding {
  summary: string;
  severity: WeatherSeverity;
  sourceName: string;
  sourceUrl: string;
}

// Mirrors artifacts/api-server/src/lib/traffic.ts's TrafficCondition -
// same "frontend can't import a backend module" reasoning as
// WeatherFinding above. Null (from the API) means no road segment data
// for this exact point, not a failure.
export type TrafficSeverity = "free_flow" | "light" | "moderate" | "heavy" | "closed";

export interface TrafficCondition {
  severity: TrafficSeverity;
  label: string;
  currentSpeedKph: number | null;
  freeFlowSpeedKph: number | null;
}

// The CPO's Route Planning slot (Route Planning panel, Operational
// Canvas) - task-scoped/slot-based, same pattern as VenueRiskAssessment
// above. Start/end are set via the location engine, then "Calculate"
// fetches geometry/distance/static duration from OSRM and a live-
// traffic-aware ETA from TomTom (see task-routes.ts on the backend).
// Distinct from Route/api.routes above, which is the separate, formal
// Assessment-based route-analysis feature.
// Mirrors artifacts/api-server/src/lib/nearby-services.ts's
// NearbyService - same "frontend can't import a backend module"
// reasoning as WeatherFinding/TrafficCondition above.
export interface NearbyService {
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
}

export interface TaskRoute {
  id: number;
  taskId: number;
  slotIndex: number;
  startLabel: string;
  startLat: number | null;
  startLng: number | null;
  endLabel: string;
  endLat: number | null;
  endLng: number | null;
  routeGeometryGeojson: RouteGeoJSON | null;
  distanceMeters: number | null;
  staticTravelTimeSeconds: number | null;
  liveTravelTimeSeconds: number | null;
  trafficDelaySeconds: number | null;
  trafficCheckedAt: string | null;
  nearestHospitals: NearbyService[];
  nearestPoliceStations: NearbyService[];
  createdAt: string;
  updatedAt: string;
}

// One logged day - Profile > Timesheet. date is a plain "YYYY-MM-DD"
// string, matching the backend's schema (see
// lib/db/src/schema/timesheet-entries.ts).
export interface TimesheetEntry {
  id: number;
  userId: number;
  userName: string | null;
  taskId: number | null;
  taskTitle: string | null;
  date: string;
  hoursWorked: number;
  dayHours: number;
  nightHours: number;
  notes: string;
  approved: boolean;
  approvedBy: number | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  overtimeThresholdHours: number;
  overtimeThresholdPeriod: "daily" | "weekly";
  overtimeMultiplier: number;
  updatedAt: string;
}

export interface PersonnelCostLine {
  entryId: number;
  userId: number;
  userName: string | null;
  taskId: number | null;
  taskTitle: string | null;
  date: string;
  hours: number;
  cost: number;
}

// An operator's approved-but-not-yet-paid hours, rolled up ready for
// a Pay Run - see GET /payroll/pending in routes/payroll.ts.
export interface PendingPayroll {
  userId: number;
  userName: string | null;
  totalHours: number;
  totalAmount: number;
}

export type PayRunStatus = "pending" | "paid";

// A Pay Run - one payout to one operator (see schema/payroll.ts).
// totalHours/totalAmount are snapshotted at creation, not recomputed
// live - a Pay Run represents money already committed to/paid out.
export interface PayRun {
  id: number;
  userId: number;
  userName: string | null;
  totalHours: number;
  totalAmount: number;
  status: PayRunStatus;
  paidAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

// A Manager-to-CPO broadcast instruction - see
// announcementsTable in schema/announcements.ts.
export interface Announcement {
  id: number;
  message: string;
  taskId: number | null;
  taskNumber: string | null;
  taskTitle: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
}

export interface OnboardingChecklistEntry {
  key: string;
  label: string;
  checked: boolean;
}

// Operator Onboarding - one per candidate/CPO, created the moment a
// Manager adds an operator, before any real user account exists.
// userId is null until they're Approved - approving them is what
// creates their actual account (see PATCH /onboarding/:id/status) -
// so a Pending/Denied operator can't be assigned tasks, appear in
// Operator View, etc. Until then, userName reflects the candidate
// name entered at Add Operator time.
export type OnboardingStatus = "in_progress" | "onboarded" | "denied";

export interface OnboardingRecord {
  id: number;
  userId: number | null;
  userName: string | null;
  status: OnboardingStatus;
  checklist: OnboardingChecklistEntry[];
  checkedCount: number;
  totalCount: number;
  // Independent of status - a Manager-set record of when operational
  // access was actually handed over, separate from the Approved/
  // Pending/Denied decision and from account creation.
  operationalAccessGrantedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingOverviewRecord extends OnboardingRecord {
  documentCount: number;
}

export type DocumentType = "id_document" | "passport";

// fileDataUrl is a base64 data: URL (this app has no cloud file
// storage) - same pattern as Expenses receipts. Attached to the
// onboarding record, not the user, since documents can be uploaded
// before a real user account exists.
export interface OnboardingDocument {
  id: number;
  operatorOnboardingId: number;
  documentType: DocumentType;
  label: string;
  filename: string | null;
  fileDataUrl: string | null;
  expiryDate: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory = "fuel" | "accommodation" | "food" | "parking" | "tolls" | "equipment" | "other";

// One expense logged against a task - Profile > Expenses. receiptDataUrl
// is a base64 data: URL (this app has no cloud file storage set up),
// stored/returned directly on the row - see
// lib/db/src/schema/expenses.ts on the backend.
export interface Expense {
  id: number;
  taskId: number;
  operatorId: number;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  description: string;
  incurredOn: string;
  receiptFilename: string | null;
  receiptDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalExpense extends Expense {
  taskTitle: string | null;
  venueName: string | null;
  venueCountry: string | null;
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

export interface GlobalAuditLogEntry extends AuditLogEntry {
  assessmentTitle: string | null;
}

// A CPO field note - one row from venue_risk_assessments, but only
// the two Manager-facing fields (Area Advisories / Current Operating
// Conditions), across every task rather than one at a time.
export interface FieldNote {
  id: number; taskId: number; taskTitle: string | null;
  venueName: string | null; venueCity: string | null; operatorName: string | null;
  location: string; currentOperatingConditions: string; areaAdvisories: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: number; assessmentId: number; assessmentTitle: string | null;
  evidenceType: string; label: string; filename: string | null; url: string | null;
  verified: boolean; uploadedByName: string | null; createdAt: string;
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
    // initialPassword is only ever present on this one response - shown
    // once in the Add User dialog, never stored/refetchable.
    create: (data: Partial<User>) => apiFetch<User & { initialPassword: string }>("/users", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Pick<User, "name" | "email" | "avatarInitials" | "officeId">>) =>
      apiFetch<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    updateRates: (id: number, data: { dayRate: number | null; nightRate: number | null }) =>
      apiFetch<User>(`/users/${id}/rates`, { method: "PATCH", body: JSON.stringify(data) }),
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
    listAll: () => apiFetch<SearchPhrase[]>("/search-phrases"),
    createGlobal: (phrase: string) => apiFetch<SearchPhrase>("/search-phrases", { method: "POST", body: JSON.stringify({ phrase }) }),
    list: (venueId: number) => apiFetch<SearchPhrase[]>(`/venues/${venueId}/search-phrases`),
    create: (venueId: number, phrase: string) =>
      apiFetch<SearchPhrase>(`/venues/${venueId}/search-phrases`, { method: "POST", body: JSON.stringify({ phrase }) }),
    delete: (id: number) => apiFetch<void>(`/search-phrases/${id}`, { method: "DELETE" }),
  },
  tasks: {
    list: (params?: { assignedTo?: number; includeArchived?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.assignedTo != null) q.set("assignedTo", String(params.assignedTo));
      if (params?.includeArchived) q.set("includeArchived", "true");
      const qs = q.toString();
      return apiFetch<Task[]>(`/tasks${qs ? `?${qs}` : ""}`);
    },
    create: (data: {
      venueId?: number | null; officeId?: number | null; assigneeIds?: number[]; assignedBy: number; title?: string;
      dueDate?: string; endDate?: string; priority?: TaskPriority; quotationStatus?: QuotationStatus;
      clientId?: number | null; clientName?: string; clientContact?: string; clientRequirements?: string;
      operatorsRequired?: number; armedRequired?: boolean; vehiclesRequired?: number;
      estimatedCost?: number | null; estimatedCostCurrency?: string;
    }) => apiFetch<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
    updateStatus: (id: number, data: { status: TaskStatus; completionNote?: string }) =>
      apiFetch<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{
      venueId: number | null; officeId: number | null; assigneeIds: number[]; assignedTo: number | null; assignedBy: number; title: string;
      dueDate: string | null; endDate: string | null; status: TaskStatus; priority: TaskPriority; archived: boolean;
      invoiced: boolean;
      clientConfirmed: boolean; quotationStatus: QuotationStatus;
      clientId: number | null; clientName: string; clientContact: string; clientRequirements: string;
      operatorsRequired: number; armedRequired: boolean; vehiclesRequired: number;
      estimatedCost: number | null; estimatedCostCurrency: string;
      quotationLineItems: { description: string; amount: number }[];
      alertReviewedBucket: string | null; alertReviewedBy: number | null;
    }>) => apiFetch<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    duplicate: (id: number) => apiFetch<Task>(`/tasks/${id}/duplicate`, { method: "POST" }),
  },
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ user: SessionUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    register: (data: { companyName: string; tier?: CompanyTier; name: string; email: string; password: string }) =>
      apiFetch<{ user: SessionUser }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    me: () => apiFetch<{ user: SessionUser }>("/auth/me"),
    changePassword: (currentPassword: string, newPassword: string) =>
      apiFetch<{ user: SessionUser }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
    // Owner-only - browse the Management/CPO pages scoped to the
    // internal test company for testing/QA. See SessionUser.isPreviewing.
    enterPreview: (companyId: number) => apiFetch<{ user: SessionUser }>(`/auth/preview/${companyId}`, { method: "POST" }),
    exitPreview: () => apiFetch<{ user: SessionUser }>("/auth/preview/exit", { method: "POST" }),
  },
  companies: {
    list: () => apiFetch<Company[]>("/companies"),
    summary: () => apiFetch<CompanySummary>("/companies/summary"),
    create: (data: { name: string; tier?: CompanyTier; status?: CompanyStatus; isInternal?: boolean }) =>
      apiFetch<Company>("/companies", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{ name: string; tier: CompanyTier; status: CompanyStatus; isInternal: boolean }>) =>
      apiFetch<Company>(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  offices: {
    list: () => apiFetch<Office[]>("/offices"),
    create: (data: { name: string; address?: string; city: string; country: string; managerId?: number | null; notes?: string }) =>
      apiFetch<Office>("/offices", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{ name: string; address: string; city: string; country: string; managerId: number | null; notes: string }>) =>
      apiFetch<Office>(`/offices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/offices/${id}`, { method: "DELETE" }),
  },
  clients: {
    list: () => apiFetch<Client[]>("/clients"),
    create: (data: {
      name: string; status?: ClientStatus; industry?: string;
      primaryContactName?: string; primaryContactRole?: string;
      email?: string; phone?: string; address?: string;
      dayRate?: number | null; nightRate?: number | null; officeId?: number | null;
    }) => apiFetch<Client>("/clients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{
      name: string; status: ClientStatus; industry: string;
      primaryContactName: string; primaryContactRole: string;
      email: string; phone: string; address: string;
      dayRate: number | null; nightRate: number | null; officeId: number | null;
    }>) => apiFetch<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/clients/${id}`, { method: "DELETE" }),
  },
  clientActivities: {
    list: (clientId: number) => apiFetch<ClientActivity[]>(`/clients/${clientId}/activities`),
    create: (clientId: number, data: { note: string; createdBy?: number | null }) =>
      apiFetch<ClientActivity>(`/clients/${clientId}/activities`, { method: "POST", body: JSON.stringify(data) }),
    delete: (clientId: number, id: number) => apiFetch<void>(`/clients/${clientId}/activities/${id}`, { method: "DELETE" }),
  },
  vendors: {
    list: () => apiFetch<Vendor[]>("/vendors"),
    create: (data: {
      name: string; status?: VendorStatus; category?: string;
      primaryContactName?: string; primaryContactRole?: string;
      email?: string; phone?: string; address?: string; officeId?: number | null;
    }) => apiFetch<Vendor>("/vendors", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{
      name: string; status: VendorStatus; category: string;
      primaryContactName: string; primaryContactRole: string;
      email: string; phone: string; address: string; officeId: number | null;
    }>) => apiFetch<Vendor>(`/vendors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/vendors/${id}`, { method: "DELETE" }),
  },
  vendorActivities: {
    list: (vendorId: number) => apiFetch<VendorActivity[]>(`/vendors/${vendorId}/activities`),
    create: (vendorId: number, data: { note: string; createdBy?: number | null }) =>
      apiFetch<VendorActivity>(`/vendors/${vendorId}/activities`, { method: "POST", body: JSON.stringify(data) }),
    delete: (vendorId: number, id: number) => apiFetch<void>(`/vendors/${vendorId}/activities/${id}`, { method: "DELETE" }),
  },
  quotes: {
    list: () => apiFetch<Quote[]>("/quotes"),
    create: (data: Partial<{
      taskId: number | null; officeId: number | null;
      title: string; status: QuoteStatus; validUntil: string | null;
      clientId: number | null; clientName: string; clientContact: string; billingDetails: string;
      venueId: number | null; clientRequirements: string; startDate: string | null; endDate: string | null;
      priority: TaskPriority; operatorsRequired: number; armedRequired: boolean; vehiclesRequired: number;
      additionalEquipment: string;
      costLineItems: { category: QuoteCostCategory; description: string; amount: number }[];
      markupType: QuoteMarkupType; markupValue: number; taxRatePercent: number; currency: string;
      assignedBy: number;
    }> & { assignedBy: number }) => apiFetch<Quote>("/quotes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{
      taskId: number | null;
      title: string; status: QuoteStatus; validUntil: string | null;
      clientId: number | null; clientName: string; clientContact: string; billingDetails: string;
      venueId: number | null; clientRequirements: string; startDate: string | null; endDate: string | null;
      priority: TaskPriority; operatorsRequired: number; armedRequired: boolean; vehiclesRequired: number;
      additionalEquipment: string;
      costLineItems: { category: QuoteCostCategory; description: string; amount: number }[];
      markupType: QuoteMarkupType; markupValue: number; taxRatePercent: number; currency: string;
      assignedBy: number;
    }>) => apiFetch<Quote>(`/quotes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/quotes/${id}`, { method: "DELETE" }),
  },
  invoices: {
    list: () => apiFetch<Invoice[]>("/invoices"),
    create: (data: Partial<{
      taskId: number | null; quoteId: number | null; officeId: number | null;
      title: string; status: InvoiceStatus;
      clientId: number | null; clientName: string; clientContact: string; billingDetails: string;
      dueDate: string | null;
      lineItems: { category: QuoteCostCategory | null; description: string; amount: number }[];
      taxRatePercent: number; currency: string;
      assignedBy: number;
    }> & { assignedBy: number }) => apiFetch<Invoice>("/invoices", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{
      taskId: number | null; quoteId: number | null; officeId: number | null;
      title: string; status: InvoiceStatus;
      clientId: number | null; clientName: string; clientContact: string; billingDetails: string;
      dueDate: string | null;
      lineItems: { category: QuoteCostCategory | null; description: string; amount: number }[];
      taxRatePercent: number; currency: string;
      assignedBy: number;
    }>) => apiFetch<Invoice>(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/invoices/${id}`, { method: "DELETE" }),
  },
  plans: {
    forTask: (taskId: number) => apiFetch<Plan>(`/tasks/${taskId}/plan`),
    setChecklistItem: (planId: number, key: string, checked: boolean) =>
      apiFetch<Plan>(`/plans/${planId}/checklist`, { method: "PATCH", body: JSON.stringify({ key, checked }) }),
    submit: (planId: number) => apiFetch<Plan>(`/plans/${planId}/submit`, { method: "POST" }),
  },
  venueRiskAssessments: {
    list: (taskId: number) => apiFetch<VenueRiskAssessment[]>(`/tasks/${taskId}/risk-assessments`),
    create: (taskId: number, timezone?: string) =>
      apiFetch<VenueRiskAssessment>(`/tasks/${taskId}/risk-assessments`, {
        method: "POST",
        body: JSON.stringify({ timezone }),
      }),
    get: (id: number) => apiFetch<VenueRiskAssessment>(`/risk-assessments/${id}`),
    update: (
      id: number,
      data: Partial<
        Pick<
          VenueRiskAssessment,
          | "location"
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
    listFieldNotes: () => apiFetch<FieldNote[]>("/venue-risk-assessments"),
  },
  taskRoutes: {
    list: (taskId: number) => apiFetch<TaskRoute[]>(`/tasks/${taskId}/routes`),
    create: (taskId: number) => apiFetch<TaskRoute>(`/tasks/${taskId}/routes`, { method: "POST" }),
    update: (
      id: number,
      data: Partial<Pick<TaskRoute, "startLabel" | "startLat" | "startLng" | "endLabel" | "endLat" | "endLng">>,
    ) => apiFetch<TaskRoute>(`/task-routes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    calculate: (id: number) => apiFetch<TaskRoute>(`/task-routes/${id}/calculate`, { method: "POST" }),
  },
  timesheet: {
    list: (userId: number) => apiFetch<TimesheetEntry[]>(`/users/${userId}/timesheet`),
    listForTask: (taskId: number) => apiFetch<TimesheetEntry[]>(`/tasks/${taskId}/timesheet-entries`),
    upsert: (userId: number, data: { taskId: number; date: string; dayHours: number; nightHours: number; notes?: string }) =>
      apiFetch<TimesheetEntry>(`/users/${userId}/timesheet`, { method: "POST", body: JSON.stringify(data) }),
    approve: (id: number, approvedBy: number) =>
      apiFetch<TimesheetEntry>(`/timesheet/${id}/approve`, { method: "POST", body: JSON.stringify({ approvedBy }) }),
    delete: (id: number) => apiFetch<void>(`/timesheet/${id}`, { method: "DELETE" }),
  },
  settings: {
    get: () => apiFetch<CompanySettings>("/settings"),
    update: (data: Partial<CompanySettings>) => apiFetch<CompanySettings>("/settings", { method: "PATCH", body: JSON.stringify(data) }),
  },
  personnelCosts: {
    list: () => apiFetch<PersonnelCostLine[]>("/personnel-costs"),
  },
  payroll: {
    pending: () => apiFetch<PendingPayroll[]>("/payroll/pending"),
    listRuns: () => apiFetch<PayRun[]>("/payroll/runs"),
    createRun: (data: { userId: number; createdBy?: number | null }) =>
      apiFetch<PayRun>("/payroll/runs", { method: "POST", body: JSON.stringify(data) }),
    updateRun: (id: number, data: { status: PayRunStatus }) =>
      apiFetch<PayRun>(`/payroll/runs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteRun: (id: number) => apiFetch<void>(`/payroll/runs/${id}`, { method: "DELETE" }),
  },
  announcements: {
    list: () => apiFetch<Announcement[]>("/announcements"),
    create: (data: { message: string; taskId?: number | null; createdBy?: number | null }) =>
      apiFetch<Announcement>("/announcements", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/announcements/${id}`, { method: "DELETE" }),
  },
  onboarding: {
    listAll: () => apiFetch<OnboardingOverviewRecord[]>("/onboarding"),
    create: (data: { name: string; email: string }) =>
      apiFetch<OnboardingRecord>("/onboarding", { method: "POST", body: JSON.stringify(data) }),
    get: (onboardingId: number) => apiFetch<OnboardingRecord>(`/onboarding/${onboardingId}`),
    setChecklistItem: (onboardingId: number, key: string, checked: boolean) =>
      apiFetch<OnboardingRecord>(`/onboarding/${onboardingId}/checklist`, { method: "PATCH", body: JSON.stringify({ key, checked }) }),
    updateStatus: (onboardingId: number, status: OnboardingStatus) =>
      apiFetch<OnboardingRecord>(`/onboarding/${onboardingId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    setOperationalAccess: (onboardingId: number, granted: boolean) =>
      apiFetch<OnboardingRecord>(`/onboarding/${onboardingId}/operational-access`, { method: "PATCH", body: JSON.stringify({ granted }) }),
    listDocuments: (onboardingId: number) => apiFetch<OnboardingDocument[]>(`/onboarding/${onboardingId}/documents`),
    addDocument: (onboardingId: number, data: { documentType: DocumentType; label?: string; filename?: string; fileDataUrl?: string; expiryDate?: string }) =>
      apiFetch<OnboardingDocument>(`/onboarding/${onboardingId}/documents`, { method: "POST", body: JSON.stringify(data) }),
    updateDocument: (id: number, data: Partial<{ label: string; expiryDate: string; verified: boolean }>) =>
      apiFetch<OnboardingDocument>(`/onboarding-documents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteDocument: (id: number) => apiFetch<void>(`/onboarding-documents/${id}`, { method: "DELETE" }),
    remove: (onboardingId: number) => apiFetch<void>(`/onboarding/${onboardingId}`, { method: "DELETE" }),
  },
  expenses: {
    list: (taskId: number) => apiFetch<Expense[]>(`/tasks/${taskId}/expenses`),
    create: (taskId: number) => apiFetch<Expense>(`/tasks/${taskId}/expenses`, { method: "POST" }),
    update: (
      id: number,
      data: Partial<
        Pick<Expense, "category" | "amount" | "currency" | "description" | "incurredOn" | "receiptFilename" | "receiptDataUrl">
      >,
    ) => apiFetch<Expense>(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => apiFetch<void>(`/expenses/${id}`, { method: "DELETE" }),
    listAll: () => apiFetch<GlobalExpense[]>("/expenses"),
  },
  weather: {
    check: (lat: number, lng: number) =>
      apiFetch<{ temperatureC: number | null; conditions: string; finding: WeatherFinding | null }>(
        `/weather?lat=${lat}&lng=${lng}`,
      ),
  },
  traffic: {
    check: (lat: number, lng: number) =>
      apiFetch<{ condition: TrafficCondition | null }>(`/traffic?lat=${lat}&lng=${lng}`),
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
    listAll: () => apiFetch<DocumentRecord[]>("/evidence"),
  },
  auditLog: {
    listAll: () => apiFetch<GlobalAuditLogEntry[]>("/audit-log"),
  },
  alerts: {
    list: () => apiFetch<Alert[]>("/alerts"),
    update: (id: number, data: { status: AlertStatus; reviewedBy?: number }) => apiFetch<Alert>(`/alerts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  osint: {
    review: (id: number, data: { status: "accepted" | "rejected"; analystNote?: string }) => apiFetch<OsintEvent>(`/osint/${id}/review`, { method: "PATCH", body: JSON.stringify(data) }),
    monitoredVenues: () => apiFetch<{ venueId: number; venueName: string }[]>("/osint/monitored-venues"),
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
