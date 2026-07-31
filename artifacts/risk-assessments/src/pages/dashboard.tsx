import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import { COUNTRY_REGISTRY } from "@/lib/country-registry";
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
  MAP_FOCUS_FILL_VISIBLE,
  MAP_FOCUS_FILL_RGB,
  MAP_FOCUS_FILL_TEXTURE_VISIBLE,
  MAP_FOCUS_FILL_TEXTURE_TILE_SIZE,
  MAP_BORDER_FULL_DETAIL_MAX_POINTS,
} from "@/lib/map-aesthetics";

// Background tone for the outer page wrapper (behind MapLayer).
const OCEAN_COLOR = "#00081a";

type Step = "login" | "preparing" | "brief" | "centre";

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
              <p className="text-xl font-semibold">Cape Town</p>
              <p className="text-sm text-slate-400 mt-1">Operational radius: 5 km</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <ShieldCheck className="w-5 h-5 text-amber-300 mb-4" />
              <p className="text-sm text-slate-400">Current Operating Conditions</p>
              <p className="text-xl font-semibold">Elevated</p>
              <p className="text-sm text-slate-400 mt-1">Additional awareness recommended.</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
              <Clock className="w-5 h-5 text-sky-300 mb-4" />
              <p className="text-sm text-slate-400">Updated</p>
              <p className="text-xl font-semibold">5 min ago</p>
              <p className="text-sm text-slate-400 mt-1">8 intelligence sources reviewed.</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/10 p-6">
            <h2 className="text-xl font-semibold mb-3">Operations Summary</h2>
            <p className="text-slate-300 leading-7">
              Current operating conditions remain suitable for planned activities. Increased traffic, forecast weather, and recent local activity suggest additional planning before deployment.
            </p>
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/10 p-6">
            <h2 className="text-xl font-semibold mb-4">Area Advisories</h2>
            <div className="grid md:grid-cols-3 gap-3">
              {["Traffic congestion expected", "Weather may affect movement", "Public activity under review"].map((item) => (
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
// (see COUNTRY_ADJUSTMENTS below), never applied as a correction.
const SHOW_COUNTRY_QA = true;

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

  useEffect(() => {
    subscribe(setActiveCountry);
    return () => unsubscribe(setActiveCountry);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

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
                  {MAP_FOCUS_FILL_TEXTURE_VISIBLE && (
                    <>
                      {/* Grain generated once on a small, fixed-size tile -
                          see MAP_FOCUS_FILL_TEXTURE_VISIBLE (map-aesthetics.ts)
                          for why this can't live on the scaled fill path
                          itself. */}
                      <filter id={`country-focus-paper-noise-${renderedCountry.iso3}`} x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" stitchTiles="stitch" result="noise" />
                        <feColorMatrix in="noise" type="saturate" values="0" />
                      </filter>
                      <pattern
                        id={`country-focus-paper-texture-${renderedCountry.iso3}`}
                        patternUnits="userSpaceOnUse"
                        width={MAP_FOCUS_FILL_TEXTURE_TILE_SIZE}
                        height={MAP_FOCUS_FILL_TEXTURE_TILE_SIZE}
                        patternTransform={`scale(${1 / focusRender.scale})`}
                      >
                        <rect width={MAP_FOCUS_FILL_TEXTURE_TILE_SIZE} height={MAP_FOCUS_FILL_TEXTURE_TILE_SIZE} fill={`rgb(${MAP_FOCUS_FILL_RGB})`} />
                        <rect
                          width={MAP_FOCUS_FILL_TEXTURE_TILE_SIZE}
                          height={MAP_FOCUS_FILL_TEXTURE_TILE_SIZE}
                          filter={`url(#country-focus-paper-noise-${renderedCountry.iso3})`}
                          style={{ mixBlendMode: "overlay", opacity: 0.4 }}
                        />
                      </pattern>
                    </>
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
                {/* Map Aesthetics Engine: a solid colour across the whole
                    selected shape, same clip path/transform as the image
                    above so it moves and scales in lockstep - per explicit
                    direction ("I want the entire country to be painted
                    over" on click, "completely covered", not the rim-light
                    below). Fully opaque - the map's city lights must not
                    show through. */}
                {MAP_FOCUS_FILL_VISIBLE && (
                  <path
                    d={focusRender.clipPath || renderedCountry.geometry}
                    className="country-focus-fill-path"
                    aria-hidden="true"
                    style={{
                      ...getCountryFocusImageStyle(focusRender.focusPoint, focusRender.cameraTarget, focusRender.scale, focusEntered),
                      fill: MAP_FOCUS_FILL_TEXTURE_VISIBLE
                        ? `url(#country-focus-paper-texture-${renderedCountry.iso3})`
                        : `rgb(${MAP_FOCUS_FILL_RGB})`,
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
    </section>
  );
}
