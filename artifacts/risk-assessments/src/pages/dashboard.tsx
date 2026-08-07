import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle, AlertTriangle, Info, ClipboardList, Bell, X } from "lucide-react";
import { COUNTRY_REGISTRY } from "@/lib/country-registry";
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
}

// Mock feed for the Alerts panel (OperationalCanvas) - distinct from the
// daily Operational Brief: alerts are individual, timestamped events
// rather than a single standing summary.
const OPERATIONAL_ALERTS: OperationalAlert[] = [
  {
    id: "alert-1",
    severity: "critical",
    title: "Crowd density threshold exceeded",
    description: "Entrance queue has surpassed planned capacity for the current time slot.",
    location: "Cape Town",
    timestamp: "4 min ago",
  },
  {
    id: "alert-2",
    severity: "warning",
    title: "Severe weather advisory issued",
    description: "Local authority has issued a wind advisory affecting outdoor operations.",
    location: "Cape Town",
    timestamp: "22 min ago",
  },
  {
    id: "alert-3",
    severity: "warning",
    title: "Road closure near venue",
    description: "A planned closure may affect arrival routes for staff and vendors.",
    location: "Cape Town",
    timestamp: "1 hr ago",
  },
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

// Country Intelligence panel (OperationalCanvas) - mock risk data, since
// no real per-country risk feed exists yet. Deterministic per ISO3 (not
// random) so a given country always shows the same level across visits,
// rather than fabricating the appearance of live intelligence.
const COUNTRY_RISK_LEVELS = ["Low", "Moderate", "Elevated"] as const;
type CountryRiskLevel = (typeof COUNTRY_RISK_LEVELS)[number];

const COUNTRY_RISK_ADVISORIES: Record<CountryRiskLevel, string[]> = {
  Low: ["No active advisories", "Standard monitoring in effect"],
  Moderate: ["Periodic monitoring recommended", "Review local advisories before deployment"],
  Elevated: [
    "Enhanced due-diligence recommended",
    "Review local advisories before deployment",
    "Coordinate with regional lead before travel",
  ],
};

function getCountryRiskLevel(iso3: string): CountryRiskLevel {
  let hash = 0;
  for (let i = 0; i < iso3.length; i++) hash = (hash * 31 + iso3.charCodeAt(i)) >>> 0;
  return COUNTRY_RISK_LEVELS[hash % COUNTRY_RISK_LEVELS.length];
}

export default function Dashboard() {
  const [step, setStep] = useState<Step>("login");

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

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <MapPin className="w-5 h-5 text-sky-300 mb-4" />
              <p className="text-sm text-slate-400">Current Area</p>
              <p className="text-xl font-semibold">{OPERATIONAL_BRIEF.area}</p>
              <p className="text-sm text-slate-400 mt-1">{OPERATIONAL_BRIEF.areaRadius}</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <ShieldCheck className="w-5 h-5 text-amber-300 mb-4" />
              <p className="text-sm text-slate-400">Current Operating Conditions</p>
              <p className="text-xl font-semibold">{OPERATIONAL_BRIEF.condition}</p>
              <p className="text-sm text-slate-400 mt-1">{OPERATIONAL_BRIEF.conditionNote}</p>
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
    <div className="fixed inset-0 z-50 overflow-hidden text-white" style={{ backgroundColor: OCEAN_COLOR }}>
      <OperationalCanvas />
    </div>
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
// this debug view), only the outline rendering is gated. Visibility now
// owned by the Map Aesthetics Engine (map-aesthetics.ts) - the grid this
// produces across all 235 countries was never meant to ship visible.
const SHOW_COUNTRY_BOUNDARIES = MAP_GRID_VISIBLE;

// Country Boundary QA Mode (Index 2.2) - a product verification tool, not
// a development feature: lets a reviewer step through COUNTRY_REGISTRY
// one country at a time to visually confirm each boundary against the
// approved base map. Separate from SHOW_COUNTRY_BOUNDARIES (Index 2.1,
// which still draws every country at once) - this shows exactly one, so
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
const SHOW_SELECTION_DEBUG = true;

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
const SHOW_MAJOR_CITIES = true;
const MAJOR_CITY_DOT_RADIUS = 2.2;
const MAJOR_CITY_LABEL_OFFSET = 4.5;
const MAJOR_CITY_LABEL_MIN_SEPARATION_PX = 46;

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
function selectNonOverlappingCities(cities: CityDefinition[], focusScale: number): CityDefinition[] {
  const pxPerUnit = (Math.max(window.innerWidth, window.innerHeight) / 1000) * focusScale;
  const ordered = [...cities].sort((a, b) => {
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

function OperationalCanvas() {
  const showDebugLayerNumbers = false;
  const [calibrationPoint, setCalibrationPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeCountry, setActiveCountry] = useState<ActiveCountry | null>(null);
  // Operational Brief panel - recalls the same Operational Brief content
  // shown at the mandatory pre-entry gate, on demand, inside the
  // Operations Centre. Additive only: the pre-entry gate (step === "brief"
  // in Dashboard) still runs unchanged, per the Product Constitution's
  // Product Promise. Non-modal by design - no dimming overlay - so the
  // map stays the primary focus while the panel is open.
  const [briefPanelOpen, setBriefPanelOpen] = useState(false);
  // Alerts panel - individual timestamped events, distinct from the
  // standing Operational Brief. Slides from the opposite edge (right) so
  // the two panels never compete for the same screen space.
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
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

  // Country Intelligence panel content - real data (capital/city count)
  // where the City Registry has it, mock risk data otherwise (see
  // getCountryRiskLevel above).
  const countryPanelData = useMemo(() => {
    if (!renderedCountry) return null;
    const cities = CITY_REGISTRY[renderedCountry.iso3] ?? [];
    const capital = cities.find((city) => city.capital)?.name ?? null;
    const riskLevel = getCountryRiskLevel(renderedCountry.iso3);
    return { capital, cityCount: cities.length, riskLevel, advisories: COUNTRY_RISK_ADVISORIES[riskLevel] };
  }, [renderedCountry]);

  useEffect(() => {
    subscribe(setActiveCountry);
    return () => unsubscribe(setActiveCountry);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (alertsPanelOpen) {
        setAlertsPanelOpen(false);
        return;
      }
      if (briefPanelOpen) {
        setBriefPanelOpen(false);
        return;
      }
      clearSelection();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [briefPanelOpen, alertsPanelOpen]);

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
  // country, focused or not.
  function handleCanvasClick() {
    if (activeCountry) {
      clearSelection();
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
                  {MAP_FOCUS_FILL_VISIBLE && (
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
                {MAP_FOCUS_FILL_VISIBLE && (
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
                {/* Map Aesthetics Engine: dormant until MAP_FOCUS_BORDER_VISIBLE
                    is switched on (map-aesthetics.ts) - not rendered at all
                    by default, matching Country Focus Engine's original "no
                    border/outline/glow" design (Index 3.3). Ready to trace a
                    rim-light on the exact cutout shape - same clip path and
                    transform as the image above - so it moves and scales in
                    perfect lockstep whenever it's turned on. */}
                {MAP_FOCUS_BORDER_VISIBLE && (
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
                {SHOW_MAJOR_CITIES && CITY_REGISTRY[renderedCountry.iso3] && (
                  <g
                    style={{
                      ...getCountryFocusImageStyle(focusRender.focusPoint, focusRender.cameraTarget, focusRender.scale, focusEntered),
                      pointerEvents: "none",
                    }}
                    aria-hidden="true"
                  >
                    {selectNonOverlappingCities(CITY_REGISTRY[renderedCountry.iso3], focusRender.scale).map((city) => (
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
          {layer.className === "country-intelligence-layer" && SHOW_COUNTRY_BOUNDARIES && (
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

      <button
        type="button"
        className="brief-panel-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setBriefPanelOpen((open) => !open);
        }}
      >
        <ClipboardList className="w-4 h-4" />
        Operational Brief
      </button>

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
            onClick={() => setBriefPanelOpen(false)}
            aria-label="Close Operational Brief"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="brief-panel-stats">
          <div className="brief-panel-stat">
            <MapPin className="w-4 h-4 text-sky-300" />
            <p className="brief-panel-stat-label">Current Area</p>
            <p className="brief-panel-stat-value">{OPERATIONAL_BRIEF.area}</p>
            <p className="brief-panel-stat-note">{OPERATIONAL_BRIEF.areaRadius}</p>
          </div>
          <div className="brief-panel-stat">
            <ShieldCheck className="w-4 h-4 text-amber-300" />
            <p className="brief-panel-stat-label">Operating Conditions</p>
            <p className="brief-panel-stat-value">{OPERATIONAL_BRIEF.condition}</p>
            <p className="brief-panel-stat-note">{OPERATIONAL_BRIEF.conditionNote}</p>
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

      <button
        type="button"
        className="alerts-panel-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setAlertsPanelOpen((open) => !open);
        }}
      >
        <Bell className="w-4 h-4" />
        Alerts
        {OPERATIONAL_ALERTS.length > 0 && <span className="alerts-panel-trigger-badge">{OPERATIONAL_ALERTS.length}</span>}
      </button>

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
          {OPERATIONAL_ALERTS.map((alert) => {
            const SeverityIcon = ALERT_SEVERITY_ICON[alert.severity];
            return (
              <div key={alert.id} className={`alert-item alert-item-${alert.severity}`}>
                <SeverityIcon className="w-4 h-4 alert-item-icon" />
                <div className="alert-item-body">
                  <p className="alert-item-title">{alert.title}</p>
                  <p className="alert-item-description">{alert.description}</p>
                  <p className="alert-item-meta">
                    {alert.location} &middot; {alert.timestamp}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {renderedCountry && countryPanelData && (
        <div
          className={`country-panel ${focusEntered ? "country-panel-open" : ""}`}
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
            <div className="country-panel-header-right">
              <span className={`country-panel-risk-badge country-panel-risk-${countryPanelData.riskLevel.toLowerCase()}`}>
                {countryPanelData.riskLevel} Risk
              </span>
              <button
                type="button"
                className="country-panel-close"
                onClick={() => clearSelection()}
                aria-label="Close Country Intelligence"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

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

          <p className="country-panel-summary">
            No prior operational history recorded for {renderedCountry.name}. Baseline intelligence sources only
            &mdash; monitoring initiated on selection.
          </p>

          <div className="country-panel-advisories">
            {countryPanelData.advisories.map((item) => (
              <div key={item} className="country-panel-advisory">
                {item}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
