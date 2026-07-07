import { useState } from "react";
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

const SHOW_DEBUG_LAYER_NUMBERS = true;

type CanvasLayer = {
  id: string;
  number: number;
  label: string;
  className: string;
};

const CANVAS_LAYERS: CanvasLayer[] = [
  {
    id: "base-map",
    number: 1,
    label: "Base Map",
    className: "base-map-layer",
  },
  {
    id: "operational-layers",
    number: 2,
    label: "Operational Layers",
    className: "operational-layers",
  },
  {
    id: "operational-footprint",
    number: 3,
    label: "Operational Footprint",
    className: "operational-footprint-layer",
  },
  {
    id: "country-intelligence",
    number: 4,
    label: "Country Intelligence",
    className: "country-intelligence-layer",
  },
  {
    id: "breathing-markers",
    number: 5,
    label: "Breathing Markers",
    className: "breathing-markers-layer",
  },
  {
    id: "debug-layer-numbers",
    number: 6,
    label: "Debug Layer Numbers",
    className: "debug-layer-number-layer",
  },
];

type CountryHitZone = {
  id: string;
  name: string;
  isoCode: string;
  path: string;
};

const COUNTRY_HIT_ZONES: CountryHitZone[] = [
  { id: "canada", name: "Canada", isoCode: "CAN", path: "M104 58 L330 54 L365 123 L318 158 L154 150 L92 102 Z" },
  { id: "united-states", name: "United States", isoCode: "USA", path: "M128 150 L315 145 L348 214 L285 248 L151 226 L102 185 Z" },
  { id: "brazil", name: "Brazil", isoCode: "BRA", path: "M350 270 L430 286 L460 350 L416 425 L350 392 L326 318 Z" },
  { id: "united-kingdom", name: "United Kingdom", isoCode: "GBR", path: "M468 126 L494 126 L502 156 L480 166 L463 148 Z" },
  { id: "france", name: "France", isoCode: "FRA", path: "M480 164 L524 164 L532 199 L502 218 L470 194 Z" },
  { id: "germany", name: "Germany", isoCode: "DEU", path: "M512 142 L548 144 L552 180 L524 196 L503 172 Z" },
  { id: "south-africa", name: "South Africa", isoCode: "ZAF", path: "M506 356 L570 360 L592 388 L560 420 L505 404 Z" },
  { id: "russia", name: "Russia", isoCode: "RUS", path: "M545 68 L914 64 L934 146 L760 172 L574 144 Z" },
  { id: "india", name: "India", isoCode: "IND", path: "M654 230 L710 240 L720 308 L680 346 L644 286 Z" },
  { id: "china", name: "China", isoCode: "CHN", path: "M674 164 L805 174 L820 244 L740 278 L662 234 Z" },
  { id: "japan", name: "Japan", isoCode: "JPN", path: "M835 190 L866 205 L862 255 L828 246 Z" },
  { id: "australia", name: "Australia", isoCode: "AUS", path: "M758 330 L832 324 L876 350 L866 396 L814 416 L754 390 Z" },
];

// Operational Canvas Engine foundation - six-layer stack for future map
// intelligence features to plug into. Only base-map-layer renders visible
// content (the approved static map); layers 3-6 exist structurally but
// render nothing yet. operational-layers hosts the invisible country
// selection engine (Index 1.6) - hit zones only, no visual change.
function OperationalCanvas() {
  const showDebugLayerNumbers = true;

  const layers = [
    { number: 1, label: "Base Map", className: "base-map-layer" },
    { number: 2, label: "Operational Layers", className: "operational-layers" },
    { number: 3, label: "Operational Footprint", className: "operational-footprint-layer" },
    { number: 4, label: "Country Intelligence", className: "country-intelligence-layer" },
    { number: 5, label: "Breathing Markers", className: "breathing-markers-layer" },
    { number: 6, label: "Debug Layer Numbers", className: "debug-layer-number-layer" },
  ];

  return (
    <section className="operational-canvas" aria-label="Operational Canvas">
      {layers.map((layer) => (
        <div
          key={layer.number}
          className={`canvas-layer ${layer.className}`}
          data-layer-number={layer.number}
          data-layer-name={layer.label}
        />
      ))}

      {showDebugLayerNumbers && (
        <div className="debug-layer-badge-stack" aria-hidden="true">
          {layers.map((layer) => (
            <div key={layer.number} className="debug-layer-badge">
              <span>{layer.number}</span>
              <strong>{layer.label}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
