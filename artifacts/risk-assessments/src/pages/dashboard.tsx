import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle } from "lucide-react";

// Belt-and-suspenders: the MapContainer interaction props already disable
// these handlers, but calling the imperative API too guarantees the
// Operational Canvas map cannot be dragged/scrolled/touch-panned
// regardless of how the map instance was constructed. Zoom control
// buttons are left enabled - they call map.zoomIn()/zoomOut() directly.
function MapLock() {
  const map = useMap();

  useEffect(() => {
    map.dragging.disable();
    map.scrollWheelZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
  }, [map]);

  return null;
}

type Step = "login" | "preparing" | "brief" | "centre";

type OperatingStatus = "Normal" | "Elevated" | "High" | "Severe" | "No Data";

type OperationalMarker = {
  name: string;
  position: [number, number];
  status: OperatingStatus;
};

const OPERATIONAL_COUNTRIES: OperationalMarker[] = [
  { name: "South Africa", position: [-30.5595, 22.9375], status: "Elevated" },
  { name: "United Kingdom", position: [55.3781, -3.436], status: "Normal" },
  { name: "United Arab Emirates", position: [23.4241, 53.8478], status: "High" },
];

const WORLD_VIEW: [number, number] = [20, 0];
const WORLD_ZOOM = 2;

// Current Operating Conditions - locked to these four levels plus the
// "No Data" marker state (docs/Operations-Centre-v1.md).
const STATUS_COLORS: Record<OperatingStatus, string> = {
  Normal: "#22c55e",
  Elevated: "#f59e0b",
  High: "#f97316",
  Severe: "#ef4444",
  "No Data": "#94a3b8",
};

const STATUS_LEGEND: OperatingStatus[] = ["Normal", "Elevated", "High", "Severe", "No Data"];

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
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#050816] text-white">
      <MapLayer />
    </div>
  );
}

// LAYER 1: Map (static)
// Base layer of the Operational Canvas stack. Static world view - the
// map cannot be dragged/scrolled/touch-panned; the zoom control buttons
// are the only way to zoom. Colour-coded operational markers and a
// status legend sit on top. Nothing renders above this yet - Layers
// 2-7 are built and approved one at a time per the Debug Layer Rule.
function MapLayer() {
  return (
    <div data-layer="1" className="absolute inset-0 z-[1] h-full w-full">
      <MapContainer
        center={WORLD_VIEW}
        zoom={WORLD_ZOOM}
        minZoom={WORLD_ZOOM}
        maxZoom={16}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl
        attributionControl={false}
        className="h-full w-full"
      >
        <MapLock />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />

        {OPERATIONAL_COUNTRIES.map((marker) => (
          <CircleMarker
            className="venueguard-breathing-marker"
            key={marker.name}
            center={marker.position}
            radius={7}
            pathOptions={{
              color: STATUS_COLORS[marker.status],
              fillColor: STATUS_COLORS[marker.status],
              fillOpacity: 0.85,
              weight: 2,
            }}
          />
        ))}
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[10] rounded-xl border border-white/10 bg-slate-950/80 p-3 text-xs backdrop-blur-sm">
        <p className="mb-2 font-semibold text-white">Current Operating Conditions</p>
        {STATUS_LEGEND.map((status) => (
          <div key={status} className="flex items-center gap-2 py-0.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
            <span className="text-slate-300">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}