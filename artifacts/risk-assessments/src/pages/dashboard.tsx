import { useState } from "react";
import type { MouseEvent } from "react";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle } from "lucide-react";

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
// render nothing yet. operational-layers hosts the invisible country
// selection engine (Index 1.6) - hit zones only, no visual change.
type CountryTestZone = {
  name: string;
  isoCode: string;
  path: string;
};

const COUNTRY_TEST_ZONES: CountryTestZone[] = [
  { name: "Australia", isoCode: "AUS", path: "M758 330 L832 324 L876 350 L866 396 L814 416 L754 390 Z" },
  { name: "United States", isoCode: "USA", path: "M128 150 L315 145 L348 214 L285 248 L151 226 L102 185 Z" },
  { name: "United Kingdom", isoCode: "GBR", path: "M468 126 L494 126 L502 156 L480 166 L463 148 Z" },
  { name: "South Africa", isoCode: "ZAF", path: "M506 356 L570 360 L592 388 L560 420 L505 404 Z" },
];

function handleCountryTestZoneClick(country: CountryTestZone) {
  console.log("Operational Canvas selected country:", {
    name: country.name,
    isoCode: country.isoCode,
  });
}

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

// Country Focus Engine (Index 1.9/1.9A) - Australia proof only. Clicking
// Australia's existing invisible hit zone additionally sets
// selectedCountry, which blurs/dims the shared base map image and shows
// a flat gold Australia-shaped proof, rigidly translated (no zoom/scale)
// so its silhouette lands centred on the canvas regardless of the
// underlying map's real geographic position. This is a visibility proof
// only - not perfect map-image clipping (that's a later ticket). United
// States/United Kingdom/South Africa hit zones are untouched - they
// still only log on click.
const AUSTRALIA_FOCUS_PATH = "M758 330 L832 324 L876 350 L866 396 L814 416 L754 390 Z";
// Average of the path's own vertices, in the same 0-1000/0-500 viewBox
// units as the hit zones - the shift below re-centres exactly this point.
const AUSTRALIA_FOCUS_CENTER_SHIFT = "translate(-316.67, -117.67)";

// Operational Canvas Calibration Tool (Index 1.9) - dev-only, temporary.
// Lets country hit-zone paths be aligned exactly to the rendered PNG by
// reading live x/y coordinates (0-1000 / 0-500, matching the hit-zone
// viewBox) under the mouse, and logging the clicked point. No country or
// focus logic - purely a measurement aid.
const SHOW_CANVAS_CALIBRATION = true;

// Australia Polygon Capture Tool (Index 2.0) - dev-only, temporary. Reuses
// the calibration tool's live x/y point: every canvas click appends the
// current point to australiaPolygonPoints, rendered as connected gold
// dots, and a matching "M x y L x y ... Z" SVG path string is generated
// live for copying into AUSTRALIA_FOCUS_PATH once captured accurately.
const CAPTURE_AUSTRALIA_POLYGON = true;

function buildAustraliaPolygonPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  const segments = [`M ${first.x} ${first.y}`, ...rest.map((p) => `L ${p.x} ${p.y}`), "Z"];
  return segments.join(" ");
}

function OperationalCanvas() {
  const showDebugLayerNumbers = false;
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [calibrationPoint, setCalibrationPoint] = useState<{ x: number; y: number } | null>(null);
  const [australiaPolygonPoints, setAustraliaPolygonPoints] = useState<{ x: number; y: number }[]>([]);

  function handleCountryZoneClick(country: CountryTestZone) {
    handleCountryTestZoneClick(country);
    if (country.name === "Australia") {
      console.log("AUSTRALIA CLICKED");
      setSelectedCountry(country.name);
    }
  }

  function handleCalibrationMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 500);
    setCalibrationPoint({ x, y });
  }

  function handleCalibrationClick() {
    if (!calibrationPoint) return;
    console.log("Operational Canvas calibration point:", calibrationPoint);
    if (CAPTURE_AUSTRALIA_POLYGON) {
      setAustraliaPolygonPoints((points) => [...points, calibrationPoint]);
    }
  }

  function handleResetAustraliaPoints(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setAustraliaPolygonPoints([]);
  }

  return (
    <section
      className={selectedCountry ? "operational-canvas is-country-focused" : "operational-canvas"}
      aria-label="Operational Canvas"
      onMouseMove={SHOW_CANVAS_CALIBRATION ? handleCalibrationMove : undefined}
      onClick={SHOW_CANVAS_CALIBRATION ? handleCalibrationClick : undefined}
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
              className={
                selectedCountry
                  ? "approved-base-map-image approved-base-map-image--focused"
                  : "approved-base-map-image"
              }
              src="/data/world-map-v17.png"
              alt=""
              draggable={false}
              aria-hidden="true"
            />
          )}
          {layer.className === "operational-layers" && (
            <svg
              className="country-selection-engine"
              viewBox="0 0 1000 500"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {COUNTRY_TEST_ZONES.map((country) => {
                const isAustralia = country.name === "Australia";
                return (
                  <path
                    key={country.isoCode}
                    d={country.path}
                    className="country-hit-zone"
                    pointerEvents={isAustralia ? "all" : undefined}
                    style={
                      isAustralia
                        ? { fill: "rgba(255, 196, 87, 0.35)", stroke: "rgba(255, 196, 87, 0.8)", strokeWidth: 2 }
                        : undefined
                    }
                    onClick={() => handleCountryZoneClick(country)}
                  />
                );
              })}
            </svg>
          )}
          {layer.className === "operational-footprint-layer" && selectedCountry === "Australia" && (
            <>
              <div className="country-focus-dim-overlay" aria-hidden="true" />
              <svg
                className="country-focus-shape"
                viewBox="0 0 1000 500"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <g transform={AUSTRALIA_FOCUS_CENTER_SHIFT}>
                  <path d={AUSTRALIA_FOCUS_PATH} />
                </g>
              </svg>
            </>
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

      {CAPTURE_AUSTRALIA_POLYGON && (
        <>
          <svg
            className="australia-polygon-capture-overlay"
            viewBox="0 0 1000 500"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {australiaPolygonPoints.length > 1 && (
              <polyline
                points={australiaPolygonPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                className="australia-polygon-capture-line"
              />
            )}
            {australiaPolygonPoints.map((p, index) => (
              <circle key={index} cx={p.x} cy={p.y} r={4} className="australia-polygon-capture-dot" />
            ))}
          </svg>

          <div className="australia-polygon-capture-readout">
            <div>Points captured: {australiaPolygonPoints.length}</div>
            <div className="australia-polygon-capture-path">
              {buildAustraliaPolygonPath(australiaPolygonPoints) || "(click the canvas to capture points)"}
            </div>
            <button
              type="button"
              className="australia-polygon-capture-reset"
              onClick={handleResetAustraliaPoints}
            >
              Reset Australia Points
            </button>
          </div>
        </>
      )}
    </section>
  );
}
