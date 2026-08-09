import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ChangeEvent } from "react";
import { ArrowRight, ArrowLeft, MapPin, ShieldCheck, ShieldAlert, Clock, AlertCircle, AlertTriangle, Info, ClipboardList, ClipboardCheck, Bell, Layers, LogOut, Search, X, ChevronDown, ChevronRight, ChevronLeft, ListChecks, MessageSquare, Check, Building2, Plus, Crosshair, Loader2, Car, Route, Download, Eye, User as UserIcon, LayoutDashboard, Wallet } from "lucide-react";
import { COUNTRY_REGISTRY } from "@/lib/country-registry";
import type { CountryDefinition } from "@/lib/country-registry";
import { CITY_REGISTRY } from "@/lib/city-registry";
import type { CityDefinition } from "@/lib/city-registry";
import { clearSelection, selectCountry, subscribe, unsubscribe } from "@/lib/country-selection-engine";
import type { ActiveCountry } from "@/lib/country-selection-engine";
import { getCountryFocusDefinition, OPERATIONAL_SELECTABLE_REGIONS } from "@/lib/country-focus-registry";
import type { FocusPoint, CameraTarget } from "@/lib/country-focus-registry";
import {
  MAP_GRID_VISIBLE,
  MAP_OCEAN_CENTRE,
  MAP_OCEAN_EDGE,
  MAP_ACCENT_RGB,
  MAP_FOCUS_BORDER_VISIBLE,
  MAP_FOCUS_BORDER_WIDTH,
  MAP_FOCUS_BORDER_RGB,
  MAP_FOCUS_FILL_VISIBLE,
  MAP_FOCUS_FILL_GRADIENT_STOPS,
  MAP_BORDER_FULL_DETAIL_MAX_POINTS,
} from "@/lib/map-aesthetics";
import { api } from "@/lib/api";
import type {
  CountryIntelligence,
  CountryRiskLevel,
  HealthRating,
  User,
  Task,
  TaskStatus,
  Plan,
  VenueRiskAssessment,
  TaskRoute,
  Venue,
  Alert,
  AlertPriority,
  WeatherFinding,
  TrafficCondition,
  TimesheetEntry,
} from "@/lib/api";
import { LocationSearch, resolveCurrentLocation } from "@/components/location-search";
import type { LocationSearchResult } from "@/components/location-search";
import { projectToOperationalGeometry } from "@/lib/map-projection";
import { timeAgo } from "@/lib/display-utils";

// Background tone for the outer page wrapper (behind MapLayer).
const OCEAN_COLOR = "#00081a";

type Step = "login" | "preparing" | "brief" | "centre";

// Single source of truth for the day's Operational Brief. Read by both
// the mandatory pre-entry Brief screen (step === "brief", below) and the
// in-Operations-Centre Brief panel (OperationalCanvas) so the two always
// show the same content - the panel recalls the brief on demand, it does
// not replace the mandatory gate (Product Constitution: "Every operator
// begins with an Operational Brief before entering the Operations Centre").
const OPERATIONAL_BRIEF = {
  area: "Cape Town",
  areaRadius: "Operational radius: 5 km",
  condition: "Elevated",
  conditionNote: "Additional awareness recommended.",
  updated: "5 min ago",
  updatedNote: "8 intelligence sources reviewed.",
  summary:
    "Current operating conditions remain suitable for planned activities. Increased traffic, forecast weather, and recent local activity suggest additional planning before deployment.",
  advisories: ["Traffic congestion expected", "Weather may affect movement", "Public activity under review"],
};

type AlertSeverity = "critical" | "warning" | "info";

interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  location: string;
  timestamp: string;
  // Set only for alerts backed by a real Alert record (api.alerts) -
  // lets dismiss/mark-reviewed persist to the backend for those, while
  // demo/instruction entries (no backend row) fall back to local-only
  // state (see locallyDismissedAlertIds/locallyReviewedAlertIds).
  realAlertId?: number;
  reviewed?: boolean;
}

// Mock feed for the Alerts panel (OperationalCanvas) - distinct from the
// daily Operational Brief: alerts are individual, timestamped events
// rather than a single standing summary.
const OPERATIONAL_ALERTS: OperationalAlert[] = [
  {
    id: "alert-4",
    severity: "info",
    title: "Intelligence source refreshed",
    description: "Local activity feeds have been updated with the latest reporting.",
    location: "Cape Town",
    timestamp: "2 hr ago",
  },
];

const ALERT_SEVERITY_ICON: Record<AlertSeverity, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};

// Country Intelligence panel (OperationalCanvas) - the Risk Rating badge
// and Public Health badge are real, live data now (Country Intelligence
// Engine: US State Dept travel advisory; CDC health notices, separate)
// - see api.countries.intelligence() and
// artifacts/api-server/src/routes/country-intelligence.ts. Display
// labels for the Risk Rating, per direct product direction.
const COUNTRY_RISK_LABELS: Record<CountryRiskLevel, string> = {
  unrated: "Unrated",
  low: "Low",
  elevated: "Elevated",
  critical: "Critical",
  do_not_travel: "Do Not Travel",
};

const HEALTH_RATING_LABELS: Record<HealthRating, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_completed: "Not Completed",
  in_progress: "In Progress",
  completed: "Completed",
};

// Profile's sub-navigation titles (excludes "root", which uses its own
// "Your account." header instead of a nav item name).
const PROFILE_VIEW_TITLES: Record<"overview" | "account" | "expenses" | "timesheet", string> = {
  overview: "Overview",
  account: "Account Details",
  expenses: "Expenses",
  timesheet: "Timesheet",
};

// Mirrors artifacts/api-server/src/lib/plan-checklist.ts (PLAN_CHECKLIST_ITEMS)
// - only needed here to build MOCK_TASK's local-only demo checklist, since
// this frontend package can't import a backend module directly. The real
// checklist for any real task always comes from the API, never this list.
const MOCK_CHECKLIST_ITEMS = [
  { key: "vehicle_inspection_completed", label: "Vehicle inspection completed" },
  { key: "primary_route_confirmed", label: "Primary route confirmed" },
  { key: "alternative_route_confirmed", label: "Alternative route confirmed" },
  { key: "operational_route_mapped", label: "Operational Route mapped" },
  { key: "closest_hospitals_identified", label: "Closest hospitals identified" },
  { key: "closest_police_stations_identified", label: "Closest police stations identified" },
  { key: "fuel_points_identified", label: "Fuel / refuelling points identified" },
  { key: "communications_checked", label: "Communications checked" },
  { key: "personnel_confirmed", label: "Personnel / team confirmed" },
  { key: "equipment_requirements_checked", label: "Equipment requirements checked" },
  { key: "operating_conditions_reviewed", label: "Current Operating Conditions reviewed" },
  { key: "area_advisories_reviewed", label: "Area Advisories reviewed" },
  { key: "venue_assessment_reviewed", label: "Destination / venue assessment reviewed" },
  { key: "contingency_arrangements_confirmed", label: "Emergency / contingency arrangements confirmed" },
  { key: "final_briefing_completed", label: "Final operational briefing completed" },
];

export default function Dashboard() {
  const [step, setStep] = useState<Step>("login");

  // Current Area and Operating Conditions start as the demo defaults and
  // can be overridden with the operator's real position/weather -
  // shared between the mandatory pre-entry Brief screen and the
  // in-canvas Brief panel (passed down to OperationalCanvas), same
  // "single source of truth" as OPERATIONAL_BRIEF itself. The summary
  // and advisories stay the demo content for now.
  const [briefArea, setBriefArea] = useState({ area: OPERATIONAL_BRIEF.area, areaRadius: OPERATIONAL_BRIEF.areaRadius });
  const [briefCondition, setBriefCondition] = useState({
    condition: OPERATIONAL_BRIEF.condition,
    conditionNote: OPERATIONAL_BRIEF.conditionNote,
  });
  const [briefTraffic, setBriefTraffic] = useState({
    traffic: "Not checked yet",
    trafficNote: "Use your current location to check traffic.",
  });
  const [locatingBrief, setLocatingBrief] = useState(false);
  // The raw weather finding behind briefCondition.conditionNote above -
  // briefCondition only keeps display strings, but the Alerts panel's
  // "Severe weather advisory issued" entry needs the real severity too
  // (and needs to not exist at all when there's nothing notable, per
  // direct product direction - see weatherAlert in OperationalCanvas).
  const [weatherFinding, setWeatherFinding] = useState<WeatherFinding | null>(null);
  // Same reasoning as weatherFinding above, for "Road closure near
  // venue" - briefTraffic only keeps display strings, the Alerts panel
  // needs the raw severity to know whether there's an actual closure
  // (see roadClosureAlert in OperationalCanvas).
  const [trafficCondition, setTrafficCondition] = useState<TrafficCondition | null>(null);

  async function useMyLocationForBrief() {
    setLocatingBrief(true);
    try {
      const result = await resolveCurrentLocation();
      setBriefArea({
        area: result.name ?? result.city ?? result.label,
        areaRadius: "Based on your current location",
      });

      if (result.lat != null && result.lng != null) {
        try {
          const { temperatureC, conditions, finding } = await api.weather.check(result.lat, result.lng);
          const tempLabel = temperatureC != null ? `${Math.round(temperatureC)}°C` : null;
          setBriefCondition({
            condition: [tempLabel, conditions].filter(Boolean).join(" · ") || "Unknown",
            conditionNote: finding ? finding.summary : "No elevated weather risk detected at your location.",
          });
          setWeatherFinding(finding);
        } catch (err) {
          console.error("Failed to check weather for the Brief:", err);
        }

        try {
          const { condition } = await api.traffic.check(result.lat, result.lng);
          setBriefTraffic(
            condition
              ? {
                  traffic: condition.label,
                  trafficNote:
                    condition.currentSpeedKph != null && condition.freeFlowSpeedKph != null
                      ? `${Math.round(condition.currentSpeedKph)} km/h (normally ${Math.round(condition.freeFlowSpeedKph)} km/h)`
                      : "No speed data for this road segment.",
                }
              : { traffic: "No traffic data", trafficNote: "No road segment data available for this location." },
          );
          setTrafficCondition(condition);
        } catch (err) {
          console.error("Failed to check traffic for the Brief:", err);
          setBriefTraffic({ traffic: "Traffic unavailable", trafficNote: "Couldn't reach the traffic service." });
        }
      }
    } catch (err) {
      console.error("Failed to get current location for the Brief:", err);
    } finally {
      setLocatingBrief(false);
    }
  }

  // Captures location + weather automatically the moment the Brief
  // screen is reached, rather than waiting on the CPO to press the
  // button - the sign-in click just before this is itself the user
  // gesture, so the browser's permission prompt still appears in a
  // reasonable context. The button stays too, for retrying (e.g. after
  // initially denying, or after actually moving somewhere else).
  useEffect(() => {
    if (step === "brief") {
      useMyLocationForBrief();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function signIn() {
    setStep("preparing");
    setTimeout(() => setStep("brief"), 1400);
  }

  if (step === "login") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-slate-950 text-white rounded-3xl overflow-hidden">
        <div className="w-full max-w-md p-8">
          <p className="text-sm text-sky-300 mb-2">VenueGuard</p>
          <h1 className="text-4xl font-semibold tracking-tight mb-2">Planning powered by Intelligence.</h1>
          <p className="text-slate-400 mb-8">Sign in to prepare your operational brief.</p>

          <div className="space-y-4">
            <input className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 outline-none" placeholder="Email" />
            <input className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 outline-none" placeholder="Password" type="password" />
            <button onClick={signIn} className="w-full rounded-xl bg-sky-400 text-slate-950 font-semibold py-3">
              Sign In
            </button>
            <button className="w-full text-sm text-slate-400 hover:text-white">Forgot Password</button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "preparing") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-slate-950 text-white rounded-3xl">
        <div className="text-center">
          <p className="text-sky-300 mb-3">Welcome back, Frik.</p>
          <h1 className="text-3xl font-semibold">Preparing your operational brief...</h1>
          <div className="mx-auto mt-8 h-2 w-48 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-sky-400 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (step === "brief") {
    return (
      <div className="min-h-[80vh] bg-slate-950 text-white rounded-3xl p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <p className="text-sky-300 text-sm">Today&apos;s Operational Brief</p>
            <h1 className="text-4xl font-semibold mt-2">Here&apos;s what&apos;s happening around you.</h1>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <MapPin className="w-5 h-5 text-sky-300 mb-4" />
              <p className="text-sm text-slate-400">Current Area</p>
              <p className="text-xl font-semibold">{briefArea.area}</p>
              <p className="text-sm text-slate-400 mt-1">{briefArea.areaRadius}</p>
              <button
                type="button"
                onClick={useMyLocationForBrief}
                disabled={locatingBrief}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 disabled:opacity-60"
              >
                {locatingBrief ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
                Use my current location
              </button>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <ShieldCheck className="w-5 h-5 text-amber-300 mb-4" />
              <p className="text-sm text-slate-400">Current Operating Conditions</p>
              <p className="text-xl font-semibold">{briefCondition.condition}</p>
              <p className="text-sm text-slate-400 mt-1">{briefCondition.conditionNote}</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <Car className="w-5 h-5 text-amber-300 mb-4" />
              <p className="text-sm text-slate-400">Traffic</p>
              <p className="text-xl font-semibold">{briefTraffic.traffic}</p>
              <p className="text-sm text-slate-400 mt-1">{briefTraffic.trafficNote}</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <Clock className="w-5 h-5 text-sky-300 mb-4" />
              <p className="text-sm text-slate-400">Updated</p>
              <p className="text-xl font-semibold">{OPERATIONAL_BRIEF.updated}</p>
              <p className="text-sm text-slate-400 mt-1">{OPERATIONAL_BRIEF.updatedNote}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/10 p-6">
            <h2 className="text-xl font-semibold mb-3">Operations Summary</h2>
            <p className="text-slate-300 leading-7">{OPERATIONAL_BRIEF.summary}</p>
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/10 p-6">
            <h2 className="text-xl font-semibold mb-4">Area Advisories</h2>
            <div className="grid md:grid-cols-3 gap-3">
              {OPERATIONAL_BRIEF.advisories.map((item) => (
                <div key={item} className="rounded-xl bg-slate-900/70 border border-white/10 p-4 text-sm text-slate-300">
                  <AlertCircle className="w-4 h-4 text-amber-300 mb-2" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => setStep("centre")} className="rounded-xl bg-sky-400 text-slate-950 font-semibold px-6 py-3 flex items-center gap-2">
            Continue to Operations Centre <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden text-white flex flex-col" style={{ backgroundColor: OCEAN_COLOR }}>
      <TopBanner onSignOut={() => setStep("login")} />
      <div className="flex-1 min-h-0 relative">
        <OperationalCanvas
          briefArea={briefArea}
          briefCondition={briefCondition}
          briefTraffic={briefTraffic}
          weatherFinding={weatherFinding}
          trafficCondition={trafficCondition}
          onUseMyLocationForBrief={useMyLocationForBrief}
          locatingBrief={locatingBrief}
        />
      </div>
    </div>
  );
}

const SEARCH_RESULT_LIMIT = 8;

// The top banner's main search used to be a fixed local list (countries
// + the City Registry, capped by its source at 7,342 places worldwide -
// see the note above CITY_REGISTRY's use below for Major Cities). It's
// now live address search (LocationSearch, Photon/OpenStreetMap-backed)
// - selecting a result matches its country by ISO 3166-1 alpha-2 code
// and runs it through the same Country Selection Engine a map click
// does (see handleTopBannerSearchSelect in TopBanner).

// Persistent top bar for the Operations Centre - branding on the left,
// operator identity + sign-out on the right. Takes up permanent screen
// space (the canvas sits below it, not underneath it) rather than
// floating over the map like the panel triggers, per direct product
// direction.
// Dispatched by the VenueGuard brand menu (TopBanner) and picked up by
// OperationalCanvas - the two components are siblings under Dashboard,
// not parent/child, and the Brief/Layers panel state already lives
// deep inside OperationalCanvas's own click-outside-to-close logic.
// Reusing the same cross-component pattern layout.tsx already uses
// (venueguard-show-shell) instead of lifting that state up and prop-
// drilling it through both components.
const OPEN_BRIEF_PANEL_EVENT = "venueguard-open-brief-panel";
const OPEN_COMMUNICATIONS_PANEL_EVENT = "venueguard-open-communications-panel";
const OPEN_TASKS_PANEL_EVENT = "venueguard-open-tasks-panel";
const OPEN_TASK_PLANNING_PANEL_EVENT = "venueguard-open-task-planning-panel";
const OPEN_RISK_ASSESSMENTS_PANEL_EVENT = "venueguard-open-risk-assessments-panel";
const OPEN_ROUTE_PLANNING_PANEL_EVENT = "venueguard-open-route-planning-panel";
const OPEN_DOWNLOAD_TASK_PANEL_EVENT = "venueguard-open-download-task-panel";
const OPEN_LAYERS_PANEL_EVENT = "venueguard-open-layers-panel";
// Dispatched by the operator menu (TopBanner, top-right - separate
// from the VenueGuard brand menu on the left) when "Profile" is
// clicked. Kept in the same activePanel state as the six brand-menu
// panels above (not its own boolean) so it automatically gets the
// same mutual-exclusivity and click-outside-to-close behavior for
// free, even though it's opened from a different menu and docks on
// the opposite edge.
const OPEN_PROFILE_PANEL_EVENT = "venueguard-open-profile-panel";
// Dispatched by each panel's "Back to Menu" button (OperationalCanvas)
// and picked up by TopBanner, for the same cross-sibling reason as the
// OPEN_*_PANEL_EVENT constants above - reopens the brand dropdown after
// the panel that triggered it closes itself.
const REOPEN_BRAND_MENU_EVENT = "venueguard-reopen-brand-menu";
// Same idea as REOPEN_BRAND_MENU_EVENT, but for Profile's "Back to
// Menu" button - Profile is opened from the operator menu (top-right),
// not the brand menu, so it needs to reopen that dropdown instead.
const REOPEN_OPERATOR_MENU_EVENT = "venueguard-reopen-operator-menu";
// Dispatched by TopBanner whenever a click lands outside the brand
// menu/dropdown (e.g. the search bar, the operator area, blank space
// in the banner) and picked up by OperationalCanvas, the same
// cross-sibling reason as the events above - lets clicking anywhere in
// the top banner close an open VenueGuard panel, matching what
// clicking the canvas itself already does (see handleCanvasClick).
const CLOSE_VENUEGUARD_PANELS_EVENT = "venueguard-close-panels";
// The Alerts trigger now lives in the persistent top banner (left of
// the operator/Profile area) instead of floating over the canvas, but
// its state (alertsPanelOpen) and the alert list itself
// (combinedAlerts, built from data local to OperationalCanvas) still
// live there - same cross-sibling split as the panel events above,
// just in both directions: TOGGLE_ALERTS_PANEL_EVENT (TopBanner ->
// OperationalCanvas) opens/closes it, ALERTS_COUNT_EVENT
// (OperationalCanvas -> TopBanner, a CustomEvent<number>) keeps the
// badge on the button in sync without lifting the whole alerts feed
// up to Dashboard.
const TOGGLE_ALERTS_PANEL_EVENT = "venueguard-toggle-alerts-panel";
const ALERTS_COUNT_EVENT = "venueguard-alerts-count";

// Venue Risk Assessment - the CPO's in-field checklist for a specific
// (task, venue) pair, reached from Risk Assessments > Venues > a venue.
// Every field below is just a label with a comment box next to it that
// the CPO writes into directly (per direct product direction) - no
// nested sub-lists. The editable fields are kept separate from
// VenueRiskAssessment (the API type) since Date/Time/Operator/Timezone
// and Assessment Status/Operational Plan are all derived/read-only,
// not part of the saved form payload. Location, unlike those, is typed
// in by the operator rather than derived from the venue record.
type AssessmentFormState = {
  location: string;
  currentOperatingConditions: string;
  areaAdvisories: string;
  checkpoints: string;
  observedHazards: string;
  existingControls: string;
  recommendedActions: string;
  operatorNotes: string;
  attachments: string;
};

const ASSESSMENT_TEXT_FIELDS: { key: keyof AssessmentFormState; label: string }[] = [
  { key: "location", label: "Location / Venue" },
  { key: "currentOperatingConditions", label: "Current Operating Conditions" },
  { key: "areaAdvisories", label: "Area Advisories" },
  { key: "checkpoints", label: "Assessment Questions / Checkpoints" },
  { key: "observedHazards", label: "Observed Hazards / Concerns" },
  { key: "existingControls", label: "Existing Controls" },
  { key: "recommendedActions", label: "Recommended Actions" },
  { key: "operatorNotes", label: "Operator Notes" },
  { key: "attachments", label: "Photos / Video / Attachments" },
];

function VenueRiskAssessmentForm({
  task,
  assessment,
  form,
  loading,
  error,
  actionError,
  saving,
  submitting,
  onBack,
  onFieldChange,
  onSave,
  onSubmit,
}: {
  task: Task | null;
  assessment: VenueRiskAssessment | null;
  form: AssessmentFormState | null;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  saving: boolean;
  submitting: boolean;
  onBack: () => void;
  onFieldChange: <K extends keyof AssessmentFormState>(key: K, value: AssessmentFormState[K]) => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <button type="button" className="venueguard-panel-back" onClick={onBack}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Venues
      </button>

      {loading ? (
        <p className="tasks-panel-empty">Loading…</p>
      ) : error || !form || !assessment ? (
        <p className="tasks-panel-empty">{error ?? "Couldn't load this risk assessment."}</p>
      ) : (
        <div className="venue-assessment-form">
          <div className="venue-assessment-meta">
            <div className="venue-assessment-meta-row">
              <span className="venue-assessment-meta-label">Date</span>
              <span className="venue-assessment-meta-value">{new Date(assessment.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="venue-assessment-meta-row">
              <span className="venue-assessment-meta-label">Time</span>
              <span className="venue-assessment-meta-value">{new Date(assessment.createdAt).toLocaleTimeString()}</span>
            </div>
            <div className="venue-assessment-meta-row">
              <span className="venue-assessment-meta-label">Operator</span>
              <span className="venue-assessment-meta-value">{assessment.operatorName ?? "Unknown"}</span>
            </div>
            <div className="venue-assessment-meta-row">
              <span className="venue-assessment-meta-label">Timezone</span>
              <span className="venue-assessment-meta-value">{assessment.timezone ?? "Unknown"}</span>
            </div>
          </div>

          {ASSESSMENT_TEXT_FIELDS.map(({ key, label }) =>
            key === "location" ? (
              <label key={key} className="venue-assessment-field">
                <span>{label}</span>
                <LocationSearch
                  value={form[key]}
                  onChange={(value) => onFieldChange(key, value)}
                  className="venue-assessment-field-input"
                  placeholder="Search for an address or place…"
                />
              </label>
            ) : (
              <label key={key} className="venue-assessment-field">
                <span>{label}</span>
                <textarea value={form[key]} onChange={(event) => onFieldChange(key, event.target.value)} rows={3} />
              </label>
            ),
          )}

          <div className="venue-assessment-meta">
            <div className="venue-assessment-meta-row">
              <span className="venue-assessment-meta-label">Assessment Status</span>
              <span className={`venue-assessment-status venue-assessment-status-${assessment.status}`}>
                {assessment.status === "submitted" ? "Submitted" : "Draft"}
              </span>
            </div>
            <div className="venue-assessment-meta-row">
              <span className="venue-assessment-meta-label">Operational Plan?</span>
              <span className="venue-assessment-meta-value">
                {task?.planSubmittedAt ? `Submitted ${new Date(task.planSubmittedAt).toLocaleString()}` : "Not submitted yet"}
              </span>
            </div>
          </div>

          <div className="task-plan-submit">
            {actionError && <p className="venue-assessment-action-error">{actionError}</p>}
            <button type="button" className="venue-assessment-save-btn" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="button"
              className="task-plan-submit-btn"
              onClick={onSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : assessment.status === "submitted" ? "Re-submit to Manager" : "Submit to Manager"}
            </button>
            {assessment.submittedAt && (
              <p className="task-plan-submit-status">Submitted {new Date(assessment.submittedAt).toLocaleString()}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function formatRouteDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatRouteDistance(meters: number | null): string {
  if (meters == null) return "—";
  return `${(meters / 1000).toFixed(1)} km`;
}

// Turns a real Venue record into the same shape a location search
// result takes, so picking a venue from the dropdown below can reuse
// the exact onUpdatePoint path a search/current-location pick already
// uses - no separate "venue-backed point" concept needed.
function venueToLocationResult(venue: Venue): LocationSearchResult {
  return {
    label: venue.name,
    name: venue.name,
    lat: venue.lat,
    lng: venue.lng,
    street: null,
    housenumber: null,
    city: venue.city ?? null,
    district: venue.district ?? null,
    state: null,
    country: venue.country ?? null,
    countrycode: null,
    postcode: null,
  };
}

// One Route Planning slot - Start/End picked either via the location
// engine (search or "use my current location", both built into
// LocationSearch itself) or via a real Venue record, plus an explicit
// "Calculate Route" action kept separate from selecting the points so
// the metered TomTom traffic call only fires when the CPO actually
// asks for it. Local startInput/endInput mirror what's typed/selected
// so the field responds immediately, while onUpdatePoint persists the
// pick (parent owns the source of truth).
function TaskRouteSlotCard({
  route,
  index,
  venues,
  taskVenueId,
  onUpdatePoint,
  onCalculate,
  calculating,
  calcError,
}: {
  route: TaskRoute;
  index: number;
  venues: Venue[];
  taskVenueId: number | null;
  onUpdatePoint: (route: TaskRoute, point: "start" | "end", result: LocationSearchResult) => void;
  onCalculate: (route: TaskRoute) => void;
  calculating: boolean;
  calcError: string | null;
}) {
  const [startInput, setStartInput] = useState(route.startLabel);
  const [endInput, setEndInput] = useState(route.endLabel);
  const canCalculate = route.startLat != null && route.startLng != null && route.endLat != null && route.endLng != null;
  const hasResults = route.distanceMeters != null;

  // Only venues with coordinates are usable as a route point; the
  // task's own venue (if it has one) is listed first as the likely pick.
  const venueOptions = useMemo(() => {
    const withCoords = venues.filter((v) => v.lat != null && v.lng != null);
    if (taskVenueId == null) return withCoords;
    return [...withCoords].sort((a, b) => (a.id === taskVenueId ? -1 : b.id === taskVenueId ? 1 : 0));
  }, [venues, taskVenueId]);

  function selectVenueFor(point: "start" | "end", event: ChangeEvent<HTMLSelectElement>) {
    const id = Number(event.target.value);
    event.target.value = "";
    if (!id) return;
    const venue = venueOptions.find((v) => v.id === id);
    if (!venue) return;
    const result = venueToLocationResult(venue);
    if (point === "start") setStartInput(result.label);
    else setEndInput(result.label);
    onUpdatePoint(route, point, result);
  }

  return (
    <div className="route-slot-card">
      <p className="route-slot-title">Route {index + 1}</p>

      <label className="venue-assessment-field">
        <span>Start</span>
        <LocationSearch
          value={startInput}
          onChange={setStartInput}
          onSelect={(result) => {
            setStartInput(result.label);
            onUpdatePoint(route, "start", result);
          }}
          className="venue-assessment-field-input"
          placeholder="Search for a start point…"
        />
        {venueOptions.length > 0 && (
          <select className="route-slot-venue-select" value="" onChange={(event) => selectVenueFor("start", event)}>
            <option value="">Or select a venue…</option>
            {venueOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="venue-assessment-field">
        <span>End</span>
        <LocationSearch
          value={endInput}
          onChange={setEndInput}
          onSelect={(result) => {
            setEndInput(result.label);
            onUpdatePoint(route, "end", result);
          }}
          className="venue-assessment-field-input"
          placeholder="Search for a destination…"
        />
        {venueOptions.length > 0 && (
          <select className="route-slot-venue-select" value="" onChange={(event) => selectVenueFor("end", event)}>
            <option value="">Or select a venue…</option>
            {venueOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </label>

      <button
        type="button"
        className="venue-assessment-save-btn"
        onClick={() => onCalculate(route)}
        disabled={!canCalculate || calculating}
      >
        {calculating ? "Calculating…" : "Calculate Route"}
      </button>
      {calcError && <p className="venue-assessment-action-error">{calcError}</p>}

      {hasResults && (
        <div className="venue-assessment-meta">
          <div className="venue-assessment-meta-row">
            <span className="venue-assessment-meta-label">Distance</span>
            <span className="venue-assessment-meta-value">{formatRouteDistance(route.distanceMeters)}</span>
          </div>
          <div className="venue-assessment-meta-row">
            <span className="venue-assessment-meta-label">Static Duration</span>
            <span className="venue-assessment-meta-value">{formatRouteDuration(route.staticTravelTimeSeconds)}</span>
          </div>
          {route.liveTravelTimeSeconds != null && (
            <>
              <div className="venue-assessment-meta-row">
                <span className="venue-assessment-meta-label">Live ETA (traffic)</span>
                <span className="venue-assessment-meta-value">{formatRouteDuration(route.liveTravelTimeSeconds)}</span>
              </div>
              <div className="venue-assessment-meta-row">
                <span className="venue-assessment-meta-label">Traffic Delay</span>
                <span className="venue-assessment-meta-value">
                  {route.trafficDelaySeconds ? `+${formatRouteDuration(route.trafficDelaySeconds)}` : "None"}
                </span>
              </div>
            </>
          )}
          {route.trafficCheckedAt && (
            <div className="venue-assessment-meta-row">
              <span className="venue-assessment-meta-label">Traffic Checked</span>
              <span className="venue-assessment-meta-value">{timeAgo(route.trafficCheckedAt)}</span>
            </div>
          )}
        </div>
      )}

      {hasResults && (route.nearestHospitals.length > 0 || route.nearestPoliceStations.length > 0) && (
        <div className="route-slot-nearby">
          {route.nearestHospitals.length > 0 && (
            <div className="route-slot-nearby-group">
              <p className="route-slot-nearby-label">Nearest Hospitals</p>
              {route.nearestHospitals.map((hospital, i) => (
                <div key={i} className="route-slot-nearby-item">
                  <span>{hospital.name}</span>
                  <span className="route-slot-nearby-distance">{formatRouteDistance(hospital.distanceMeters)}</span>
                </div>
              ))}
            </div>
          )}
          {route.nearestPoliceStations.length > 0 && (
            <div className="route-slot-nearby-group">
              <p className="route-slot-nearby-label">Nearest Police Stations</p>
              {route.nearestPoliceStations.map((station, i) => (
                <div key={i} className="route-slot-nearby-item">
                  <span>{station.name}</span>
                  <span className="route-slot-nearby-distance">{formatRouteDistance(station.distanceMeters)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One calendar cell per day of the month, padded to full weeks with
// nulls so the grid always starts on the correct weekday.
function buildCalendarWeeks(month: Date): (Date | null)[][] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, monthIndex, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TIMESHEET_WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Profile > Timesheet - a hand-rolled month-grid calendar rather than
// the shadcn Calendar component elsewhere in this app (components/ui/
// calendar.tsx), which is styled for the light Tailwind/shadcn admin
// pages, not this panel's dark, hand-styled VenueGuard theme. Clicking
// a day opens the log-hours form below the grid for that date; days
// that already have an entry show the hours logged right on the cell.
function TimesheetCalendar({
  entries,
  loading,
  month,
  onChangeMonth,
  selectedDate,
  onSelectDate,
  hoursInput,
  notesInput,
  onHoursChange,
  onNotesChange,
  onSave,
  onDelete,
  saving,
  deleting,
  noOperator,
}: {
  entries: TimesheetEntry[];
  loading: boolean;
  month: Date;
  onChangeMonth: (month: Date) => void;
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  hoursInput: string;
  notesInput: string;
  onHoursChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
  noOperator: boolean;
}) {
  const entryMap = useMemo(() => {
    const map: Record<string, TimesheetEntry> = {};
    for (const entry of entries) map[entry.date] = entry;
    return map;
  }, [entries]);
  const weeks = useMemo(() => buildCalendarWeeks(month), [month]);

  if (noOperator) {
    return <p className="tasks-panel-empty">No profile user found yet - add a user named &quot;Frik&quot; (or an Admin) from Admin &gt; Users.</p>;
  }

  const todayKey = formatDateKey(new Date());
  const selectedEntry = selectedDate ? entryMap[selectedDate] : undefined;

  return (
    <div className="timesheet-calendar">
      <div className="timesheet-calendar-nav">
        <button
          type="button"
          className="timesheet-calendar-nav-btn"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="timesheet-calendar-month">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          className="timesheet-calendar-nav-btn"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <p className="tasks-panel-empty">Loading…</p>
      ) : (
        <>
          <div className="timesheet-calendar-weekdays">
            {TIMESHEET_WEEKDAY_LABELS.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          <div className="timesheet-calendar-grid">
            {weeks.map((week, weekIndex) =>
              week.map((day, dayIndex) => {
                if (!day) {
                  return <span key={`${weekIndex}-${dayIndex}`} className="timesheet-calendar-cell timesheet-calendar-cell-empty" />;
                }
                const dateKey = formatDateKey(day);
                const entry = entryMap[dateKey];
                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={`timesheet-calendar-cell ${dateKey === todayKey ? "timesheet-calendar-cell-today" : ""} ${
                      dateKey === selectedDate ? "timesheet-calendar-cell-selected" : ""
                    } ${entry ? "timesheet-calendar-cell-logged" : ""}`}
                    onClick={() => onSelectDate(dateKey)}
                  >
                    <span className="timesheet-calendar-cell-day">{day.getDate()}</span>
                    {entry && <span className="timesheet-calendar-cell-hours">{entry.hoursWorked}h</span>}
                  </button>
                );
              }),
            )}
          </div>
        </>
      )}

      {selectedDate && (
        <div className="timesheet-entry-form">
          <p className="timesheet-entry-form-date">
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <label className="venue-assessment-field">
            <span>Hours Worked</span>
            <input
              type="number"
              min={0}
              max={24}
              step={0.25}
              value={hoursInput}
              onChange={(event) => onHoursChange(event.target.value)}
              className="venue-assessment-field-input"
              placeholder="e.g. 8"
            />
          </label>
          <label className="venue-assessment-field">
            <span>Notes</span>
            <input
              type="text"
              value={notesInput}
              onChange={(event) => onNotesChange(event.target.value)}
              className="venue-assessment-field-input"
              placeholder="Optional"
            />
          </label>
          <div className="timesheet-entry-form-actions">
            <button
              type="button"
              className="venue-assessment-save-btn"
              onClick={onSave}
              disabled={saving || hoursInput.trim() === ""}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {selectedEntry && (
              <button type="button" className="timesheet-entry-form-delete" onClick={onDelete} disabled={deleting}>
                {deleting ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TopBanner({ onSignOut }: { onSignOut: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  // Mirrors OperationalCanvas's combinedAlerts.length - see
  // ALERTS_COUNT_EVENT above for why this is a mirrored count rather
  // than the real list.
  const [alertsCount, setAlertsCount] = useState(0);

  useEffect(() => {
    const reopenMenu = () => setBrandMenuOpen(true);
    const reopenOperatorMenu = () => setOperatorMenuOpen(true);
    const updateAlertsCount = (event: Event) => setAlertsCount((event as CustomEvent<number>).detail);
    window.addEventListener(REOPEN_BRAND_MENU_EVENT, reopenMenu);
    window.addEventListener(REOPEN_OPERATOR_MENU_EVENT, reopenOperatorMenu);
    window.addEventListener(ALERTS_COUNT_EVENT, updateAlertsCount);
    return () => {
      window.removeEventListener(REOPEN_BRAND_MENU_EVENT, reopenMenu);
      window.removeEventListener(REOPEN_OPERATOR_MENU_EVENT, reopenOperatorMenu);
      window.removeEventListener(ALERTS_COUNT_EVENT, updateAlertsCount);
    };
  }, []);

  // Matches a live search result back to a selectable country by ISO
  // 3166-1 alpha-2 code, then runs it through the same Country Selection
  // Engine a map click does - the address itself isn't pinned, only its
  // country gets selected (per direct product direction).
  function handleSearchSelect(result: LocationSearchResult) {
    const region = result.countrycode
      ? OPERATIONAL_SELECTABLE_REGIONS.find((r) => r.iso2 === result.countrycode)
      : undefined;
    if (region) {
      // Shows the searched place on the map the same way a curated
      // Major City does - guaranteed a spot even if it's nowhere near
      // that list (see highlightedCity/getMajorCitiesForDisplay above),
      // projected into the map's own coordinate space so it lands in
      // the right place regardless of which country it's in.
      const highlightedCity: CityDefinition | undefined =
        result.lat != null && result.lng != null
          ? {
              name: result.name ?? result.label,
              position: projectToOperationalGeometry(result.lng, result.lat),
              population: 0,
              capital: false,
            }
          : undefined;
      selectCountry(region, highlightedCity);
    }
    setSearchQuery("");
  }

  return (
    <header
      className="top-banner"
      onClick={() => window.dispatchEvent(new Event(CLOSE_VENUEGUARD_PANELS_EVENT))}
    >
      <div
        className="top-banner-brand"
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setBrandMenuOpen(false);
        }}
      >
        <button
          type="button"
          className="top-banner-brand-trigger"
          onClick={() => setBrandMenuOpen((open) => !open)}
          aria-expanded={brandMenuOpen}
        >
          <ShieldCheck className="w-5 h-5 text-sky-300" />
          <span className="top-banner-brand-name">VenueGuard</span>
          <span className="top-banner-brand-divider" aria-hidden="true" />
          <span className="top-banner-brand-context">Operations Centre</span>
          <ChevronDown className={`w-3.5 h-3.5 top-banner-brand-chevron ${brandMenuOpen ? "top-banner-brand-chevron-open" : ""}`} />
        </button>

        {brandMenuOpen && (
          <div className="top-banner-brand-menu">
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_BRIEF_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <ClipboardList className="w-4 h-4" />
              Operational Brief
            </button>
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_COMMUNICATIONS_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <MessageSquare className="w-4 h-4" />
              Communications
            </button>
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_TASKS_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <ListChecks className="w-4 h-4" />
              Tasks
            </button>
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_TASK_PLANNING_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <ClipboardCheck className="w-4 h-4" />
              Task Planning
            </button>
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_RISK_ASSESSMENTS_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <ShieldAlert className="w-4 h-4" />
              Risk Assessments
            </button>
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_ROUTE_PLANNING_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <Route className="w-4 h-4" />
              Route Planning
            </button>
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_DOWNLOAD_TASK_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <Download className="w-4 h-4" />
              Download Task
            </button>
            <button
              type="button"
              className="top-banner-brand-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_LAYERS_PANEL_EVENT));
                setBrandMenuOpen(false);
              }}
            >
              <Layers className="w-4 h-4" />
              Layers
            </button>
          </div>
        )}
      </div>
      <div className="top-banner-search-wrap">
        <div className="top-banner-search">
          <Search className="w-4 h-4 top-banner-search-icon" />
          <LocationSearch
            value={searchQuery}
            onChange={setSearchQuery}
            onSelect={handleSearchSelect}
            placeholder="Search for a place or address…"
            className="top-banner-search-input"
          />
        </div>
      </div>
      <button
        type="button"
        className="top-banner-alerts-trigger"
        onClick={(event) => {
          event.stopPropagation();
          window.dispatchEvent(new Event(TOGGLE_ALERTS_PANEL_EVENT));
        }}
      >
        <Bell className="w-4 h-4" />
        Alerts
        {alertsCount > 0 && <span className="top-banner-alerts-trigger-badge">{alertsCount}</span>}
      </button>
      <div
        className="top-banner-operator"
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setOperatorMenuOpen(false);
        }}
      >
        <button
          type="button"
          className="top-banner-operator-trigger"
          onClick={() => setOperatorMenuOpen((open) => !open)}
          aria-expanded={operatorMenuOpen}
        >
          <span className="top-banner-operator-avatar" aria-hidden="true">
            F
          </span>
          <span className="top-banner-operator-name">Frik</span>
          <ChevronDown
            className={`w-3.5 h-3.5 top-banner-operator-chevron ${operatorMenuOpen ? "top-banner-operator-chevron-open" : ""}`}
          />
        </button>

        {operatorMenuOpen && (
          <div className="top-banner-operator-menu">
            <button
              type="button"
              className="top-banner-operator-menu-item"
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_PROFILE_PANEL_EVENT));
                setOperatorMenuOpen(false);
              }}
            >
              <UserIcon className="w-4 h-4" />
              Profile
            </button>
            <button
              type="button"
              className="top-banner-operator-menu-item top-banner-operator-menu-item-danger"
              onClick={onSignOut}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// Operational Canvas Engine foundation - six-layer stack for future map
// intelligence features to plug into. Only base-map-layer renders visible
// content (the approved static map); layers 3-6 exist structurally but
// render nothing yet. operational-layers hosts the invisible Operational
// Country Selection Engine (Index 3.0, replacing the Index 1.6 hand-typed
// test zones) - hit zones over the real COUNTRY_REGISTRY geometry for all
// 235 countries, still no visual change.

// Operational Canvas Layer Registry (Index 1.8): the layer stack as data,
// not just DOM elements/CSS classes - a single source of truth for order
// and (eventually) visibility, instead of only existing implicitly in
// JSX. `visible` is metadata only for now - it does not gate rendering.
// A layer being "off" later means its content is hidden/empty, not that
// its canvas-layer div stops existing (that would break stacking order,
// masking, and future overlays that assume every layer is always mounted).
type OperationalCanvasLayer = {
  id: string;
  order: number;
  label: string;
  className: string;
  visible: boolean;
};

const CANVAS_LAYERS: OperationalCanvasLayer[] = [
  { id: "base-map", order: 1, label: "Base Map", className: "base-map-layer", visible: true },
  { id: "operational-layers", order: 2, label: "Operational Layers", className: "operational-layers", visible: true },
  { id: "operational-footprint", order: 3, label: "Operational Footprint", className: "operational-footprint-layer", visible: true },
  { id: "country-intelligence", order: 4, label: "Country Intelligence", className: "country-intelligence-layer", visible: true },
  { id: "breathing-markers", order: 5, label: "Breathing Markers", className: "breathing-markers-layer", visible: true },
  { id: "debug-layer-numbers", order: 6, label: "Debug Layer Numbers", className: "debug-layer-number-layer", visible: true },
].sort((a, b) => a.order - b.order);

// Operational Canvas Calibration Tool (Index 1.9) - dev-only, temporary.
// Lets country hit-zone paths be aligned exactly to the rendered PNG by
// reading live x/y coordinates (0-1000 / 0-500, matching the hit-zone
// viewBox) under the mouse, and logging the clicked point. No country or
// focus logic - purely a measurement aid. Off by default - its grid
// overlay is the one visible in production until now, separate from
// (and not previously wired to) MAP_GRID_VISIBLE.
const SHOW_CANVAS_CALIBRATION = false;

// Operational Geometry Alignment Engine (Index 2.2C). The runtime
// transform that keeps invisible COUNTRY_REGISTRY geometry locked to the
// approved base map (world-map-v17.png) at any viewport size, without
// ever touching the map itself - per the Product Constitution, geometry
// adapts to the map, never the reverse. The registry is pre-projected
// into the full square 1000x1000 source-image space (Index 2.2B, no
// crop baked in), and every SVG that renders it uses this exact
// viewBox/fit pair - "xMidYMid slice" is the SVG-native equivalent of
// the image's own `object-fit: cover; object-position: center center`,
// so both are scaled/cropped by the identical browser algorithm on
// every resize. No JS resize listener, no measured offsets, no drift.
const OPERATIONAL_GEOMETRY_VIEWBOX = "0 0 1000 1000";
const OPERATIONAL_GEOMETRY_FIT = "xMidYMid slice";

// Country Boundary Debug Mode (Index 2.1) - temporary. Draws every
// COUNTRY_REGISTRY boundary (thin gold outline, transparent fill) so
// alignment against the approved base map can be visually verified.
// Never affects production behaviour when false - the registry itself
// stays loaded either way (it's used for selection/masking, not just
// this debug view), only the outline rendering is gated. Default
// visibility owned by the Map Aesthetics Engine (map-aesthetics.ts) -
// the grid this produces across all 235 countries was never meant to
// ship visible by default - but the Operational Layers panel
// (gridVisible, in OperationalCanvas) now lets an operator switch it on
// for the current session without editing that file.

// Country Boundary QA Mode (Index 2.2) - a product verification tool, not
// a development feature: lets a reviewer step through COUNTRY_REGISTRY
// one country at a time to visually confirm each boundary against the
// approved base map. Separate from the Country Boundary Grid (Index 2.1,
// gridVisible in OperationalCanvas, which still draws every country at
// once) - this shows exactly one, so
// a single coastline can be inspected without every other country's
// outline cluttering the view. Registry data itself is never edited here
// - if a country looks wrong, that's recorded as a separate review item
// (see COUNTRY_ADJUSTMENTS below), never applied as a correction. Off by
// default - a reviewer switches it on deliberately, it was never meant
// to sit on top of the operational view by default.
const SHOW_COUNTRY_QA = false;

const QA_COUNTRIES = COUNTRY_REGISTRY;

// Operational Country Selection Click-Event Proof (Index 3.0A) - dev-only,
// temporary. Subscribes to the Country Selection Engine and renders a
// small fixed badge bottom-right on selection, purely to make the
// already-working click -> Active Country update visible without opening
// devtools. No border/fill/highlight is added to the country itself.
const SHOW_SELECTION_DEBUG = false;

// Country Focus Cutout Kill Switch (Index 3.8A, re-enabled Index 3.8
// rebuild) - was flipped off after the pre-rebuild cutout renderer
// produced disconnected ghost fragments and stray rectangular map-image
// pieces for multipart countries (USA, Canada, New Zealand, Indonesia).
// The Country Focus Registry rebuild (see country-focus-registry.ts -
// every country now scaled/translated to fit completely inside the
// fixed Operational Focus Block, rather than a per-ring heuristic)
// replaces that renderer's data, so the cutout is back on. Kept as a
// flag rather than removed - a fast, render-level way to fully disable
// the cutout (and its dim/blur background) again without touching the
// registry or Country Selection, if a future regression needs it.
const SHOW_COUNTRY_FOCUS_CUTOUT = true;

// Major cities (Index 5.1) - the first piece of the World -> Country ->
// Capital -> City navigation locked in PROJECT_CONTEXT.md, one step
// ahead of an actual Capital-level zoom: just showing every focused
// country's major cities (name + a small dot, from city-registry.ts) by
// name, per direct product direction. Deliberately reference data only -
// no glow, no animation, no click behaviour yet - kept visually quiet so
// a later, operationally-meaningful presence/office layer (discussed
// directly, not yet built) reads as the more prominent one once it
// exists, rather than competing with plain geography for attention.
// Default-on, but toggleable per session via the Operational Layers
// panel (majorCitiesVisible, in OperationalCanvas).
const MAJOR_CITY_DOT_RADIUS = 2.2;
const MAJOR_CITY_LABEL_OFFSET = 4.5;
const MAJOR_CITY_LABEL_MIN_SEPARATION_PX = 46;
const MAJOR_CITY_DISPLAY_CAP = 6;

// city-registry.ts (CITY_REGISTRY) now holds every place matching a known
// country - no per-country cap - so the in-panel country city search
// (countryCitySearchResults, below) can find real towns and smaller
// cities, not just each country's handful of largest. The map's own
// Major Cities layer must NOT follow that expansion: it stays a small, curated
// placeholder set (capitals + largest others, capped here) exactly as it
// looked before the database grew, per direct product direction - later,
// only cities with a real "operational selection" (the presence/office
// layer discussed but not yet built) will show on the map itself. This
// is the one place that distinction is drawn: CITY_REGISTRY is the full
// searchable database, this function's output is what the map displays.
//
// `highlightedCity` (ActiveCountry.highlightedCity, set only when the
// current selection came from searching a city/town, not a plain map
// click) is guaranteed a spot even if it wouldn't otherwise make the cap
// - per direct product direction, searching a town should show it on the
// map "like the current major cities are shown," not just select its
// country silently.
function getMajorCitiesForDisplay(cities: CityDefinition[], highlightedCity?: CityDefinition): CityDefinition[] {
  const capitals = cities.filter((city) => city.capital);
  const rest = [...cities].filter((city) => !city.capital).sort((a, b) => b.population - a.population);
  const curated = [...capitals, ...rest].slice(0, MAJOR_CITY_DISPLAY_CAP);
  if (highlightedCity && !curated.some((city) => isSameCity(city, highlightedCity))) {
    return [highlightedCity, ...curated];
  }
  return curated;
}

function isSameCity(a: CityDefinition, b: CityDefinition): boolean {
  return a.name === b.name && a.position[0] === b.position[0] && a.position[1] === b.position[1];
}

// Prevents city labels from overlapping each other, reported directly
// ("some of the cities names are written over each other"). A real risk
// specifically because each label is deliberately a constant size on
// screen (see the inverse-scale transform below) while city positions
// still scale with the country's own zoom - two real, geographically
// close cities (e.g. Lagos/Abuja-scale spacing, inside a huge country
// barely zoomed in to fit the Operational Focus Block) can still land
// close enough on screen to collide. Greedy placement in priority order
// (capital first, then population): a city only renders if it lands
// farther than the minimum separation from every already-placed city at
// the CURRENT zoom - reusing the exact units-to-pixels conversion the
// Calibration Tool's own getVisibleCanvasRange already established
// (Math.max(viewportWidth, viewportHeight) / 1000), not inventing a
// second one. Skipped cities are dropped entirely (dot and label both) -
// a lone dot with no name would read as a bug, not a feature.
//
// `highlightedCity`, when given, is placed first regardless of capital/
// population - since it's always evaluated against an empty `accepted`
// array, it's never rejected by the collision check, guaranteeing a
// searched-for town actually shows up rather than being silently dropped
// because a bigger, closer curated city got there first.
function selectNonOverlappingCities(
  cities: CityDefinition[],
  focusScale: number,
  highlightedCity?: CityDefinition,
): CityDefinition[] {
  const pxPerUnit = (Math.max(window.innerWidth, window.innerHeight) / 1000) * focusScale;
  const ordered = [...cities].sort((a, b) => {
    const aIsHighlighted = highlightedCity && isSameCity(a, highlightedCity) ? 0 : 1;
    const bIsHighlighted = highlightedCity && isSameCity(b, highlightedCity) ? 0 : 1;
    if (aIsHighlighted !== bIsHighlighted) return aIsHighlighted - bIsHighlighted;
    if (a.capital !== b.capital) return a.capital ? -1 : 1;
    return b.population - a.population;
  });
  const accepted: CityDefinition[] = [];
  for (const city of ordered) {
    const tooClose = accepted.some((placed) => {
      const dx = (city.position[0] - placed.position[0]) * pxPerUnit;
      const dy = (city.position[1] - placed.position[1]) * pxPerUnit;
      return Math.sqrt(dx * dx + dy * dy) < MAJOR_CITY_LABEL_MIN_SEPARATION_PX;
    });
    if (!tooClose) accepted.push(city);
  }
  return accepted;
}

// Operational Country Focus Engine (Index 3.3) - the country must feel
// lifted from the world map and brought forward, not zoomed to like a
// conventional map product. The selected country is the real approved map
// image (world-map-v17.png), clipped to its own Operational Geometry as a
// mask only - no gold fill, no SVG polygon, no coloured overlay, no
// border/outline/glow (superseding the Index 3.1/3.2A flat gold-fill
// proof). The clip and the country's own <image> copy share the exact
// same viewBox/fit as every other geometry overlay (Index 2.2C), so the
// cut-out aligns pixel-for-pixel with the real map before it ever moves -
// clip-path is evaluated in the element's own pre-transform coordinate
// system, so the country is masked out of its true position first, then
// that already-clipped cutout is rigidly translated/scaled as one piece.
//
// Entrance sequence is 140ms, staggered rather than one uniform fade
// (shortened again from 280ms per direct follow-up feedback that a
// delay was still perceptible - confirmed via direct measurement first
// that this is genuinely animation duration, not a computational
// bottleneck: the clip/DOM update itself lands in well under 150ms even
// for the most complex countries, so shortening the transition further
// is the correct lever, not a performance fix elsewhere):
//   0-40ms    the cutout separates from the world (opacity fade-in)
//   40-150ms  background dims and blurs (110ms, starting at 40ms so it
//             finishes close to when the sequence does)
//   70-140ms  the cutout scales and moves to its Camera Target (70ms)
// A soft drop-shadow grows in during the same 70-140ms window as the
// move/scale, reinforcing "lifted and brought forward" rather than a flat
// zoom.
//
// Index 3.4: the RETURN to the world map is its own simpler, uniform
// ease-out on every property at once (not the staggered entrance
// timing) - CSS transitions are direction-aware for free here, since the
// transition rule that applies to a property change is whichever
// `transition` value is present on the style being transitioned TO, so
// the "entered" style below carries the staggered entrance rule and the
// "not entered" style carries the uniform return rule.
const FOCUS_SEPARATION_MS = 40;
const FOCUS_BACKGROUND_MS = 110;
const FOCUS_BACKGROUND_DELAY_MS = 40;
const FOCUS_TRANSFORM_MS = 70;
const FOCUS_TRANSFORM_DELAY_MS = 70; // 70 + 70 = 140, the full entrance sequence
const FOCUS_RETURN_MS = 110;

const FOCUS_ENTER_TRANSITION = [
  `opacity ${FOCUS_SEPARATION_MS}ms ease-in-out`,
  `transform ${FOCUS_TRANSFORM_MS}ms ease-in-out ${FOCUS_TRANSFORM_DELAY_MS}ms`,
].join(", ");
const FOCUS_RETURN_TRANSITION = `opacity ${FOCUS_RETURN_MS}ms ease-out, transform ${FOCUS_RETURN_MS}ms ease-out`;
const FOCUS_FILTER_ENTER_TRANSITION = `filter ${FOCUS_TRANSFORM_MS}ms ease-in-out ${FOCUS_TRANSFORM_DELAY_MS}ms`;
const FOCUS_FILTER_RETURN_TRANSITION = `filter ${FOCUS_RETURN_MS}ms ease-out`;

// Index 3.8 rebuild: takes an already-resolved focus point/camera
// target/scale directly (one call per rendered piece - a single piece
// for an ordinary country, three for the USA's approved custom layout)
// rather than looking a country up by iso3 itself, since a single
// country can now render more than one piece.
function getCountryFocusImageStyle(focusPoint: FocusPoint, cameraTarget: CameraTarget, scale: number, entered: boolean) {
  const shiftX = cameraTarget.x - focusPoint.x;
  const shiftY = cameraTarget.y - focusPoint.y;
  return {
    transformOrigin: `${focusPoint.x}px ${focusPoint.y}px`,
    // Starts untranslated (at the country's real geographic position) and
    // unscaled, so the transition genuinely animates a move toward centre
    // alongside the fade/scale - not just a fade-in already at the
    // destination.
    transform: entered ? `translate(${shiftX}px, ${shiftY}px) scale(${scale})` : "translate(0px, 0px) scale(1)",
    opacity: entered ? 1 : 0,
    transition: entered ? FOCUS_ENTER_TRANSITION : FOCUS_RETURN_TRANSITION,
    // Click-outside detection (Index 3.4) tests against this exact clipped
    // shape, not the country's raw (unfocused) hit-zone - clip-path
    // restricts hit-testing to the painted region same as rendering, so a
    // click only registers here if it lands inside the visually focused
    // country. The click handler stops propagation so the canvas-level
    // "click outside" handler below never fires for it.
    pointerEvents: "auto" as const,
  };
}

// The drop-shadow lives on the unscaled SVG wrapper, not the scaled
// <image> itself. A CSS filter on an element that also carries a large
// `transform: scale(N)` forces the browser to rasterize the blur at N
// times the resolution (so the shadow stays crisp at full zoom), which
// is what made small, high-zoom-need countries (Hawaii, then Dominican
// Republic at the same scale(30) ceiling) hang for seconds rather than
// milliseconds. Applying the filter one level up, after the scale has
// already been baked into the composited bitmap, decouples the blur's
// cost from the country's zoom factor entirely.
function getCountryFocusWrapperStyle(entered: boolean) {
  return {
    filter: entered ? "drop-shadow(0 14px 34px rgba(0, 0, 0, 0.55))" : "drop-shadow(0 0px 0px rgba(0, 0, 0, 0))",
    transition: entered ? FOCUS_FILTER_ENTER_TRANSITION : FOCUS_FILTER_RETURN_TRANSITION,
  };
}

// Index 3.4: background dim/blur uses the same direction-aware transition
// pattern as the country image above - staggered+delayed on the way in,
// a single uniform 450ms ease-out on the way back to the world map.
function getBackgroundFocusStyle(entered: boolean) {
  return {
    filter: entered ? "blur(10px) brightness(0.45)" : "blur(0px) brightness(1)",
    transition: entered
      ? `filter ${FOCUS_BACKGROUND_MS}ms ease-in-out ${FOCUS_BACKGROUND_DELAY_MS}ms`
      : `filter ${FOCUS_RETURN_MS}ms ease-out`,
  };
}

function getDimOverlayStyle(entered: boolean) {
  return {
    opacity: entered ? 1 : 0,
    transition: entered
      ? `opacity ${FOCUS_BACKGROUND_MS}ms ease-in-out ${FOCUS_BACKGROUND_DELAY_MS}ms`
      : `opacity ${FOCUS_RETURN_MS}ms ease-out`,
  };
}

function countVertices(svgPath: string): number {
  const matches = svgPath.match(/[ML]\s/g);
  return matches ? matches.length : 0;
}

// Index 3.4C: the focus renderer's <clipPath> was built directly from a
// country's raw stored geometry. For high-vertex-count countries (Russia,
// USA - both tens of thousands of coastline points across 100+ separate
// landmass/island rings) that raw geometry includes data artifacts the
// generation pipeline leaves behind: zero-area "rings" - a handful of
// near-duplicate points enclosing no real space, not a real island or
// territory, just noise. A single such degenerate ring is enough to
// corrupt the entire clip mask, so instead of the country's own
// silhouette the browser paints nothing inside the clip and the focused
// country fails to appear (reported as United States rendering as a
// large map-image fragment instead of its own shape). Every real ring -
// mainland or the smallest territory - is kept and still traces its own
// true coastline; only genuinely zero-area artifacts are dropped, and a
// light tolerance simplification thins redundant near-duplicate coastline
// points that don't change the visible silhouette at this canvas's scale.
// This is a render-time cleanup only (memoised per selection below, not
// recomputed per frame) - it never touches the stored registry data.
type FocusClipPoint = { x: number; y: number };

const FOCUS_CLIP_MIN_RING_AREA = 0.01;
const FOCUS_CLIP_SIMPLIFY_EPSILON = 0.15;

function parseFocusClipRingPoints(ringString: string): FocusClipPoint[] {
  const numberPairs = ringString.match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? [];
  return numberPairs.map((pair) => {
    const [x, y] = pair.split(/\s+/).map(Number);
    return { x, y };
  });
}

function focusClipRingSignedArea(ring: FocusClipPoint[]): number {
  let signedArea2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % ring.length];
    signedArea2 += p0.x * p1.y - p1.x * p0.y;
  }
  return signedArea2 / 2;
}

function focusClipPerpendicularDistance(point: FocusClipPoint, start: FocusClipPoint, end: FocusClipPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

// Ramer-Douglas-Peucker simplification, applied per ring.
function simplifyFocusClipRing(points: FocusClipPoint[], epsilon: number): FocusClipPoint[] {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const distance = focusClipPerpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = i;
    }
  }
  if (maxDistance <= epsilon) return [start, end];
  const left = simplifyFocusClipRing(points.slice(0, splitIndex + 1), epsilon);
  const right = simplifyFocusClipRing(points.slice(splitIndex), epsilon);
  return left.slice(0, -1).concat(right);
}

// Map Aesthetics Engine: a ring only gets simplified at all once its own
// raw point count passes MAP_BORDER_FULL_DETAIL_MAX_POINTS - measured
// directly off the real registry data, the only rings that large belong
// to a handful of the world's biggest countries (Russia's mainland ring
// ~4,894 points, Canada's ~3,317, USA's two largest ~1,988/~1,618); every
// other country's largest ring, however small and however far it has to
// zoom to fill the Operational Focus Block, comes in far below that
// (Indonesia's largest ~363). Below the threshold, a ring renders at
// full, unsimplified fidelity - no reason to thin a coastline that was
// never a performance concern just because it needs a high zoom scale.
// At or above it, the existing distance-based thinning still applies,
// with its tolerance divided by the country's own focus scale so the
// resulting on-screen error stays roughly constant - but since every
// ring that large belongs to a country rendered at close to 1x zoom
// anyway, that tolerance was already imperceptible before this ticket
// and stays that way now - the giant rings all belong to countries whose
// own true fit-to-block scale stays near 1x regardless of whether the
// country-focus-registry ceiling that used to bound it is still in place.
function buildFocusClipPath(svgPath: string, scale: number): string {
  const epsilon = FOCUS_CLIP_SIMPLIFY_EPSILON / Math.max(scale, 1);
  const ringStrings = svgPath.match(/M[^M]*Z/g) ?? [];
  let cleaned = "";
  for (const ringString of ringStrings) {
    const points = parseFocusClipRingPoints(ringString);
    if (points.length < 3) continue;
    if (Math.abs(focusClipRingSignedArea(points)) < FOCUS_CLIP_MIN_RING_AREA) continue;
    const simplified =
      points.length > MAP_BORDER_FULL_DETAIL_MAX_POINTS ? simplifyFocusClipRing(points, epsilon) : points;
    if (simplified.length < 3) continue;
    cleaned += `M ${simplified[0].x} ${simplified[0].y} `;
    for (let i = 1; i < simplified.length; i++) {
      cleaned += `L ${simplified[i].x} ${simplified[i].y} `;
    }
    cleaned += "Z ";
  }
  return cleaned.trim();
}

// Adjustment records are reviewer-authored review flags, kept entirely
// separate from the generated registry (public/data/country-adjustments.json
// - seeded empty, since generating it is out of scope for this ticket:
// only the registry pipeline does that, and this ticket explicitly must
// not touch it). A static frontend has no filesystem write access, so
// flagging a country here updates in-session state and logs the exact
// target JSON to the console for a reviewer to copy into the real file -
// it does not, and cannot, persist to disk by itself.
type CountryAdjustment = { status: "review-required"; notes: string };

function OperationalCanvas({
  briefArea,
  briefCondition,
  briefTraffic,
  weatherFinding,
  trafficCondition,
  onUseMyLocationForBrief,
  locatingBrief,
}: {
  briefArea: { area: string; areaRadius: string };
  briefCondition: { condition: string; conditionNote: string };
  briefTraffic: { traffic: string; trafficNote: string };
  weatherFinding: WeatherFinding | null;
  trafficCondition: TrafficCondition | null;
  onUseMyLocationForBrief: () => void;
  locatingBrief: boolean;
}) {
  const showDebugLayerNumbers = false;
  const [calibrationPoint, setCalibrationPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeCountry, setActiveCountry] = useState<ActiveCountry | null>(null);

  // The five VenueGuard-menu panels (Operational Brief, Communications,
  // Tasks, Task Planning, Layers) are mutually exclusive - only one open
  // at a time. They previously each had their own boolean and stacked
  // side-by-side with a computed left-shift, but that let a panel opened
  // out of "natural" order (e.g. Layers first) sit unshifted underneath
  // whatever opened after it, which - being later in the DOM at the same
  // z-index - always painted on top and made it look like every menu
  // item opened Layers. A single "which panel is open" state removes
  // that whole bug class: there's nothing to shift, since at most one of
  // these is ever visible.
  //
  // Alerts (the bell icon, top-right) is a separate, older panel - not
  // part of the VenueGuard menu, slides from the opposite edge, and can
  // coexist with any of these six.
  type VenueGuardPanel =
    | "brief"
    | "communications"
    | "tasks"
    | "task-planning"
    | "risk-assessments"
    | "route-planning"
    | "download-task"
    | "layers"
    | "profile"
    | null;
  const [activePanel, setActivePanel] = useState<VenueGuardPanel>(null);
  const briefPanelOpen = activePanel === "brief";
  const communicationsPanelOpen = activePanel === "communications";
  const tasksPanelOpen = activePanel === "tasks";
  const taskPlanningPanelOpen = activePanel === "task-planning";
  const riskAssessmentsPanelOpen = activePanel === "risk-assessments";
  const routePlanningPanelOpen = activePanel === "route-planning";
  const downloadTaskPanelOpen = activePanel === "download-task";
  const layersPanelOpen = activePanel === "layers";
  const profilePanelOpen = activePanel === "profile";

  // Profile has its own sub-navigation (Overview/Account Details/
  // Expenses), same "view switch inside one panel" pattern as Risk
  // Assessments below rather than separate sliding panels. Resets to
  // "root" whenever the panel is (re)opened (see openProfile).
  const [profileView, setProfileView] = useState<"root" | "overview" | "account" | "expenses" | "timesheet">("root");

  // Risk Assessments has its own sub-navigation ("Venues," step 1 of a
  // bigger project, per direct product direction) - a view switch inside
  // this one panel rather than a separate sliding panel, deliberately:
  // the earlier nested-panel design for Task Planning caused a real bug
  // (panels layering on top of each other), and the fix was making the
  // VenueGuard panels mutually exclusive. Nesting a nav level *inside*
  // one panel's own content sidesteps that whole class of bug instead of
  // reintroducing it. Resets to "root" whenever the panel is (re)opened.
  const [riskAssessmentsView, setRiskAssessmentsView] = useState<"root" | "venues" | "assessment">("root");

  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);

  const DEMO_INSTRUCTIONS = [
    {
      id: 1,
      from: "Demo Manager",
      message: "Principal delayed 30 minutes - hold at current position until further notice.",
      sentAt: "Today, 08:42",
    },
  ];
  // Instructions received via Communications also surface in the Alerts
  // panel - a Manager instruction is exactly the kind of thing an
  // operator shouldn't have to go looking for in a separate panel to
  // notice. Mapped to OperationalAlert's shape so it renders through
  // the same list as everything else there, listed first (most
  // recent/relevant).
  const instructionAlerts: OperationalAlert[] = DEMO_INSTRUCTIONS.map((instruction) => ({
    id: `instruction-${instruction.id}`,
    severity: "info",
    title: "Instruction from your Manager",
    description: instruction.message,
    location: instruction.from,
    timestamp: instruction.sentAt,
  }));
  const [cpoUsers, setCpoUsers] = useState<User[]>([]);
  const [viewingAsCpoId, setViewingAsCpoId] = useState<number | null>(null);
  const [cpoTasks, setCpoTasks] = useState<Task[]>([]);
  const [cpoTasksLoading, setCpoTasksLoading] = useState(false);
  // Closest thing this app has to "the logged-in user" without real
  // auth - matches the operator area's hardcoded "Frik" by name,
  // falling back to an Admin, then anyone, if that name isn't in the
  // Users table yet. Scopes Profile > Timesheet (and anything else
  // Profile grows) to one specific real account - distinct from
  // viewingAsCpoId above, which is a separate "Manager viewing as a
  // CPO" concept for admin testing elsewhere in this dashboard.
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  useEffect(() => {
    api.users
      .list()
      .then((users) => {
        const cpos = users.filter((u) => u.role === "cpo");
        setCpoUsers(cpos);
        setViewingAsCpoId((current) => current ?? cpos[0]?.id ?? null);

        const frikMatch =
          users.find((u) => u.name.trim().toLowerCase() === "frik") ??
          users.find((u) => u.role === "admin") ??
          users[0];
        setProfileUserId(frikMatch?.id ?? null);
      })
      .catch((err) => console.error("Failed to load CPO users:", err));
  }, []);

  useEffect(() => {
    if (viewingAsCpoId == null) return;
    setCpoTasksLoading(true);
    api.tasks
      .list(viewingAsCpoId)
      .then(setCpoTasks)
      .catch((err) => console.error(`Failed to load tasks for CPO ${viewingAsCpoId}:`, err))
      .finally(() => setCpoTasksLoading(false));
  }, [viewingAsCpoId]);

  // Profile > Timesheet - scoped to profileUserId, not viewingAsCpoId
  // (see its declaration above for why they're different concepts).
  // Fetched lazily, once, the first time the Timesheet sub-view is
  // actually opened.
  const [timesheetEntries, setTimesheetEntries] = useState<TimesheetEntry[]>([]);
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [timesheetLoadedForUserId, setTimesheetLoadedForUserId] = useState<number | null>(null);
  const [timesheetMonth, setTimesheetMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedTimesheetDate, setSelectedTimesheetDate] = useState<string | null>(null);
  const [timesheetHoursInput, setTimesheetHoursInput] = useState("");
  const [timesheetNotesInput, setTimesheetNotesInput] = useState("");
  const [savingTimesheetEntry, setSavingTimesheetEntry] = useState(false);
  const [deletingTimesheetEntry, setDeletingTimesheetEntry] = useState(false);

  useEffect(() => {
    if (profileView !== "timesheet" || profileUserId == null) return;
    if (timesheetLoadedForUserId === profileUserId) return;
    setTimesheetLoading(true);
    api.timesheet
      .list(profileUserId)
      .then((entries) => {
        setTimesheetEntries(entries);
        setTimesheetLoadedForUserId(profileUserId);
      })
      .catch((err) => console.error(`Failed to load timesheet for user ${profileUserId}:`, err))
      .finally(() => setTimesheetLoading(false));
  }, [profileView, profileUserId, timesheetLoadedForUserId]);

  function selectTimesheetDate(dateKey: string) {
    setSelectedTimesheetDate(dateKey);
    const existing = timesheetEntries.find((e) => e.date === dateKey);
    setTimesheetHoursInput(existing ? String(existing.hoursWorked) : "");
    setTimesheetNotesInput(existing ? existing.notes : "");
  }

  function saveTimesheetEntry() {
    if (!selectedTimesheetDate || profileUserId == null) return;
    const hours = Number(timesheetHoursInput);
    if (isNaN(hours) || hours < 0 || hours > 24) return;
    setSavingTimesheetEntry(true);
    api.timesheet
      .upsert(profileUserId, { date: selectedTimesheetDate, hoursWorked: hours, notes: timesheetNotesInput })
      .then((entry) => {
        setTimesheetEntries((prev) => [...prev.filter((e) => e.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date)));
      })
      .catch((err) => console.error("Failed to save timesheet entry:", err))
      .finally(() => setSavingTimesheetEntry(false));
  }

  function deleteTimesheetEntry() {
    const existing = selectedTimesheetDate ? timesheetEntries.find((e) => e.date === selectedTimesheetDate) : undefined;
    if (!existing) return;
    setDeletingTimesheetEntry(true);
    api.timesheet
      .delete(existing.id)
      .then(() => {
        setTimesheetEntries((prev) => prev.filter((e) => e.id !== existing.id));
        setTimesheetHoursInput("");
        setTimesheetNotesInput("");
      })
      .catch((err) => console.error("Failed to delete timesheet entry:", err))
      .finally(() => setDeletingTimesheetEntry(false));
  }

  function updateTaskStatus(taskId: number, status: TaskStatus) {
    setCpoTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    api.tasks.updateStatus(taskId, { status }).catch((err) => {
      console.error(`Failed to update task ${taskId}:`, err);
      if (viewingAsCpoId != null) api.tasks.list(viewingAsCpoId).then(setCpoTasks).catch(() => {});
    });
  }

  // Task Planning (Planner, Step 1) - a real sibling panel reached
  // directly from the VenueGuard menu (Operational Brief, Tasks, Task
  // Planning, Layers), not nested inside Tasks. It has its own task
  // selector, since it isn't opened from a specific task row.
  //
  // A real CPO/Manager/Task setup takes several steps (create users,
  // assign a task) before there's anything real to select - MOCK_TASK
  // is a clearly-labelled, client-only demo task shown only when no real
  // tasks exist yet, so the panel itself can be tested/seen immediately.
  // Its checklist state lives only in this component (never hits the
  // API, since task id -1 doesn't exist server-side) and resets on
  // reload - it disappears entirely the moment a real task exists.
  const MOCK_TASK_ID = -1;
  const MOCK_TASK: Task = {
    id: MOCK_TASK_ID,
    venueId: -1,
    venueName: "Example Venue (Demo)",
    assignedTo: -1,
    assignedToName: null,
    assignedBy: -1,
    assignedByName: "Demo Manager",
    title: "Demo Task - Complete assessment for venue X",
    dueDate: null,
    status: "not_completed",
    completionNote: null,
    planSubmittedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const displayedTasks = useMemo(() => (cpoTasks.length > 0 ? cpoTasks : [MOCK_TASK]), [cpoTasks]);

  // Task acceptance - the CPO's first response to an assigned task,
  // before working through its checklist. Demo/local-only for now (per
  // direct product direction), same as Communications - not persisted
  // to the task itself. Accepting a task is what "connects" it to Task
  // Planning: it becomes the selected task there, and the CPO is taken
  // straight to its checklist.
  type TaskAcceptanceStatus = "pending" | "accepted" | "declined";
  const [taskAcceptance, setTaskAcceptance] = useState<Record<number, TaskAcceptanceStatus>>({});

  function respondToTask(taskId: number, response: "accepted" | "declined") {
    setTaskAcceptance((prev) => ({ ...prev, [taskId]: response }));
    if (response === "accepted") {
      setPlanningTaskId(taskId);
      setActivePanel("task-planning");
    }
  }

  // Closes whichever panel is open and reopens the VenueGuard dropdown,
  // so switching panels is one motion instead of close-then-reclick-
  // VenueGuard. Same cross-sibling-component pattern as the
  // OPEN_*_PANEL_EVENT constants (TopBanner owns brandMenuOpen).
  function backToMenu() {
    setActivePanel(null);
    window.dispatchEvent(new Event(REOPEN_BRAND_MENU_EVENT));
  }

  // Same idea as backToMenu, but for Profile - it was opened from the
  // operator menu (top-right), not the brand menu, so its own "Back to
  // Menu" button needs to reopen that dropdown instead.
  function backToOperatorMenu() {
    setActivePanel(null);
    window.dispatchEvent(new Event(REOPEN_OPERATOR_MENU_EVENT));
  }

  // Risk Assessments > Venues starts from tasks this CPO has actually
  // accepted - not every task, and not pending/declined ones. Each
  // accepted task gets its own row (labelled with its assigned venue),
  // expandable to show its Task detail plus a list of Risk Assessment
  // slots - a task can have several (e.g. recce venues X, Y and Z for
  // the same operation), added on demand via "Add Another Assessment"
  // rather than requiring a matching real venue record for each one
  // (the CPO types the actual location into each assessment itself).
  const acceptedTasksList = useMemo(
    () => displayedTasks.filter((t) => taskAcceptance[t.id] === "accepted"),
    [displayedTasks, taskAcceptance],
  );

  // Real Alerts (OSINT/GDELT findings promoted by a Manager, plus any
  // other alert source) - fetched once and scoped down to venues this
  // CPO actually has an accepted task at, same reasoning as Risk
  // Assessments > Venues: an alert for a venue this CPO has nothing to
  // do with isn't operationally relevant to them. Falls back to the
  // OPERATIONAL_ALERTS demo feed when there's nothing real to show yet -
  // same "disappears once real data exists" convention as MOCK_TASK.
  const [realAlerts, setRealAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    api.alerts.list().then(setRealAlerts).catch((err) => console.error("Failed to load alerts:", err));
  }, []);

  const ALERT_PRIORITY_SEVERITY: Record<AlertPriority, AlertSeverity> = {
    critical: "critical",
    high: "warning",
    medium: "warning",
    low: "info",
  };

  const scopedRealAlerts = useMemo(() => {
    const venueIds = new Set(acceptedTasksList.map((t) => t.venueId));
    return realAlerts.filter((a) => venueIds.has(a.venueId) && a.status !== "dismissed");
  }, [realAlerts, acceptedTasksList]);

  const feedAlerts: OperationalAlert[] =
    scopedRealAlerts.length > 0
      ? scopedRealAlerts.map((a) => ({
          id: `alert-${a.id}`,
          severity: ALERT_PRIORITY_SEVERITY[a.priority],
          title: a.title,
          description: a.summary,
          location: a.venueName ?? "Unknown venue",
          timestamp: timeAgo(a.createdAt),
          realAlertId: a.id,
          reviewed: a.status === "reviewed",
        }))
      : OPERATIONAL_ALERTS;

  // "Severe weather advisory issued" - real, driven by the same weather
  // engine as the Operational Brief (fetchWeatherFinding on the
  // backend, via weatherFinding above), not a static demo entry. Only
  // exists at all when that engine actually found something notable
  // at the CPO's current location - no finding means no alert, per
  // direct product direction, rather than showing a placeholder.
  const weatherAlert: OperationalAlert | null = weatherFinding
    ? {
        id: "alert-weather-current",
        severity: weatherFinding.severity === "critical" ? "critical" : "warning",
        title: "Severe weather advisory issued",
        description: weatherFinding.summary,
        location: briefArea.area,
        timestamp: "Live",
      }
    : null;

  // "Road closure near venue" - real, driven by the same traffic
  // engine as the Operational Brief (fetchTrafficCondition on the
  // backend, via trafficCondition above). Only exists when TomTom
  // actually reports a closure (severity "closed") at the CPO's
  // current location - ordinary congestion belongs in the Brief's
  // Traffic tile, not here, same "no finding, no alert" reasoning as
  // weatherAlert.
  const roadClosureAlert: OperationalAlert | null =
    trafficCondition?.severity === "closed"
      ? {
          id: "alert-traffic-closure",
          severity: "warning",
          title: "Road closure near venue",
          description: trafficCondition.label,
          location: briefArea.area,
          timestamp: "Live",
        }
      : null;

  // Dismiss/Mark Reviewed for entries with no backing Alert record
  // (instructionAlerts, weatherAlert, roadClosureAlert, the
  // OPERATIONAL_ALERTS demo feed) - there's nothing to PATCH, so the
  // action just hides/flags it locally, same "local-only" convention
  // as MOCK_TASK elsewhere in this file.
  const [locallyDismissedAlertIds, setLocallyDismissedAlertIds] = useState<Set<string>>(new Set());
  const [locallyReviewedAlertIds, setLocallyReviewedAlertIds] = useState<Set<string>>(new Set());

  const combinedAlerts = [
    ...instructionAlerts,
    ...(weatherAlert ? [weatherAlert] : []),
    ...(roadClosureAlert ? [roadClosureAlert] : []),
    ...feedAlerts,
  ]
    .filter((alert) => !locallyDismissedAlertIds.has(alert.id))
    .map((alert) => ({ ...alert, reviewed: alert.reviewed || locallyReviewedAlertIds.has(alert.id) }));

  function dismissAlert(alert: OperationalAlert) {
    if (alert.realAlertId != null) {
      api.alerts
        .update(alert.realAlertId, { status: "dismissed" })
        .then((updated) => setRealAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a))))
        .catch((err) => console.error(`Failed to dismiss alert ${alert.realAlertId}:`, err));
    } else {
      setLocallyDismissedAlertIds((prev) => new Set(prev).add(alert.id));
    }
  }

  function markAlertReviewed(alert: OperationalAlert) {
    if (alert.realAlertId != null) {
      api.alerts
        .update(alert.realAlertId, { status: "reviewed" })
        .then((updated) => setRealAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a))))
        .catch((err) => console.error(`Failed to mark alert ${alert.realAlertId} reviewed:`, err));
    } else {
      setLocallyReviewedAlertIds((prev) => new Set(prev).add(alert.id));
    }
  }

  // Each accepted task can be expanded to reveal its detail and Risk
  // Assessment slots - demo/local-only expand state, same as the rest
  // of Risk Assessments > Venues so far.
  const [expandedVenueIds, setExpandedVenueIds] = useState<Set<number>>(new Set());

  const [taskAssessments, setTaskAssessments] = useState<Record<number, VenueRiskAssessment[]>>({});
  const [taskAssessmentsLoading, setTaskAssessmentsLoading] = useState<Record<number, boolean>>({});
  const [creatingAssessmentTaskId, setCreatingAssessmentTaskId] = useState<number | null>(null);

  function ensureTaskAssessmentsLoaded(taskId: number) {
    if (taskAssessments[taskId] || taskAssessmentsLoading[taskId]) return;
    if (taskId === MOCK_TASK_ID) {
      setTaskAssessments((prev) => ({ ...prev, [taskId]: [] }));
      return;
    }
    setTaskAssessmentsLoading((prev) => ({ ...prev, [taskId]: true }));
    api.venueRiskAssessments
      .list(taskId)
      .then((slots) => setTaskAssessments((prev) => ({ ...prev, [taskId]: slots })))
      .catch((err) => console.error(`Failed to load risk assessments for task ${taskId}:`, err))
      .finally(() => setTaskAssessmentsLoading((prev) => ({ ...prev, [taskId]: false })));
  }

  function toggleVenueExpanded(taskId: number) {
    setExpandedVenueIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else {
        next.add(taskId);
        ensureTaskAssessmentsLoaded(taskId);
      }
      return next;
    });
  }

  function addAssessmentSlot(taskId: number) {
    if (taskId === MOCK_TASK_ID) {
      setTaskAssessments((prev) => {
        const existing = prev[taskId] ?? [];
        return { ...prev, [taskId]: [...existing, mockAssessment(taskId, existing.length + 1)] };
      });
      return;
    }
    setCreatingAssessmentTaskId(taskId);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api.venueRiskAssessments
      .create(taskId, timezone)
      .then((assessment) => setTaskAssessments((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), assessment] })))
      .catch((err) => console.error(`Failed to add a risk assessment for task ${taskId}:`, err))
      .finally(() => setCreatingAssessmentTaskId(null));
  }

  // Venue Risk Assessment - the CPO's in-field checklist, filled in
  // after picking a specific assessment slot under a task, real backend
  // (unlike most of Risk Assessments > Venues so far).
  const [assessingAssessmentId, setAssessingAssessmentId] = useState<number | null>(null);
  const [assessingTaskId, setAssessingTaskId] = useState<number | null>(null);
  const [currentAssessment, setCurrentAssessment] = useState<VenueRiskAssessment | null>(null);
  const [assessmentForm, setAssessmentForm] = useState<AssessmentFormState | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  // Blocks the form entirely (couldn't load the assessment in the first
  // place) - distinct from assessmentActionError, which is a save/submit
  // failure on an already-loaded form and shouldn't hide it.
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessmentActionError, setAssessmentActionError] = useState<string | null>(null);
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);

  function openVenueAssessment(taskId: number, assessmentId: number) {
    setAssessingTaskId(taskId);
    setAssessingAssessmentId(assessmentId);
    setRiskAssessmentsView("assessment");
  }

  function backToVenuesFromAssessment() {
    setRiskAssessmentsView("venues");
    setAssessingAssessmentId(null);
    setAssessingTaskId(null);
    setCurrentAssessment(null);
    setAssessmentForm(null);
    setAssessmentError(null);
    setAssessmentActionError(null);
  }

  // Same reasoning as MOCK_TASK/mockPlan - the demo task's id doesn't
  // exist server-side, so each of its assessment slots is local-only
  // instead of a real API call. Uses a distinct negative id per slot
  // (never a real id, which is always positive) so slots can still be
  // opened/told apart individually.
  function mockAssessment(taskId: number, slotIndex: number): VenueRiskAssessment {
    return {
      id: -slotIndex,
      taskId,
      slotIndex,
      operatorId: MOCK_TASK_ID,
      operatorName: "Demo Operator",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: "",
      currentOperatingConditions: "",
      areaAdvisories: "",
      checkpoints: "",
      observedHazards: "",
      existingControls: "",
      recommendedActions: "",
      operatorNotes: "",
      attachments: "",
      status: "draft",
      submittedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // A failed fetch's message is the raw API response body (see
  // apiFetch), which for a JSON error looks like {"error":"..."} - try
  // to pull out just the message so the CPO sees plain text, not JSON.
  function friendlyErrorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof Error)) return fallback;
    try {
      const parsed = JSON.parse(err.message);
      if (typeof parsed?.error === "string") return parsed.error;
    } catch {
      // Not JSON - fall through to using the raw message.
    }
    return err.message || fallback;
  }

  function formToState(assessment: VenueRiskAssessment): AssessmentFormState {
    return {
      location: assessment.location,
      currentOperatingConditions: assessment.currentOperatingConditions,
      areaAdvisories: assessment.areaAdvisories,
      checkpoints: assessment.checkpoints,
      observedHazards: assessment.observedHazards,
      existingControls: assessment.existingControls,
      recommendedActions: assessment.recommendedActions,
      operatorNotes: assessment.operatorNotes,
      attachments: assessment.attachments,
    };
  }

  // Keeps the cached slot list (taskAssessments) in sync whenever the
  // open assessment changes, so re-expanding a task's row shows
  // up-to-date data without a re-fetch.
  function applyAssessmentUpdate(updated: VenueRiskAssessment) {
    setCurrentAssessment(updated);
    setTaskAssessments((prev) => ({
      ...prev,
      [updated.taskId]: (prev[updated.taskId] ?? []).map((a) => (a.id === updated.id ? updated : a)),
    }));
  }

  useEffect(() => {
    if (riskAssessmentsView !== "assessment" || assessingTaskId == null || assessingAssessmentId == null) return;
    setAssessmentError(null);
    setAssessmentActionError(null);
    setAssessmentLoading(false);

    if (assessingTaskId === MOCK_TASK_ID) {
      const assessment = taskAssessments[assessingTaskId]?.find((a) => a.id === assessingAssessmentId);
      if (!assessment) {
        setAssessmentError("Couldn't find this risk assessment.");
        return;
      }
      setCurrentAssessment(assessment);
      setAssessmentForm(formToState(assessment));
      return;
    }

    setAssessmentLoading(true);
    api.venueRiskAssessments
      .get(assessingAssessmentId)
      .then((assessment) => {
        setCurrentAssessment(assessment);
        setAssessmentForm(formToState(assessment));
      })
      .catch((err) => {
        console.error("Failed to load risk assessment:", err);
        setAssessmentError(friendlyErrorMessage(err, "Couldn't load this risk assessment."));
      })
      .finally(() => setAssessmentLoading(false));
  }, [riskAssessmentsView, assessingTaskId, assessingAssessmentId]);

  function updateAssessmentField<K extends keyof AssessmentFormState>(key: K, value: AssessmentFormState[K]) {
    setAssessmentForm((form) => (form ? { ...form, [key]: value } : form));
  }

  function saveAssessment() {
    if (!currentAssessment || !assessmentForm) return;
    if (currentAssessment.taskId === MOCK_TASK_ID) {
      // Local-only, same as the rest of MOCK_TASK - nothing real to send.
      applyAssessmentUpdate({ ...currentAssessment, ...assessmentForm, updatedAt: new Date().toISOString() });
      return;
    }
    setSavingAssessment(true);
    setAssessmentActionError(null);
    api.venueRiskAssessments
      .update(currentAssessment.id, assessmentForm)
      .then(applyAssessmentUpdate)
      .catch((err) => {
        console.error("Failed to save risk assessment:", err);
        setAssessmentActionError(friendlyErrorMessage(err, "Couldn't save this risk assessment."));
      })
      .finally(() => setSavingAssessment(false));
  }

  function submitAssessment() {
    if (!currentAssessment) return;
    if (currentAssessment.taskId === MOCK_TASK_ID) {
      applyAssessmentUpdate({ ...currentAssessment, status: "submitted", submittedAt: new Date().toISOString() });
      return;
    }
    setSubmittingAssessment(true);
    setAssessmentActionError(null);
    api.venueRiskAssessments
      .submit(currentAssessment.id)
      .then(applyAssessmentUpdate)
      .catch((err) => {
        console.error("Failed to submit risk assessment:", err);
        setAssessmentActionError(friendlyErrorMessage(err, "Couldn't submit this risk assessment."));
      })
      .finally(() => setSubmittingAssessment(false));
  }

  // Route Planning - same task-scoped/slot pattern as Risk Assessments >
  // Venues above (acceptedTasksList, expand-to-load, "Add
  // Route"/"Add Another Route" per task). Each slot's Start/End is
  // picked via the location engine or a real Venue record; "Calculate
  // Route" is a separate, explicitly-triggered action (not automatic)
  // since it's the call that spends the metered TomTom traffic quota.
  // Venues are fetched once, scoped down per-slot inside
  // TaskRouteSlotCard (task's own venue listed first) - a task can be
  // linked to several different venues across its route slots, so this
  // isn't filtered down to just the one venue a task happens to carry.
  const [venues, setVenues] = useState<Venue[]>([]);

  useEffect(() => {
    api.venues.list().then(setVenues).catch((err) => console.error("Failed to load venues:", err));
  }, []);

  const [expandedRouteTaskIds, setExpandedRouteTaskIds] = useState<Set<number>>(new Set());
  const [taskRoutesMap, setTaskRoutesMap] = useState<Record<number, TaskRoute[]>>({});
  const [taskRoutesLoading, setTaskRoutesLoading] = useState<Record<number, boolean>>({});
  const [creatingRouteTaskId, setCreatingRouteTaskId] = useState<number | null>(null);
  const [calculatingRouteId, setCalculatingRouteId] = useState<number | null>(null);
  const [routeCalcErrors, setRouteCalcErrors] = useState<Record<number, string | null>>({});

  // Same reasoning as mockAssessment - MOCK_TASK's id doesn't exist
  // server-side, so its route slots are local-only, using a distinct
  // negative id per slot.
  function mockRoute(taskId: number, slotIndex: number): TaskRoute {
    return {
      id: -slotIndex,
      taskId,
      slotIndex,
      startLabel: "",
      startLat: null,
      startLng: null,
      endLabel: "",
      endLat: null,
      endLng: null,
      routeGeometryGeojson: null,
      distanceMeters: null,
      staticTravelTimeSeconds: null,
      liveTravelTimeSeconds: null,
      trafficDelaySeconds: null,
      trafficCheckedAt: null,
      nearestHospitals: [],
      nearestPoliceStations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function ensureTaskRoutesLoaded(taskId: number) {
    if (taskRoutesMap[taskId] || taskRoutesLoading[taskId]) return;
    if (taskId === MOCK_TASK_ID) {
      setTaskRoutesMap((prev) => ({ ...prev, [taskId]: [] }));
      return;
    }
    setTaskRoutesLoading((prev) => ({ ...prev, [taskId]: true }));
    api.taskRoutes
      .list(taskId)
      .then((routes) => setTaskRoutesMap((prev) => ({ ...prev, [taskId]: routes })))
      .catch((err) => console.error(`Failed to load routes for task ${taskId}:`, err))
      .finally(() => setTaskRoutesLoading((prev) => ({ ...prev, [taskId]: false })));
  }

  function toggleRouteTaskExpanded(taskId: number) {
    setExpandedRouteTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else {
        next.add(taskId);
        ensureTaskRoutesLoaded(taskId);
      }
      return next;
    });
  }

  function addRouteSlot(taskId: number) {
    if (taskId === MOCK_TASK_ID) {
      setTaskRoutesMap((prev) => {
        const existing = prev[taskId] ?? [];
        return { ...prev, [taskId]: [...existing, mockRoute(taskId, existing.length + 1)] };
      });
      return;
    }
    setCreatingRouteTaskId(taskId);
    api.taskRoutes
      .create(taskId)
      .then((route) => setTaskRoutesMap((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), route] })))
      .catch((err) => console.error(`Failed to add a route for task ${taskId}:`, err))
      .finally(() => setCreatingRouteTaskId(null));
  }

  function applyRouteUpdate(updated: TaskRoute) {
    setTaskRoutesMap((prev) => ({
      ...prev,
      [updated.taskId]: (prev[updated.taskId] ?? []).map((r) => (r.id === updated.id ? updated : r)),
    }));
  }

  function updateRoutePoint(route: TaskRoute, point: "start" | "end", result: LocationSearchResult) {
    if (result.lat == null || result.lng == null) return;
    const patch =
      point === "start"
        ? { startLabel: result.label, startLat: result.lat, startLng: result.lng }
        : { endLabel: result.label, endLat: result.lat, endLng: result.lng };

    if (route.taskId === MOCK_TASK_ID) {
      applyRouteUpdate({ ...route, ...patch, updatedAt: new Date().toISOString() });
      return;
    }
    api.taskRoutes
      .update(route.id, patch)
      .then(applyRouteUpdate)
      .catch((err) => console.error(`Failed to update route ${route.id}:`, err));
  }

  function calculateRoute(route: TaskRoute) {
    if (route.startLat == null || route.startLng == null || route.endLat == null || route.endLng == null) return;
    if (route.taskId === MOCK_TASK_ID) {
      setRouteCalcErrors((prev) => ({ ...prev, [route.id]: "Accept a real task to calculate a route." }));
      return;
    }
    setCalculatingRouteId(route.id);
    setRouteCalcErrors((prev) => ({ ...prev, [route.id]: null }));
    api.taskRoutes
      .calculate(route.id)
      .then(applyRouteUpdate)
      .catch((err) => {
        console.error(`Failed to calculate route ${route.id}:`, err);
        setRouteCalcErrors((prev) => ({ ...prev, [route.id]: friendlyErrorMessage(err, "Couldn't calculate this route.") }));
      })
      .finally(() => setCalculatingRouteId(null));
  }

  const [planningTaskId, setPlanningTaskId] = useState<number | null>(null);
  const [taskPlans, setTaskPlans] = useState<Record<number, Plan>>({});
  const [planLoadingTaskId, setPlanLoadingTaskId] = useState<number | null>(null);

  // Default (and re-default, e.g. once real tasks replace the mock one)
  // the selected task to the first available whenever the current
  // selection isn't in the list anymore.
  useEffect(() => {
    if (displayedTasks.length === 0) return;
    if (!displayedTasks.some((t) => t.id === planningTaskId)) {
      setPlanningTaskId(displayedTasks[0].id);
    }
  }, [displayedTasks, planningTaskId]);

  function mockPlan(): Plan {
    return {
      id: MOCK_TASK_ID,
      taskId: MOCK_TASK_ID,
      checklist: MOCK_CHECKLIST_ITEMS.map((item) => ({ ...item, checked: false })),
      checkedCount: 0,
      totalCount: MOCK_CHECKLIST_ITEMS.length,
      submittedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Deliberately keyed only on planningTaskId, not taskPlans - this
  // fetches once per task selection and caches the result; taskPlans
  // itself is only ever updated as a side effect (here and in
  // toggleChecklistItem), never a trigger to re-fetch.
  useEffect(() => {
    if (planningTaskId == null || taskPlans[planningTaskId]) return;
    if (planningTaskId === MOCK_TASK_ID) {
      setTaskPlans((prev) => ({ ...prev, [planningTaskId]: mockPlan() }));
      return;
    }
    setPlanLoadingTaskId(planningTaskId);
    api.plans
      .forTask(planningTaskId)
      .then((plan) => setTaskPlans((prev) => ({ ...prev, [planningTaskId]: plan })))
      .catch((err) => console.error(`Failed to load plan for task ${planningTaskId}:`, err))
      .finally(() => setPlanLoadingTaskId(null));
  }, [planningTaskId]);

  function toggleChecklistItem(taskId: number, planId: number, key: string, checked: boolean) {
    setTaskPlans((prev) => {
      const plan = prev[taskId];
      if (!plan) return prev;
      const checklist = plan.checklist.map((c) => (c.key === key ? { ...c, checked } : c));
      return { ...prev, [taskId]: { ...plan, checklist, checkedCount: checklist.filter((c) => c.checked).length } };
    });
    if (taskId === MOCK_TASK_ID) return; // local-only, nothing to persist
    api.plans.setChecklistItem(planId, key, checked).catch((err) => {
      console.error(`Failed to update checklist item "${key}" on plan ${planId}:`, err);
      api.plans.forTask(taskId).then((plan) => setTaskPlans((prev) => ({ ...prev, [taskId]: plan }))).catch(() => {});
    });
  }

  const [submittingPlanTaskId, setSubmittingPlanTaskId] = useState<number | null>(null);

  function submitPlan(taskId: number, planId: number) {
    if (taskId === MOCK_TASK_ID) {
      // Local-only, same as the rest of MOCK_TASK - nothing real to send.
      setTaskPlans((prev) => {
        const plan = prev[taskId];
        if (!plan) return prev;
        return { ...prev, [taskId]: { ...plan, submittedAt: new Date().toISOString() } };
      });
      return;
    }
    setSubmittingPlanTaskId(taskId);
    api.plans
      .submit(planId)
      .then((plan) => setTaskPlans((prev) => ({ ...prev, [taskId]: plan })))
      .catch((err) => console.error(`Failed to submit plan ${planId}:`, err))
      .finally(() => setSubmittingPlanTaskId(null));
  }

  const [gridVisible, setGridVisible] = useState(MAP_GRID_VISIBLE);
  const [majorCitiesVisible, setMajorCitiesVisible] = useState(true);
  const [focusFillVisible, setFocusFillVisible] = useState(MAP_FOCUS_FILL_VISIBLE);
  const [focusBorderVisible, setFocusBorderVisible] = useState(MAP_FOCUS_BORDER_VISIBLE);
  // What's actually mounted/animating - lags behind activeCountry while a
  // return-to-world-map animation (Index 3.4) is playing, so the country
  // cutout and background dim/blur have something to transition FROM
  // instead of vanishing the instant Active Country clears.
  const [renderedCountry, setRenderedCountry] = useState<ActiveCountry | null>(null);
  const [focusEntered, setFocusEntered] = useState(false);
  // Mirrors activeCountry for the return-timeout guard below (Index
  // 3.4A) - a ref, not state, so the timeout callback can read the
  // LATEST value instead of the one captured in its own closure.
  const activeCountryRef = useRef<ActiveCountry | null>(null);
  activeCountryRef.current = activeCountry;

  // Index 3.8 rebuild (follow-up): every selectable region - including
  // the USA's mainland, Alaska, and Hawaii, each its own independently
  // clickable region since the follow-up split below - renders as a
  // single piece now; there is no longer a multi-piece "dominant +
  // insets" layout for any country. The clip path is cleaned/simplified
  // once per selection here, not per frame - see buildFocusClipPath for
  // why this differs from the region's raw geometry. Falls back to the
  // Active Country's own registry fields if a focus definition is
  // somehow missing (defensive only - every Active Country comes from
  // OPERATIONAL_SELECTABLE_REGIONS, which COUNTRY_FOCUS_REGISTRY is
  // built 1:1 from).
  const focusRender = useMemo(() => {
    if (!renderedCountry) return null;
    const focusDefinition = getCountryFocusDefinition(renderedCountry.iso3);
    const focusPoint =
      focusDefinition?.focusPoint ??
      {
        x: (renderedCountry.boundingBox.minX + renderedCountry.boundingBox.maxX) / 2,
        y: (renderedCountry.boundingBox.minY + renderedCountry.boundingBox.maxY) / 2,
      };
    const cameraTarget = focusDefinition?.cameraTarget ?? { x: 500, y: 500 };
    const scale = focusDefinition?.defaultFocusScale ?? 1;
    return { focusPoint, cameraTarget, scale, clipPath: buildFocusClipPath(renderedCountry.geometry, scale) };
  }, [renderedCountry]);

  // Country Intelligence panel content - capital/city count from the
  // City Registry (always available, no fetch needed).
  const countryPanelData = useMemo(() => {
    if (!renderedCountry) return null;
    const cities = CITY_REGISTRY[renderedCountry.iso3] ?? [];
    const capital = cities.find((city) => city.capital)?.name ?? null;
    return { capital, cityCount: cities.length };
  }, [renderedCountry]);

  // Country Intelligence Engine - the real Risk Rating + Public Health
  // data (US State Dept + CDC, server-side; see
  // api.countries.intelligence and country-intelligence.ts). Fetched
  // fresh on every country selection, not cached client-side - a guard
  // ref discards a response that resolves after the selection has
  // already moved on to a different country, so a slow fetch for the
  // previous country can never overwrite the current one's panel.
  const [countryIntelligence, setCountryIntelligence] = useState<CountryIntelligence | null>(null);
  const [countryIntelligenceLoading, setCountryIntelligenceLoading] = useState(false);
  const countryIntelligenceRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!renderedCountry) {
      setCountryIntelligence(null);
      setCountryIntelligenceLoading(false);
      countryIntelligenceRequestRef.current = null;
      return;
    }
    const requestKey = renderedCountry.iso3;
    countryIntelligenceRequestRef.current = requestKey;
    setCountryIntelligence(null);
    setCountryIntelligenceLoading(true);
    api.countries
      .intelligence(renderedCountry.iso2, renderedCountry.name)
      .then((data) => {
        if (countryIntelligenceRequestRef.current !== requestKey) return;
        setCountryIntelligence(data);
      })
      .catch((err) => {
        if (countryIntelligenceRequestRef.current !== requestKey) return;
        console.error("Country Intelligence fetch failed:", err);
        setCountryIntelligence(null);
      })
      .finally(() => {
        if (countryIntelligenceRequestRef.current !== requestKey) return;
        setCountryIntelligenceLoading(false);
      });
  }, [renderedCountry]);

  // In-panel city search - same idea as the top banner's Operational
  // Search Index, but scoped to only the selected country's own City
  // Registry entries rather than the whole world. Selecting a result
  // highlights it on the map exactly like the banner search does
  // (ActiveCountry.highlightedCity), re-selecting the same country with
  // that city attached.
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [citySearchOpen, setCitySearchOpen] = useState(false);
  const countryCitySearchResults = useMemo(() => {
    const q = citySearchQuery.trim().toLowerCase();
    if (!q || !renderedCountry) return [];
    const cities = CITY_REGISTRY[renderedCountry.iso3] ?? [];
    return cities
      .filter((city) => city.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      })
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [renderedCountry, citySearchQuery]);

  function selectCountryPanelCity(city: CityDefinition) {
    if (!renderedCountry) return;
    const region = OPERATIONAL_SELECTABLE_REGIONS.find((r) => r.iso3 === renderedCountry.iso3);
    if (!region) return;
    selectCountry(region, city);
    setCitySearchQuery("");
    setCitySearchOpen(false);
  }

  // Reset the in-panel search whenever the selected country itself
  // changes, so a stale query/dropdown from the previous country never
  // carries over.
  useEffect(() => {
    setCitySearchQuery("");
    setCitySearchOpen(false);
  }, [renderedCountry?.iso3]);

  useEffect(() => {
    subscribe(setActiveCountry);
    return () => unsubscribe(setActiveCountry);
  }, []);

  // Operational Brief, Communications, Tasks, Task Planning, Risk
  // Assessments, and Layers are now opened from the VenueGuard brand
  // menu in TopBanner - see OPEN_BRIEF_PANEL_EVENT/
  // OPEN_COMMUNICATIONS_PANEL_EVENT/OPEN_TASKS_PANEL_EVENT/
  // OPEN_TASK_PLANNING_PANEL_EVENT/OPEN_RISK_ASSESSMENTS_PANEL_EVENT/
  // OPEN_LAYERS_PANEL_EVENT above. TopBanner and OperationalCanvas are
  // siblings, not parent/child, so this state can't be reached by props
  // without lifting it (and the click-outside-to-close logic below) out
  // of this component entirely.
  useEffect(() => {
    const openBrief = () => setActivePanel("brief");
    const openCommunications = () => setActivePanel("communications");
    const openTasks = () => setActivePanel("tasks");
    const openTaskPlanning = () => setActivePanel("task-planning");
    const openRiskAssessments = () => {
      setActivePanel("risk-assessments");
      setRiskAssessmentsView("root");
      setExpandedVenueIds(new Set());
      setAssessingAssessmentId(null);
      setAssessingTaskId(null);
      setCurrentAssessment(null);
      setAssessmentForm(null);
    };
    const openRoutePlanning = () => setActivePanel("route-planning");
    const openDownloadTask = () => setActivePanel("download-task");
    const openLayers = () => setActivePanel("layers");
    // Profile docks on the same right edge as Alerts (unlike the other
    // six panels above, which dock left) - close Alerts when Profile
    // opens so the two don't render on top of each other; the reverse
    // (Alerts trigger closing Profile) is handled in TopBanner's alerts
    // toggle itself.
    const openProfile = () => {
      setActivePanel("profile");
      setAlertsPanelOpen(false);
      setProfileView("root");
    };
    // Mirrors the panel-closing half of handleCanvasClick below, fired
    // from TopBanner (a sibling, not a descendant of this canvas) when a
    // click lands outside its brand menu - see CLOSE_VENUEGUARD_PANELS_EVENT.
    const closePanelsFromTopBanner = () => {
      setActivePanel(null);
      setAlertsPanelOpen(false);
    };
    // The Alerts trigger button itself now lives in TopBanner (see
    // TOGGLE_ALERTS_PANEL_EVENT above) - setActivePanel uses the
    // functional form here (not the profilePanelOpen variable) since
    // this closure is only created once on mount and would otherwise
    // never see a later Profile-open state.
    const toggleAlerts = () => {
      setAlertsPanelOpen((open) => {
        const next = !open;
        if (next) setActivePanel((current) => (current === "profile" ? null : current));
        return next;
      });
    };
    window.addEventListener(OPEN_BRIEF_PANEL_EVENT, openBrief);
    window.addEventListener(OPEN_COMMUNICATIONS_PANEL_EVENT, openCommunications);
    window.addEventListener(OPEN_TASKS_PANEL_EVENT, openTasks);
    window.addEventListener(OPEN_TASK_PLANNING_PANEL_EVENT, openTaskPlanning);
    window.addEventListener(OPEN_RISK_ASSESSMENTS_PANEL_EVENT, openRiskAssessments);
    window.addEventListener(OPEN_ROUTE_PLANNING_PANEL_EVENT, openRoutePlanning);
    window.addEventListener(OPEN_DOWNLOAD_TASK_PANEL_EVENT, openDownloadTask);
    window.addEventListener(OPEN_LAYERS_PANEL_EVENT, openLayers);
    window.addEventListener(OPEN_PROFILE_PANEL_EVENT, openProfile);
    window.addEventListener(CLOSE_VENUEGUARD_PANELS_EVENT, closePanelsFromTopBanner);
    window.addEventListener(TOGGLE_ALERTS_PANEL_EVENT, toggleAlerts);
    return () => {
      window.removeEventListener(OPEN_BRIEF_PANEL_EVENT, openBrief);
      window.removeEventListener(OPEN_COMMUNICATIONS_PANEL_EVENT, openCommunications);
      window.removeEventListener(OPEN_TASKS_PANEL_EVENT, openTasks);
      window.removeEventListener(OPEN_TASK_PLANNING_PANEL_EVENT, openTaskPlanning);
      window.removeEventListener(OPEN_RISK_ASSESSMENTS_PANEL_EVENT, openRiskAssessments);
      window.removeEventListener(OPEN_ROUTE_PLANNING_PANEL_EVENT, openRoutePlanning);
      window.removeEventListener(OPEN_DOWNLOAD_TASK_PANEL_EVENT, openDownloadTask);
      window.removeEventListener(OPEN_LAYERS_PANEL_EVENT, openLayers);
      window.removeEventListener(OPEN_PROFILE_PANEL_EVENT, openProfile);
      window.removeEventListener(CLOSE_VENUEGUARD_PANELS_EVENT, closePanelsFromTopBanner);
      window.removeEventListener(TOGGLE_ALERTS_PANEL_EVENT, toggleAlerts);
    };
  }, []);

  // Mirrors combinedAlerts.length out to TopBanner (a sibling that
  // can't see this list directly) so its Alerts button can show an
  // accurate badge - see ALERTS_COUNT_EVENT above.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(ALERTS_COUNT_EVENT, { detail: combinedAlerts.length }));
  }, [combinedAlerts.length]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (alertsPanelOpen) {
        setAlertsPanelOpen(false);
        return;
      }
      if (activePanel != null) {
        setActivePanel(null);
        return;
      }
      clearSelection();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activePanel, alertsPanelOpen]);

  // Two-phase mount so the CSS transition actually animates: paint the
  // "not entered" state first (opacity 0, no scale/shift), then flip to
  // "entered" shortly after so the browser has something to transition
  // from.
  //
  // Index 3.4A: this used a nested double-requestAnimationFrame originally
  // (wait for two paints, then flip). Confirmed by direct tracing that
  // rAF callbacks can be arbitrarily delayed - in one reproduced case, a
  // country selected immediately after clearing a previous one had its
  // rAF chain fire nearly a second late, leaving the country stuck at
  // opacity 0 (invisible) the whole time. rAF is tied to the rendering/
  // compositing pipeline and isn't guaranteed promptly under all
  // conditions; a plain macrotask (setTimeout) is not, and is what's used
  // here instead - the exact delay only needs to be "next tick, after a
  // paint has had a chance to happen," not tied to frame timing.
  //
  // Index 3.4: clearing selection no longer unmounts the focus layer
  // immediately - it flips focusEntered back to false (playing the 450ms
  // return transition) and only clears renderedCountry, actually removing
  // the DOM nodes, once that transition has had time to finish.
  useEffect(() => {
    if (activeCountry) {
      setRenderedCountry(activeCountry);
      setFocusEntered(false);
      const enterTimeout = window.setTimeout(() => setFocusEntered(true), 20);
      return () => window.clearTimeout(enterTimeout);
    }

    setFocusEntered(false);
    const returnTimeout = window.setTimeout(() => {
      // Index 3.4A: this timeout is cancelled by the cleanup function
      // below whenever a new country is selected before it fires - but
      // guard here too in case a new selection lands in the same tick a
      // stale timer was already due to fire (confirmed reproducible:
      // selecting a country shortly after clearing a previous one could
      // otherwise wipe out the newly-selected country's render state).
      if (!activeCountryRef.current) {
        setRenderedCountry(null);
      }
    }, FOCUS_RETURN_MS);
    return () => window.clearTimeout(returnTimeout);
  }, [activeCountry]);

  const [qaCountryIndex, setQaCountryIndex] = useState(0);
  const [qaShowFill, setQaShowFill] = useState(false);
  const [qaShowOutline, setQaShowOutline] = useState(false);
  const [qaOpacity, setQaOpacity] = useState(1);
  const [qaJumpIso, setQaJumpIso] = useState("");
  const [qaNotes, setQaNotes] = useState("");
  const [qaAdjustments, setQaAdjustments] = useState<Record<string, CountryAdjustment>>({});
  const qaCurrent = QA_COUNTRIES[qaCountryIndex];

  function handleQaPrevious(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setQaCountryIndex((i) => (i - 1 + QA_COUNTRIES.length) % QA_COUNTRIES.length);
    setQaNotes("");
  }

  function handleQaNext(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setQaCountryIndex((i) => (i + 1) % QA_COUNTRIES.length);
    setQaNotes("");
  }

  function handleQaJumpToIso(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const target = qaJumpIso.trim().toUpperCase();
    const index = QA_COUNTRIES.findIndex((c) => c.iso2 === target || c.iso3 === target);
    if (index !== -1) {
      setQaCountryIndex(index);
      setQaNotes("");
    }
  }

  function handleQaResetView(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setQaShowFill(false);
    setQaShowOutline(true);
    setQaOpacity(1);
  }

  function handleQaFlagForReview(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setQaAdjustments((current) => {
      const next = { ...current, [qaCurrent.iso3]: { status: "review-required" as const, notes: qaNotes } };
      // No filesystem write access from a static frontend - this is the
      // exact content a reviewer copies into country-adjustments.json by
      // hand. It is never applied to the registry itself.
      console.log("country-adjustments.json:", JSON.stringify(next, null, 2));
      return next;
    });
  }

  // The Calibration Tool's mouse<->canvas conversion (both this function
  // and the crosshair's own screen position below) has to reproduce the
  // exact same "xMidYMid slice" mapping every other Operational Canvas
  // overlay already shares (Index 2.2C) - source content is a 1000x1000
  // square, uniformly scaled up to COVER the viewport (scale = the
  // larger of viewportWidth/1000 and viewportHeight/1000), then centred,
  // so on a landscape viewport the full 0-1000 X range is visible but
  // only a centred WINDOW of the 0-1000 Y range is (and vice versa on a
  // portrait one). The tool's original formula (`y = fraction * 500`)
  // predates that model and always reported the true canvas centre
  // (y=500) as y=250 regardless of viewport shape - confirmed directly
  // against a country whose real transform-origin measured exactly
  // centre-screen (New Zealand, verified via getBoundingClientRect()),
  // reported by a user calibrating against this tool as looking
  // off-centre with "my centre is grid X 500, Y 250".
  function getVisibleCanvasRange(viewportWidth: number, viewportHeight: number) {
    const scale = Math.max(viewportWidth, viewportHeight) / 1000;
    const visibleWidth = viewportWidth / scale;
    const visibleHeight = viewportHeight / scale;
    return {
      xMin: 500 - visibleWidth / 2,
      xMax: 500 + visibleWidth / 2,
      yMin: 500 - visibleHeight / 2,
      yMax: 500 + visibleHeight / 2,
    };
  }

  function handleCalibrationMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const { xMin, xMax, yMin, yMax } = getVisibleCanvasRange(rect.width, rect.height);
    const x = Math.round(xMin + ((event.clientX - rect.left) / rect.width) * (xMax - xMin));
    const y = Math.round(yMin + ((event.clientY - rect.top) / rect.height) * (yMax - yMin));
    setCalibrationPoint({ x, y });
  }

  // Index 3.4: click-outside-to-clear. Every actionable shape (the country
  // hit-zones below, and the focused country's own clipped image) stops
  // propagation on click, so this canvas-level handler only ever fires for
  // clicks that didn't land on anything - i.e. genuinely "outside" any
  // country, focused or not. Every VenueGuard panel (Brief/Communications/
  // Tasks/Task Planning/Layers) and the Alerts panel also stop
  // propagation on their own click, so a click landing here is also
  // genuinely "outside" whichever of those is open - close it the same
  // way Escape already does.
  function handleCanvasClick() {
    if (activeCountry) {
      clearSelection();
    }
    if (activePanel != null) {
      setActivePanel(null);
    }
    if (alertsPanelOpen) {
      setAlertsPanelOpen(false);
    }
    if (SHOW_CANVAS_CALIBRATION && calibrationPoint) {
      console.log("Operational Canvas calibration point:", calibrationPoint);
    }
  }

  return (
    <section
      className="operational-canvas"
      aria-label="Operational Canvas"
      onMouseMove={SHOW_CANVAS_CALIBRATION ? handleCalibrationMove : undefined}
      onClick={handleCanvasClick}
      style={
        {
          // Map Aesthetics Engine (map-aesthetics.ts): single source of
          // truth for the canvas's palette, applied here as custom
          // properties so .operational-canvas and every descendant that
          // reads them (grid stroke, focus rim-light) stay in sync with
          // one constant change instead of edits scattered across files.
          "--map-ocean-centre": MAP_OCEAN_CENTRE,
          "--map-ocean-edge": MAP_OCEAN_EDGE,
          "--map-accent-rgb": MAP_ACCENT_RGB,
          "--map-focus-border-rgb": MAP_FOCUS_BORDER_RGB,
        } as CSSProperties
      }
    >
      {CANVAS_LAYERS.map((layer) => (
        <div
          key={layer.id}
          className={`canvas-layer ${layer.className}`}
          data-layer-number={layer.order}
          data-layer-name={layer.label}
        >
          {layer.className === "base-map-layer" && (
            <img
              className="approved-base-map-image"
              style={getBackgroundFocusStyle(SHOW_COUNTRY_FOCUS_CUTOUT && focusEntered)}
              src="/data/world-map-v17.png"
              alt=""
              draggable={false}
              aria-hidden="true"
            />
          )}
          {layer.className === "operational-layers" && (
            <svg
              className="country-selection-engine"
              viewBox={OPERATIONAL_GEOMETRY_VIEWBOX}
              preserveAspectRatio={OPERATIONAL_GEOMETRY_FIT}
              aria-hidden="true"
            >
              {OPERATIONAL_SELECTABLE_REGIONS.map((region) => (
                <path
                  key={region.id}
                  d={region.svgPath}
                  className="country-hit-zone"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectCountry(region);
                  }}
                />
              ))}
            </svg>
          )}
          {layer.className === "operational-footprint-layer" && SHOW_COUNTRY_FOCUS_CUTOUT && renderedCountry && focusRender && (
            <>
              <div className="country-focus-dim-overlay" style={getDimOverlayStyle(focusEntered)} aria-hidden="true" />
              <svg
                key={renderedCountry.iso3}
                className="country-focus-image-layer"
                viewBox={OPERATIONAL_GEOMETRY_VIEWBOX}
                preserveAspectRatio={OPERATIONAL_GEOMETRY_FIT}
                style={getCountryFocusWrapperStyle(focusEntered)}
                aria-hidden="true"
              >
                <defs>
                  <clipPath id={`country-focus-clip-${renderedCountry.iso3}`} clipPathUnits="userSpaceOnUse">
                    <path d={focusRender.clipPath || renderedCountry.geometry} />
                  </clipPath>
                  {/* "Aurora Glass" fill - a diagonal iridescent gradient,
                      not a flat colour or a patterned texture (see
                      MAP_FOCUS_FILL_GRADIENT_STOPS, map-aesthetics.ts).
                      A gradient is cheap at any scale, so unlike the
                      papermache texture this replaced, it needs no
                      pattern/scale trick and sits directly on the scaled
                      fill path below. */}
                  {focusFillVisible && (
                    <linearGradient id={`country-focus-aurora-${renderedCountry.iso3}`} x1="0" y1="0" x2="1" y2="1">
                      {MAP_FOCUS_FILL_GRADIENT_STOPS.map((stop) => (
                        <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                      ))}
                    </linearGradient>
                  )}
                </defs>
                <image
                  href="/data/world-map-v17.png"
                  x={0}
                  y={0}
                  width={1000}
                  height={1000}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#country-focus-clip-${renderedCountry.iso3})`}
                  onClick={(event) => event.stopPropagation()}
                  style={getCountryFocusImageStyle(focusRender.focusPoint, focusRender.cameraTarget, focusRender.scale, focusEntered)}
                />
                {/* Map Aesthetics Engine: "Aurora Glass" - a diagonal
                    iridescent gradient across the whole selected shape,
                    same clip path/transform as the image above so it
                    moves and scales in lockstep - per explicit direction
                    ("I want the entire country to be painted over" on
                    click). Fully opaque - the map's city lights must not
                    show through. */}
                {focusFillVisible && (
                  <path
                    d={focusRender.clipPath || renderedCountry.geometry}
                    className="country-focus-fill-path"
                    aria-hidden="true"
                    style={{
                      ...getCountryFocusImageStyle(focusRender.focusPoint, focusRender.cameraTarget, focusRender.scale, focusEntered),
                      fill: `url(#country-focus-aurora-${renderedCountry.iso3})`,
                      pointerEvents: "none",
                    }}
                  />
                )}
                {/* Map Aesthetics Engine: dormant until focusBorderVisible
                    is switched on (default from MAP_FOCUS_BORDER_VISIBLE,
                    map-aesthetics.ts; toggleable per session via the
                    Operational Layers panel) - not rendered at all by
                    default, matching Country Focus Engine's original "no
                    border/outline/glow" design (Index 3.3). Ready to trace a
                    rim-light on the exact cutout shape - same clip path and
                    transform as the image above - so it moves and scales in
                    perfect lockstep whenever it's turned on. */}
                {focusBorderVisible && (
                  <path
                    d={focusRender.clipPath || renderedCountry.geometry}
                    className="country-focus-border-path"
                    strokeWidth={MAP_FOCUS_BORDER_WIDTH}
                    aria-hidden="true"
                    style={{
                      ...getCountryFocusImageStyle(focusRender.focusPoint, focusRender.cameraTarget, focusRender.scale, focusEntered),
                      pointerEvents: "none",
                    }}
                  />
                )}
                {/* Major cities (Index 5.1) - reference data only (name +
                    position, from city-registry.ts), not the future
                    presence/office layer discussed with the product owner:
                    that will carry the "we have people here" meaning (and
                    the breathing-glow treatment PROJECT_CONTEXT.md already
                    reserves for operational markers) once it exists, kept
                    deliberately separate from this one rather than
                    conflated into it. Each dot+label carries its own
                    inverse-scale transform (translate to its real position
                    at the outer group's scale, then scale by 1/scale) so
                    it stays a constant screen size regardless of how far a
                    given country has to zoom to fill the Operational Focus
                    Block - the same idea as vector-effect: non-scaling-
                    stroke on the rim-light border above, generalised to a
                    dot+text pair a transform (not a stroke) has to carry. */}
                {majorCitiesVisible && CITY_REGISTRY[renderedCountry.iso3] && (
                  <g
                    style={{
                      ...getCountryFocusImageStyle(focusRender.focusPoint, focusRender.cameraTarget, focusRender.scale, focusEntered),
                      pointerEvents: "none",
                    }}
                    aria-hidden="true"
                  >
                    {selectNonOverlappingCities(
                      getMajorCitiesForDisplay(CITY_REGISTRY[renderedCountry.iso3], renderedCountry.highlightedCity),
                      focusRender.scale,
                      renderedCountry.highlightedCity,
                    ).map((city) => (
                      <g
                        key={`${city.name}-${city.position[0]}-${city.position[1]}`}
                        transform={`translate(${city.position[0]} ${city.position[1]}) scale(${1 / focusRender.scale})`}
                      >
                        <circle r={MAJOR_CITY_DOT_RADIUS} className="major-city-dot" />
                        <text x={MAJOR_CITY_LABEL_OFFSET} y={0} className="major-city-label">
                          {city.name}
                        </text>
                      </g>
                    ))}
                  </g>
                )}
              </svg>
            </>
          )}
          {layer.className === "country-intelligence-layer" && gridVisible && (
            <svg
              className="country-boundary-debug-overlay"
              viewBox={OPERATIONAL_GEOMETRY_VIEWBOX}
              preserveAspectRatio={OPERATIONAL_GEOMETRY_FIT}
              aria-hidden="true"
            >
              {COUNTRY_REGISTRY.map((country) => (
                <path key={country.id} d={country.svgPath} className="country-boundary-debug-path" />
              ))}
            </svg>
          )}
          {layer.className === "country-intelligence-layer" && SHOW_COUNTRY_QA && qaCurrent && (
            <svg
              className="country-qa-overlay"
              viewBox={OPERATIONAL_GEOMETRY_VIEWBOX}
              preserveAspectRatio={OPERATIONAL_GEOMETRY_FIT}
              aria-hidden="true"
              style={{ opacity: qaOpacity }}
            >
              <path
                d={qaCurrent.svgPath}
                className="country-qa-path"
                style={{
                  fill: qaShowFill ? "rgba(255, 196, 87, 0.35)" : "none",
                  stroke: qaShowOutline ? "rgba(255, 196, 87, 0.95)" : "none",
                }}
              />
            </svg>
          )}
        </div>
      ))}

      {showDebugLayerNumbers && (
        <div className="debug-layer-badge-stack" aria-hidden="true">
          {CANVAS_LAYERS.map((layer) => (
            <div key={layer.id} className="debug-layer-badge">
              <span>{layer.order}</span>
              <strong>{layer.label}</strong>
            </div>
          ))}
        </div>
      )}

      {SHOW_CANVAS_CALIBRATION &&
        calibrationPoint &&
        (() => {
          // Exact inverse of handleCalibrationMove's conversion above -
          // same getVisibleCanvasRange, so the crosshair always redraws
          // at the real screen position of the canvas point it reports,
          // instead of the stale fixed 0-500 assumption.
          const { xMin, xMax, yMin, yMax } = getVisibleCanvasRange(window.innerWidth, window.innerHeight);
          const leftPercent = ((calibrationPoint.x - xMin) / (xMax - xMin)) * 100;
          const topPercent = ((calibrationPoint.y - yMin) / (yMax - yMin)) * 100;
          return (
            <div className="canvas-calibration-overlay" aria-hidden="true">
              <div className="canvas-calibration-grid" />
              <div className="canvas-calibration-crosshair-x" style={{ top: `${topPercent}%` }} />
              <div className="canvas-calibration-crosshair-y" style={{ left: `${leftPercent}%` }} />
              <div className="canvas-calibration-readout">
                Canvas X: {calibrationPoint.x}
                <br />
                Canvas Y: {calibrationPoint.y}
              </div>
            </div>
          );
        })()}


      {SHOW_COUNTRY_QA && qaCurrent && (
        <div className="country-qa-panel" onClick={(event) => event.stopPropagation()}>
          <div className="country-qa-panel-row country-qa-panel-title">
            <strong>{qaCurrent.name}</strong>
            <span>{qaCurrent.iso2}</span>
          </div>
          <div className="country-qa-panel-row">
            <span>
              {qaCountryIndex + 1} / {QA_COUNTRIES.length}
            </span>
          </div>
          <div className="country-qa-panel-row">
            <button type="button" onClick={handleQaPrevious}>
              Previous
            </button>
            <button type="button" onClick={handleQaNext}>
              Next
            </button>
          </div>
          <div className="country-qa-panel-row">
            <input
              type="text"
              placeholder="Jump to ISO"
              value={qaJumpIso}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setQaJumpIso(event.target.value)}
            />
            <button type="button" onClick={handleQaJumpToIso}>
              Go
            </button>
          </div>
          <div className="country-qa-panel-row">
            <label>
              <input
                type="checkbox"
                checked={qaShowFill}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setQaShowFill(event.target.checked)}
              />
              Show Fill
            </label>
            <label>
              <input
                type="checkbox"
                checked={qaShowOutline}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setQaShowOutline(event.target.checked)}
              />
              Show Outline
            </label>
          </div>
          <div className="country-qa-panel-row">
            <label>
              Opacity
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={qaOpacity}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setQaOpacity(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="country-qa-panel-row">
            <button type="button" onClick={handleQaResetView}>
              Reset View
            </button>
          </div>

          <div className="country-qa-panel-details">
            <div>ISO2: {qaCurrent.iso2}</div>
            <div>ISO3: {qaCurrent.iso3}</div>
            <div>
              BBox: [{qaCurrent.boundingBox.minX}, {qaCurrent.boundingBox.minY}] - [{qaCurrent.boundingBox.maxX},{" "}
              {qaCurrent.boundingBox.maxY}]
            </div>
            <div>Vertices: {countVertices(qaCurrent.svgPath)}</div>
            <div>Path length: {qaCurrent.svgPath.length} chars</div>
          </div>

          <div className="country-qa-panel-row">
            <input
              type="text"
              placeholder="Review notes"
              value={qaNotes}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setQaNotes(event.target.value)}
            />
            <button type="button" onClick={handleQaFlagForReview}>
              Flag for Review
            </button>
          </div>
          {qaAdjustments[qaCurrent.iso3] && (
            <div className="country-qa-panel-flagged">Flagged: review-required</div>
          )}
        </div>
      )}

      {SHOW_SELECTION_DEBUG && activeCountry && (
        <div className="selection-debug-badge" aria-hidden="true">
          Active Country: {activeCountry.name} / {activeCountry.iso3}
        </div>
      )}

      <div
        className={`brief-panel ${briefPanelOpen ? "brief-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="brief-panel-header">
          <div>
            <p className="brief-panel-eyebrow">Today&apos;s Operational Brief</p>
            <h2 className="brief-panel-title">Here&apos;s what&apos;s happening around you.</h2>
          </div>
          <button
            type="button"
            className="brief-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Operational Brief"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
        </button>

        <div className="brief-panel-stats">
          <div className="brief-panel-stat">
            <MapPin className="w-4 h-4 text-sky-300" />
            <p className="brief-panel-stat-label">Current Area</p>
            <p className="brief-panel-stat-value">{briefArea.area}</p>
            <p className="brief-panel-stat-note">{briefArea.areaRadius}</p>
            <button
              type="button"
              onClick={onUseMyLocationForBrief}
              disabled={locatingBrief}
              className="brief-panel-locate-btn"
            >
              {locatingBrief ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
              Use my current location
            </button>
          </div>
          <div className="brief-panel-stat">
            <ShieldCheck className="w-4 h-4 text-amber-300" />
            <p className="brief-panel-stat-label">Operating Conditions</p>
            <p className="brief-panel-stat-value">{briefCondition.condition}</p>
            <p className="brief-panel-stat-note">{briefCondition.conditionNote}</p>
          </div>
          <div className="brief-panel-stat">
            <Car className="w-4 h-4 text-amber-300" />
            <p className="brief-panel-stat-label">Traffic</p>
            <p className="brief-panel-stat-value">{briefTraffic.traffic}</p>
            <p className="brief-panel-stat-note">{briefTraffic.trafficNote}</p>
          </div>
          <div className="brief-panel-stat">
            <Clock className="w-4 h-4 text-sky-300" />
            <p className="brief-panel-stat-label">Updated</p>
            <p className="brief-panel-stat-value">{OPERATIONAL_BRIEF.updated}</p>
            <p className="brief-panel-stat-note">{OPERATIONAL_BRIEF.updatedNote}</p>
          </div>
        </div>

        <div className="brief-panel-section">
          <h3>Operations Summary</h3>
          <p>{OPERATIONAL_BRIEF.summary}</p>
        </div>

        <div className="brief-panel-section">
          <h3>Area Advisories</h3>
          <div className="brief-panel-advisories">
            {OPERATIONAL_BRIEF.advisories.map((item) => (
              <div key={item} className="brief-panel-advisory">
                <AlertCircle className="w-4 h-4 text-amber-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`communications-panel ${communicationsPanelOpen ? "communications-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tasks-panel-header">
          <div>
            <p className="tasks-panel-eyebrow">Communications</p>
            <h2 className="tasks-panel-title">Instructions from your Manager.</h2>
          </div>
          <button
            type="button"
            className="tasks-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Communications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
        </button>

        <div className="tasks-panel-list">
          {DEMO_INSTRUCTIONS.map((instruction) => (
            <div key={instruction.id} className="task-row">
              <p className="task-row-title">{instruction.message}</p>
              <p className="task-row-assigned-by">{instruction.from} · {instruction.sentAt}</p>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`tasks-panel ${tasksPanelOpen ? "tasks-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tasks-panel-header">
          <div>
            <p className="tasks-panel-eyebrow">Tasks</p>
            <h2 className="tasks-panel-title">Tasks</h2>
          </div>
          <button
            type="button"
            className="tasks-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Tasks"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
        </button>

        {cpoTasksLoading ? (
          <p className="tasks-panel-empty">Loading tasks…</p>
        ) : (
          <div className="tasks-panel-list">
            {displayedTasks.map((task) => {
              const response = taskAcceptance[task.id] ?? "pending";
              return (
                <div key={task.id} className="task-row">
                  <div className="task-row-header">
                    <p className="task-row-title">{task.title}</p>
                    {task.dueDate && <span className="task-row-due">Due {new Date(task.dueDate).toLocaleDateString()}</span>}
                  </div>
                  {task.venueName && <p className="task-row-venue">{task.venueName}</p>}
                  {task.assignedByName && <p className="task-row-assigned-by">Assigned by {task.assignedByName}</p>}

                  {response === "pending" ? (
                    <div className="task-row-response">
                      <button
                        type="button"
                        className="task-response-btn task-response-accept"
                        onClick={() => respondToTask(task.id, "accepted")}
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        type="button"
                        className="task-response-btn task-response-decline"
                        onClick={() => respondToTask(task.id, "declined")}
                      >
                        <X className="w-3.5 h-3.5" /> Decline
                      </button>
                    </div>
                  ) : (
                    <p className={`task-row-response-status task-row-response-status-${response}`}>
                      {response === "accepted" ? "Accepted - see Task Planning" : "Declined"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        className={`task-planning-panel ${taskPlanningPanelOpen ? "task-planning-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tasks-panel-header">
          <div>
            <p className="tasks-panel-eyebrow">Task Planning</p>
            <h2 className="tasks-panel-title">Pre-op readiness checklist</h2>
          </div>
          <button
            type="button"
            className="tasks-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Task Planning"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
        </button>

        {displayedTasks.length > 1 && (
          <div className="tasks-panel-viewing-as">
            <label htmlFor="task-planning-select">Task</label>
            <select
              id="task-planning-select"
              value={planningTaskId ?? ""}
              onChange={(event) => setPlanningTaskId(Number(event.target.value))}
            >
              {displayedTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}

        {planningTaskId == null ? (
          <p className="tasks-panel-empty">No tasks to plan yet.</p>
        ) : planLoadingTaskId === planningTaskId ? (
          <p className="tasks-panel-empty">Loading…</p>
        ) : taskPlans[planningTaskId] ? (
          taskPlans[planningTaskId].submittedAt ? (
            // Once submitted, the checklist is locked - a Manager owns
            // it from here, so it collapses into a single closed
            // summary rather than staying open/re-editable/
            // re-submittable from the CPO's side.
            <div className="task-plan-locked">
              <ClipboardCheck className="w-5 h-5" />
              <p className="task-plan-locked-title">Checklist submitted</p>
              <p className="task-plan-locked-note">
                Submitted {new Date(taskPlans[planningTaskId].submittedAt as string).toLocaleString()}
              </p>
            </div>
          ) : (
            <>
              <div className="task-plan-checklist">
                {taskPlans[planningTaskId].checklist.map((item) => (
                  <label key={item.key} className="task-plan-checklist-item">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) =>
                        toggleChecklistItem(planningTaskId, taskPlans[planningTaskId].id, item.key, event.target.checked)
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>

              <div className="task-plan-submit">
                <button
                  type="button"
                  className="task-plan-submit-btn"
                  onClick={() => submitPlan(planningTaskId, taskPlans[planningTaskId].id)}
                  disabled={submittingPlanTaskId === planningTaskId}
                >
                  {submittingPlanTaskId === planningTaskId ? "Submitting…" : "Submit to Manager"}
                </button>
              </div>
            </>
          )
        ) : (
          <p className="tasks-panel-empty">Couldn&apos;t load plan.</p>
        )}
      </div>

      <div
        className={`risk-assessments-panel ${riskAssessmentsPanelOpen ? "risk-assessments-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tasks-panel-header">
          <div>
            <p className="tasks-panel-eyebrow">Risk Assessments</p>
            <h2 className="tasks-panel-title">
              {riskAssessmentsView === "venues"
                ? "Venues"
                : riskAssessmentsView === "assessment"
                  ? "Risk Assessment"
                  : "Risk Assessments"}
            </h2>
          </div>
          <button
            type="button"
            className="tasks-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Risk Assessments"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {riskAssessmentsView === "root" && (
          <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
          </button>
        )}

        {riskAssessmentsView === "root" ? (
          <div className="tasks-panel-list">
            <button
              type="button"
              className="risk-assessments-nav-item"
              onClick={() => setRiskAssessmentsView("venues")}
            >
              <Building2 className="w-4 h-4" />
              Venues
              <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
            </button>
          </div>
        ) : riskAssessmentsView === "venues" ? (
          <>
            <button
              type="button"
              className="venueguard-panel-back"
              onClick={() => setRiskAssessmentsView("root")}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Risk Assessments
            </button>

            {acceptedTasksList.length === 0 ? (
              <p className="tasks-panel-empty">No venues yet - accept a task to get started.</p>
            ) : (
              <div className="tasks-panel-list">
                {acceptedTasksList.map((task) => {
                  const isExpanded = expandedVenueIds.has(task.id);
                  const slots = taskAssessments[task.id] ?? [];
                  const slotsLoading = taskAssessmentsLoading[task.id];
                  return (
                    <div key={task.id} className="risk-assessments-venue-group">
                      <button
                        type="button"
                        className="risk-assessments-nav-item"
                        onClick={() => toggleVenueExpanded(task.id)}
                      >
                        <Building2 className="w-4 h-4" />
                        {task.venueName ?? task.title}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 risk-assessments-nav-item-chevron" />
                        ) : (
                          <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
                        )}
                      </button>
                      {isExpanded && (
                        <>
                          <div className="risk-assessments-venue-detail">
                            <p className="risk-assessments-venue-detail-label">
                              <ClipboardList className="w-3.5 h-3.5" /> Task
                            </p>
                            <p className="task-row-title">{task.title}</p>
                          </div>

                          <div className="risk-assessments-venue-detail">
                            <p className="risk-assessments-venue-detail-label">
                              <ClipboardCheck className="w-3.5 h-3.5" /> Risk Assessments
                            </p>
                            {slotsLoading ? (
                              <p className="tasks-panel-empty">Loading…</p>
                            ) : slots.length === 0 ? (
                              <p className="tasks-panel-empty">No assessments yet.</p>
                            ) : (
                              slots.map((slot, index) => (
                                <button
                                  key={slot.id}
                                  type="button"
                                  className="risk-assessments-nav-item"
                                  onClick={() => openVenueAssessment(task.id, slot.id)}
                                >
                                  <ClipboardCheck className="w-4 h-4" />
                                  {slot.location.trim() || `Assessment ${index + 1}`}
                                  <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
                                </button>
                              ))
                            )}
                          </div>

                          {task.status !== "completed" && (
                            <button
                              type="button"
                              className="venue-assessment-add-btn"
                              onClick={() => addAssessmentSlot(task.id)}
                              disabled={creatingAssessmentTaskId === task.id}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {creatingAssessmentTaskId === task.id
                                ? "Adding…"
                                : slots.length === 0
                                  ? "Add Assessment"
                                  : "Add Another Assessment"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <VenueRiskAssessmentForm
            task={displayedTasks.find((t) => t.id === assessingTaskId) ?? null}
            assessment={currentAssessment}
            form={assessmentForm}
            loading={assessmentLoading}
            error={assessmentError}
            actionError={assessmentActionError}
            saving={savingAssessment}
            submitting={submittingAssessment}
            onBack={backToVenuesFromAssessment}
            onFieldChange={updateAssessmentField}
            onSave={saveAssessment}
            onSubmit={submitAssessment}
          />
        )}
      </div>

      <div
        className={`route-planning-panel ${routePlanningPanelOpen ? "route-planning-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tasks-panel-header">
          <div>
            <p className="tasks-panel-eyebrow">Route Planning</p>
            <h2 className="tasks-panel-title">Route Planning</h2>
          </div>
          <button
            type="button"
            className="tasks-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Route Planning"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
        </button>

        {acceptedTasksList.length === 0 ? (
          <p className="tasks-panel-empty">No tasks yet - accept a task to get started.</p>
        ) : (
          <div className="tasks-panel-list">
            {acceptedTasksList.map((task) => {
              const isExpanded = expandedRouteTaskIds.has(task.id);
              const slots = taskRoutesMap[task.id] ?? [];
              const slotsLoading = taskRoutesLoading[task.id];
              return (
                <div key={task.id} className="risk-assessments-venue-group">
                  <button
                    type="button"
                    className="risk-assessments-nav-item"
                    onClick={() => toggleRouteTaskExpanded(task.id)}
                  >
                    <Building2 className="w-4 h-4" />
                    {task.venueName ?? task.title}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 risk-assessments-nav-item-chevron" />
                    ) : (
                      <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
                    )}
                  </button>
                  {isExpanded && (
                    <>
                      <div className="risk-assessments-venue-detail">
                        <p className="risk-assessments-venue-detail-label">
                          <ClipboardList className="w-3.5 h-3.5" /> Task
                        </p>
                        <p className="task-row-title">{task.title}</p>
                      </div>

                      {slotsLoading ? (
                        <p className="tasks-panel-empty">Loading…</p>
                      ) : slots.length === 0 ? (
                        <p className="tasks-panel-empty">No routes yet.</p>
                      ) : (
                        slots.map((route, index) => (
                          <TaskRouteSlotCard
                            key={route.id}
                            route={route}
                            index={index}
                            venues={venues}
                            taskVenueId={task.venueId > 0 ? task.venueId : null}
                            onUpdatePoint={updateRoutePoint}
                            onCalculate={calculateRoute}
                            calculating={calculatingRouteId === route.id}
                            calcError={routeCalcErrors[route.id] ?? null}
                          />
                        ))
                      )}

                      {task.status !== "completed" && (
                        <button
                          type="button"
                          className="venue-assessment-add-btn"
                          onClick={() => addRouteSlot(task.id)}
                          disabled={creatingRouteTaskId === task.id}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {creatingRouteTaskId === task.id ? "Adding…" : slots.length === 0 ? "Add Route" : "Add Another Route"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        className={`download-task-panel ${downloadTaskPanelOpen ? "download-task-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tasks-panel-header">
          <div>
            <p className="tasks-panel-eyebrow">Download Task</p>
            <h2 className="tasks-panel-title">Download Task</h2>
          </div>
          <button
            type="button"
            className="tasks-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Download Task"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
        </button>

        {acceptedTasksList.length === 0 ? (
          <p className="tasks-panel-empty">No tasks yet - accept a task to get started.</p>
        ) : (
          <div className="tasks-panel-list">
            {acceptedTasksList.map((task) => (
              <div key={task.id} className="download-task-row">
                <div className="download-task-row-text">
                  <p className="task-row-title">{task.title}</p>
                  {task.venueName && <p className="task-row-venue">{task.venueName}</p>}
                </div>
                {task.id === MOCK_TASK_ID ? (
                  <span className="download-task-row-disabled-note">Accept a real task to download.</span>
                ) : (
                  <div className="download-task-row-actions">
                    <a
                      className="venue-assessment-add-btn"
                      href={`/api/tasks/${task.id}/download?preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Review
                    </a>
                    <a className="venue-assessment-add-btn" href={`/api/tasks/${task.id}/download`} download>
                      <Download className="w-3.5 h-3.5" />
                      Download PDF
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className={`layers-panel ${layersPanelOpen ? "layers-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="layers-panel-header">
          <div>
            <p className="layers-panel-eyebrow">Operational Layers</p>
            <h2 className="layers-panel-title">What&apos;s currently on the map.</h2>
          </div>
          <button
            type="button"
            className="layers-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Operational Layers"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button type="button" className="venueguard-panel-back" onClick={backToMenu}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
        </button>

        <div className="layers-panel-list">
          <div className="layer-row">
            <div className="layer-row-text">
              <p className="layer-row-label">Base Map</p>
              <p className="layer-row-description">Night-lights satellite image. Always on.</p>
            </div>
            <span className="layer-row-fixed-tag">Fixed</span>
          </div>

          <div className="layer-row">
            <div className="layer-row-text">
              <p className="layer-row-label">Major Cities</p>
              <p className="layer-row-description">Name and dot for each selected country&apos;s largest cities.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={majorCitiesVisible}
              aria-label="Toggle Major Cities layer"
              className={`layer-toggle ${majorCitiesVisible ? "layer-toggle-on" : ""}`}
              onClick={() => setMajorCitiesVisible((visible) => !visible)}
            >
              <span className="layer-toggle-thumb" />
            </button>
          </div>

          <div className="layer-row">
            <div className="layer-row-text">
              <p className="layer-row-label">Country Focus Fill</p>
              <p className="layer-row-description">Aurora Glass gradient painted over the selected country.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={focusFillVisible}
              aria-label="Toggle Country Focus Fill layer"
              className={`layer-toggle ${focusFillVisible ? "layer-toggle-on" : ""}`}
              onClick={() => setFocusFillVisible((visible) => !visible)}
            >
              <span className="layer-toggle-thumb" />
            </button>
          </div>

          <div className="layer-row">
            <div className="layer-row-text">
              <p className="layer-row-label">Country Focus Border</p>
              <p className="layer-row-description">Rim-light outline traced around the selected country.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={focusBorderVisible}
              aria-label="Toggle Country Focus Border layer"
              className={`layer-toggle ${focusBorderVisible ? "layer-toggle-on" : ""}`}
              onClick={() => setFocusBorderVisible((visible) => !visible)}
            >
              <span className="layer-toggle-thumb" />
            </button>
          </div>

          <div className="layer-row">
            <div className="layer-row-text">
              <p className="layer-row-label">Country Boundary Grid</p>
              <p className="layer-row-description">Thin outline across every country border on the base map.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={gridVisible}
              aria-label="Toggle Country Boundary Grid layer"
              className={`layer-toggle ${gridVisible ? "layer-toggle-on" : ""}`}
              onClick={() => setGridVisible((visible) => !visible)}
            >
              <span className="layer-toggle-thumb" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`alerts-panel ${alertsPanelOpen ? "alerts-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="alerts-panel-header">
          <div>
            <p className="alerts-panel-eyebrow">Active Alerts</p>
            <h2 className="alerts-panel-title">Events affecting your operations.</h2>
          </div>
          <button
            type="button"
            className="alerts-panel-close"
            onClick={() => setAlertsPanelOpen(false)}
            aria-label="Close Alerts"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="alerts-panel-list">
          {combinedAlerts.length === 0 ? (
            <p className="tasks-panel-empty">No active alerts.</p>
          ) : (
            combinedAlerts.map((alert) => {
              const SeverityIcon = ALERT_SEVERITY_ICON[alert.severity];
              return (
                <div
                  key={alert.id}
                  className={`alert-item alert-item-${alert.severity} ${alert.reviewed ? "alert-item-reviewed" : ""}`}
                >
                  <SeverityIcon className="w-4 h-4 alert-item-icon" />
                  <div className="alert-item-body">
                    <div className="alert-item-title-row">
                      <p className="alert-item-title">{alert.title}</p>
                      {alert.reviewed && <span className="alert-item-reviewed-badge">Reviewed</span>}
                    </div>
                    <p className="alert-item-description">{alert.description}</p>
                    <p className="alert-item-meta">
                      {alert.location} &middot; {alert.timestamp}
                    </p>
                    <div className="alert-item-actions">
                      {!alert.reviewed && (
                        <button
                          type="button"
                          className="alert-item-action-btn"
                          onClick={() => markAlertReviewed(alert)}
                        >
                          <Check className="w-3 h-3" /> Mark Reviewed
                        </button>
                      )}
                      <button
                        type="button"
                        className="alert-item-action-btn alert-item-action-btn-dismiss"
                        onClick={() => dismissAlert(alert)}
                      >
                        <X className="w-3 h-3" /> Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div
        className={`profile-panel ${profilePanelOpen ? "profile-panel-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="profile-panel-header">
          <div>
            <p className="profile-panel-eyebrow">Profile</p>
            <h2 className="profile-panel-title">
              {profileView === "root" ? "Your account." : PROFILE_VIEW_TITLES[profileView]}
            </h2>
          </div>
          <button
            type="button"
            className="profile-panel-close"
            onClick={() => setActivePanel(null)}
            aria-label="Close Profile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {profileView === "root" && (
          <button type="button" className="venueguard-panel-back" onClick={backToOperatorMenu}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
          </button>
        )}

        {profileView === "root" ? (
          <div className="tasks-panel-list">
            <button type="button" className="risk-assessments-nav-item" onClick={() => setProfileView("overview")}>
              <LayoutDashboard className="w-4 h-4" />
              Overview
              <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
            </button>
            <button type="button" className="risk-assessments-nav-item" onClick={() => setProfileView("account")}>
              <UserIcon className="w-4 h-4" />
              Account Details
              <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
            </button>
            <button type="button" className="risk-assessments-nav-item" onClick={() => setProfileView("expenses")}>
              <Wallet className="w-4 h-4" />
              Expenses
              <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
            </button>
            <button type="button" className="risk-assessments-nav-item" onClick={() => setProfileView("timesheet")}>
              <Clock className="w-4 h-4" />
              Timesheet
              <ChevronRight className="w-4 h-4 risk-assessments-nav-item-chevron" />
            </button>
          </div>
        ) : (
          <>
            <button type="button" className="venueguard-panel-back" onClick={() => setProfileView("root")}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Profile
            </button>
            {profileView === "timesheet" ? (
              <TimesheetCalendar
                entries={timesheetEntries}
                loading={timesheetLoading}
                month={timesheetMonth}
                onChangeMonth={setTimesheetMonth}
                selectedDate={selectedTimesheetDate}
                onSelectDate={selectTimesheetDate}
                hoursInput={timesheetHoursInput}
                notesInput={timesheetNotesInput}
                onHoursChange={setTimesheetHoursInput}
                onNotesChange={setTimesheetNotesInput}
                onSave={saveTimesheetEntry}
                onDelete={deleteTimesheetEntry}
                saving={savingTimesheetEntry}
                deleting={deletingTimesheetEntry}
                noOperator={profileUserId == null}
              />
            ) : (
              <p className="tasks-panel-empty">Coming soon.</p>
            )}
          </>
        )}
      </div>

      {renderedCountry && countryPanelData && (
        <div
          className={`country-panel ${focusEntered ? "country-panel-open" : ""} ${
            focusEntered && alertsPanelOpen ? "country-panel-shifted" : ""
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="country-panel-header">
            <div>
              <p className="country-panel-eyebrow">Country Intelligence</p>
              <h2 className="country-panel-title">{renderedCountry.name}</h2>
              <p className="country-panel-iso">
                {renderedCountry.iso2} &middot; {renderedCountry.iso3}
              </p>
            </div>
            <button
              type="button"
              className="country-panel-close"
              onClick={() => clearSelection()}
              aria-label="Close Country Intelligence"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="country-panel-search"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setCitySearchOpen(false);
            }}
          >
            <Search className="w-4 h-4 country-panel-search-icon" />
            <input
              type="text"
              className="country-panel-search-input"
              placeholder={`Search cities in ${renderedCountry.name}...`}
              value={citySearchQuery}
              onChange={(event) => {
                setCitySearchQuery(event.target.value);
                setCitySearchOpen(true);
              }}
              onFocus={() => setCitySearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setCitySearchOpen(false);
                  event.currentTarget.blur();
                } else if (event.key === "Enter" && countryCitySearchResults.length > 0) {
                  selectCountryPanelCity(countryCitySearchResults[0]);
                }
              }}
            />
            {citySearchOpen && citySearchQuery.trim() && (
              <div className="country-panel-search-results">
                {countryCitySearchResults.length === 0 ? (
                  <div className="country-panel-search-empty">No matches for &quot;{citySearchQuery.trim()}&quot;</div>
                ) : (
                  countryCitySearchResults.map((city) => (
                    <button
                      key={`${city.name}-${city.position[0]}-${city.position[1]}`}
                      type="button"
                      className="country-panel-search-result"
                      onClick={() => selectCountryPanelCity(city)}
                    >
                      <MapPin className="w-4 h-4 country-panel-search-result-icon" />
                      <span className="country-panel-search-result-name">{city.name}</span>
                      {city.capital && <span className="country-panel-search-result-meta">Capital</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <span
            className={`country-panel-risk-badge ${
              countryIntelligenceLoading
                ? "country-panel-risk-loading"
                : `country-panel-risk-${countryIntelligence?.riskRating.level ?? "unrated"}`
            }`}
          >
            {countryIntelligenceLoading ? "Checking…" : COUNTRY_RISK_LABELS[countryIntelligence?.riskRating.level ?? "unrated"]}
          </span>

          {!countryIntelligenceLoading && countryIntelligence && countryIntelligence.riskRating.drivers.length > 0 && (
            <p className="country-panel-risk-drivers">Driven by {countryIntelligence.riskRating.drivers.join(" · ")}</p>
          )}

          <div className="country-panel-stats">
            <div className="country-panel-stat">
              <p className="country-panel-stat-label">Capital</p>
              <p className="country-panel-stat-value">{countryPanelData.capital ?? "Not tracked"}</p>
            </div>
            <div className="country-panel-stat">
              <p className="country-panel-stat-label">Cities Tracked</p>
              <p className="country-panel-stat-value">{countryPanelData.cityCount}</p>
            </div>
            <div className="country-panel-stat">
              <p className="country-panel-stat-label">Presence</p>
              <p className="country-panel-stat-value">None recorded</p>
            </div>
          </div>

          <div className="country-panel-section">
            <h3 className="country-panel-section-title">Travel Advisories</h3>
            {countryIntelligenceLoading ? (
              <p className="country-panel-section-empty">Checking US government sources…</p>
            ) : countryIntelligence?.travelAdvisories.us ? (
              <div className="country-panel-advisories">
                <a
                  href={countryIntelligence.travelAdvisories.us.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="country-panel-advisory"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="country-panel-advisory-source">US State Department</span>
                  <span className="country-panel-advisory-text">
                    {countryIntelligence.travelAdvisories.us.label ?? `Level ${countryIntelligence.travelAdvisories.us.level}`}
                    {countryIntelligence.travelAdvisories.us.advisoryDate && (
                      <span className="country-panel-advisory-date"> · as of {countryIntelligence.travelAdvisories.us.advisoryDate}</span>
                    )}
                  </span>
                </a>
              </div>
            ) : (
              <p className="country-panel-section-empty">No government travel advisory on file for {renderedCountry.name}.</p>
            )}
          </div>

          <div className="country-panel-section">
            <div className="country-panel-section-header">
              <h3 className="country-panel-section-title">Public Health</h3>
              {!countryIntelligenceLoading && countryIntelligence && (
                <span className={`country-panel-health-badge country-panel-health-${countryIntelligence.health.rating}`}>
                  {HEALTH_RATING_LABELS[countryIntelligence.health.rating]}
                </span>
              )}
            </div>
            {countryIntelligenceLoading ? (
              <p className="country-panel-section-empty">Checking CDC travel health notices…</p>
            ) : countryIntelligence && countryIntelligence.health.notices.length > 0 ? (
              <div className="country-panel-advisories">
                {countryIntelligence.health.notices.map((notice) => (
                  <a
                    key={notice.sourceUrl}
                    href={notice.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="country-panel-advisory"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="country-panel-advisory-text">{notice.title}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="country-panel-section-empty">No active CDC travel health notices for {renderedCountry.name}.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
