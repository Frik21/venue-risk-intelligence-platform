import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import { COUNTRY_REGISTRY } from "@/lib/country-registry";
import { clearSelection, selectCountry, subscribe, unsubscribe } from "@/lib/country-selection-engine";
import type { ActiveCountry } from "@/lib/country-selection-engine";
import { getCountryFocusDefinition } from "@/lib/country-focus-registry";

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
// focus logic - purely a measurement aid.
const SHOW_CANVAS_CALIBRATION = true;

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
// this debug view), only the outline rendering is gated.
const SHOW_COUNTRY_BOUNDARIES = true;

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
// Entrance sequence is 650ms, staggered per the ticket's own spec rather
// than one uniform fade:
//   0-150ms    the cutout separates from the world (opacity fade-in)
//   150-650ms  background dims and blurs (500ms, starting at 150ms so it
//              finishes exactly when the sequence does)
//   350-650ms  the cutout scales and moves to its Camera Target (300ms)
// A soft drop-shadow grows in during the same 350-650ms window as the
// move/scale, reinforcing "lifted and brought forward" rather than a flat
// zoom.
//
// Index 3.4: the RETURN to the world map is its own simpler, uniform
// 450ms ease-out on every property at once (not the staggered entrance
// timing) - CSS transitions are direction-aware for free here, since the
// transition rule that applies to a property change is whichever
// `transition` value is present on the style being transitioned TO, so
// the "entered" style below carries the staggered entrance rule and the
// "not entered" style carries the uniform return rule.
const FOCUS_SEPARATION_MS = 150;
const FOCUS_BACKGROUND_MS = 500;
const FOCUS_BACKGROUND_DELAY_MS = 150;
const FOCUS_TRANSFORM_MS = 300;
const FOCUS_TRANSFORM_DELAY_MS = 350; // 350 + 300 = 650, the full entrance sequence
const FOCUS_RETURN_MS = 450;

const FOCUS_ENTER_TRANSITION = [
  `opacity ${FOCUS_SEPARATION_MS}ms ease-in-out`,
  `transform ${FOCUS_TRANSFORM_MS}ms ease-in-out ${FOCUS_TRANSFORM_DELAY_MS}ms`,
  `filter ${FOCUS_TRANSFORM_MS}ms ease-in-out ${FOCUS_TRANSFORM_DELAY_MS}ms`,
].join(", ");
const FOCUS_RETURN_TRANSITION = `opacity ${FOCUS_RETURN_MS}ms ease-out, transform ${FOCUS_RETURN_MS}ms ease-out, filter ${FOCUS_RETURN_MS}ms ease-out`;

function getCountryFocusImageStyle(iso3: string, boundingBox: ActiveCountry["boundingBox"], entered: boolean) {
  const focus = getCountryFocusDefinition(iso3);
  // Defensive fallback only - every Active Country comes from
  // COUNTRY_REGISTRY, which COUNTRY_FOCUS_REGISTRY is built 1:1 from, so
  // this should never be reached.
  const focusPoint = focus?.focusPoint ?? { x: (boundingBox.minX + boundingBox.maxX) / 2, y: (boundingBox.minY + boundingBox.maxY) / 2 };
  const cameraTarget = focus?.cameraTarget ?? { x: 500, y: 500 };
  const scale = focus?.defaultFocusScale ?? 1.06;
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
    filter: entered ? "drop-shadow(0 14px 34px rgba(0, 0, 0, 0.55))" : "drop-shadow(0 0px 0px rgba(0, 0, 0, 0))",
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
  // "entered" on the next frame so the browser has something to transition
  // from. A second rAF guards against the browser coalescing both paints
  // into one (confirmed necessary - a single rAF occasionally skipped the
  // transition entirely in testing).
  //
  // Index 3.4: clearing selection no longer unmounts the focus layer
  // immediately - it flips focusEntered back to false (playing the 450ms
  // return transition) and only clears renderedCountry, actually removing
  // the DOM nodes, once that transition has had time to finish.
  useEffect(() => {
    if (activeCountry) {
      setRenderedCountry(activeCountry);
      setFocusEntered(false);
      let secondFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => setFocusEntered(true));
      });
      return () => {
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
      };
    }

    setFocusEntered(false);
    const returnTimeout = window.setTimeout(() => setRenderedCountry(null), FOCUS_RETURN_MS);
    return () => window.clearTimeout(returnTimeout);
  }, [activeCountry]);

  const [qaCountryIndex, setQaCountryIndex] = useState(0);
  const [qaShowFill, setQaShowFill] = useState(false);
  const [qaShowOutline, setQaShowOutline] = useState(true);
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

  function handleCalibrationMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 500);
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
              style={getBackgroundFocusStyle(focusEntered)}
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
              {COUNTRY_REGISTRY.map((country) => (
                <path
                  key={country.id}
                  d={country.svgPath}
                  className="country-hit-zone"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectCountry(country);
                  }}
                />
              ))}
            </svg>
          )}
          {layer.className === "operational-footprint-layer" && renderedCountry && (
            <>
              <div className="country-focus-dim-overlay" style={getDimOverlayStyle(focusEntered)} aria-hidden="true" />
              <svg
                className="country-focus-image-layer"
                viewBox={OPERATIONAL_GEOMETRY_VIEWBOX}
                preserveAspectRatio={OPERATIONAL_GEOMETRY_FIT}
                aria-hidden="true"
              >
                <defs>
                  <clipPath id={`country-focus-clip-${renderedCountry.iso3}`} clipPathUnits="userSpaceOnUse">
                    <path d={renderedCountry.geometry} />
                  </clipPath>
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
                  style={getCountryFocusImageStyle(renderedCountry.iso3, renderedCountry.boundingBox, focusEntered)}
                />
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

      {SHOW_CANVAS_CALIBRATION && calibrationPoint && (
        <div className="canvas-calibration-overlay" aria-hidden="true">
          <div className="canvas-calibration-grid" />
          <div
            className="canvas-calibration-crosshair-x"
            style={{ top: `${(calibrationPoint.y / 500) * 100}%` }}
          />
          <div
            className="canvas-calibration-crosshair-y"
            style={{ left: `${(calibrationPoint.x / 1000) * 100}%` }}
          />
          <div className="canvas-calibration-readout">
            Canvas X: {calibrationPoint.x}
            <br />
            Canvas Y: {calibrationPoint.y}
          </div>
        </div>
      )}


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
