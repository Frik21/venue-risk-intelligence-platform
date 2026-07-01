import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050816] text-white overflow-hidden px-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sky-300 text-sm">Operations Centre</p>
          <h1 className="text-3xl font-semibold">Operational Canvas</h1>
        </div>
        <button onClick={() => setStep("brief")} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm">
          Operations Brief • Updated
        </button>
      </div>

      <div className="grid lg:grid-cols-[300px_minmax(620px,1fr)_320px] gap-5 h-[620px] w-full max-w-7xl">
        <aside className="rounded-2xl bg-white/10 border border-white/10 p-4">
          <h2 className="font-semibold mb-4">Operational Layers</h2>
          {["Area Advisories", "Medical Support", "Law Enforcement", "Fuel Stations", "Operational Routes"].map((layer) => (
            <label key={layer} className="flex items-center gap-3 py-2 text-sm text-slate-300">
              <input type="checkbox" className="accent-sky-400" />
              {layer}
            </label>
          ))}
        </aside>

<main className="relative rounded-2xl bg-slate-900 border border-white/10 overflow-hidden">
  <MapContainer
    center={[20, 0]}
    zoom={2}
    minZoom={2}
    scrollWheelZoom={false}
    className="h-full w-full"
    zoomControl={false}
    attributionControl={false}
  >
    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

    {[
      { name: "South Africa", position: [-30.5595, 22.9375], status: "Elevated" },
      { name: "United Kingdom", position: [55.3781, -3.436], status: "Normal" },
      { name: "United Arab Emirates", position: [23.4241, 53.8478], status: "High" },
    ].map((marker) => (
      <CircleMarker
  className="venueguard-breathing-marker"
        key={marker.name}
        center={marker.position as [number, number]}
        radius={7}
        pathOptions={{
          color: "#38bdf8",
          fillColor: "#38bdf8",
          fillOpacity: 0.8,
          weight: 2,
        }}
      >
        <Popup>
          <strong>{marker.name}</strong>
          <br />
          Current Operating Conditions: {marker.status}
        </Popup>
      </CircleMarker>
    ))}
  </MapContainer>

  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(5,8,22,0.65)_100%)]" />
</main>

        <aside className="rounded-2xl bg-white/10 border border-white/10 p-4">
          <h2 className="font-semibold mb-4">Operational Footprint</h2>
          <div className="space-y-3">
            {[
              ["South Africa", "3 venues", "2 plans"],
              ["United Kingdom", "1 venue", "1 plan"],
              ["United Arab Emirates", "1 venue", "0 plans"],
            ].map(([country, venues, plans]) => (
              <div key={country} className="rounded-xl bg-slate-900/70 border border-white/10 p-3">
                <p className="font-medium">{country}</p>
                <p className="text-xs text-slate-400">{venues} · {plans}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}