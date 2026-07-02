import { useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle, Cross, ShieldAlert, X } from "lucide-react";

type Step = "login" | "preparing" | "brief" | "centre";

type CountryIntel = {
  name: string;
  position: [number, number];
  status: string;
  updated: string;
  summary: string;
  overview: string;
  hospitals: string[];
  police: string[];
  advisories: string[];
};

const OPERATIONAL_COUNTRIES: CountryIntel[] = [
  {
    name: "South Africa",
    position: [-30.5595, 22.9375],
    status: "Elevated",
    updated: "5 min ago",
    summary:
      "Current operating conditions remain suitable for planned activities. Recent protest activity and forecast road closures suggest additional route planning before movement.",
    overview:
      "South Africa spans diverse urban and rural operating environments, with Cape Town and Johannesburg representing the primary areas of current activity.",
    hospitals: ["Groote Schuur Hospital", "Netcare Christiaan Barnard"],
    police: ["Cape Town Central SAPS", "Sea Point SAPS"],
    advisories: ["Increased protest activity reported downtown", "Road closures expected near CBD"],
  },
  {
    name: "United Kingdom",
    position: [55.3781, -3.436],
    status: "Normal",
    updated: "12 min ago",
    summary:
      "Conditions remain stable across primary operating areas. Rail disruption and a scheduled public gathering may affect movement timing this week.",
    overview:
      "The United Kingdom presents a mature, low-volatility operating environment with well-established emergency response infrastructure.",
    hospitals: ["St Thomas' Hospital", "Royal London Hospital"],
    police: ["Charing Cross Police Station", "Islington Police Station"],
    advisories: ["Rail disruption affecting central routes", "Large public gathering scheduled this weekend"],
  },
  {
    name: "United Arab Emirates",
    position: [23.4241, 53.8478],
    status: "High",
    updated: "3 min ago",
    summary:
      "Elevated security posture remains in effect around major venues. Temporary road restrictions should be factored into movement planning.",
    overview:
      "The United Arab Emirates combines rapid urban development with a highly visible security presence, particularly around commercial and event venues.",
    hospitals: ["Rashid Hospital", "American Hospital Dubai"],
    police: ["Bur Dubai Police Station", "Al Barsha Police Station"],
    advisories: ["Heightened security around major venues", "Temporary road restrictions near event zones"],
  },
];

const WORLD_VIEW: [number, number] = [20, 0];
const WORLD_ZOOM = 2;
const COUNTRY_ZOOM = 5;

// VG-006 layered rebuild: panels are being restored one at a time so each
// can be verified against the map before adding the next. Flip each flag
// back to true to restore that panel.
const SHOW_OPERATIONAL_LAYERS = true;
const SHOW_OPERATIONAL_FOOTPRINT = false;
const SHOW_COUNTRY_INTEL = false;

export default function Dashboard() {
  const [step, setStep] = useState<Step>("login");
  const [selectedCountry, setSelectedCountry] = useState<CountryIntel | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  function signIn() {
    setStep("preparing");
    setTimeout(() => setStep("brief"), 1400);
  }

  function selectCountry(country: CountryIntel) {
    setSelectedCountry(country);
    mapRef.current?.flyTo(country.position, COUNTRY_ZOOM, { duration: 1.5 });
  }

  function closeCountryIntel() {
    setSelectedCountry(null);
    mapRef.current?.flyTo(WORLD_VIEW, WORLD_ZOOM, { duration: 1.2 });
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

      <div className="relative h-[calc(100vh-8rem)] w-full">
        <MapContainer
          ref={mapRef}
          center={WORLD_VIEW}
          zoom={WORLD_ZOOM}
          minZoom={WORLD_ZOOM}
          scrollWheelZoom={false}
          className="isolate relative z-0 h-full w-full rounded-2xl"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />

          {OPERATIONAL_COUNTRIES.map((marker) => (
            <CircleMarker
              className="venueguard-breathing-marker cursor-pointer"
              key={marker.name}
              center={marker.position}
              radius={7}
              pathOptions={{
                color: "#38bdf8",
                fillColor: "#38bdf8",
                fillOpacity: 0.8,
                weight: 2,
              }}
              eventHandlers={SHOW_COUNTRY_INTEL ? { click: () => selectCountry(marker) } : {}}
            >
              <Tooltip className="venueguard-marker-tooltip" direction="top" offset={[0, -10]} opacity={1}>
                <p className="font-semibold text-white">{marker.name}</p>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-[radial-gradient(circle_at_center,transparent_35%,rgba(5,8,22,0.65)_100%)]" />

        {SHOW_OPERATIONAL_LAYERS && (
          <aside className="absolute left-4 top-4 bottom-4 z-10 w-[280px] overflow-y-auto rounded-[24px] border border-white/10 bg-white/10 p-4 opacity-[0.92] shadow-2xl shadow-black/40 backdrop-blur-xl">
            <h2 className="font-semibold mb-4">Operational Layers</h2>
            {["Area Advisories", "Medical Support", "Law Enforcement", "Fuel Stations", "Operational Routes"].map((layer) => (
              <label key={layer} className="flex items-center gap-3 py-2 text-sm text-slate-300">
                <input type="checkbox" className="accent-sky-400" />
                {layer}
              </label>
            ))}
          </aside>
        )}

        {SHOW_OPERATIONAL_FOOTPRINT && (
          <aside className="absolute right-4 top-4 bottom-4 z-10 w-[300px] overflow-y-auto rounded-[24px] border border-white/10 bg-white/10 p-4 opacity-[0.92] shadow-2xl shadow-black/40 backdrop-blur-xl">
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
        )}

        {SHOW_COUNTRY_INTEL && (
          <div
            className={`absolute right-6 top-6 bottom-6 z-[1000] w-[380px] max-w-[90%] overflow-y-auto rounded-[24px] border border-white/10 bg-white/10 p-5 opacity-[0.92] shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform duration-500 ease-out ${
              selectedCountry ? "translate-x-0" : "pointer-events-none translate-x-[120%]"
            }`}
          >
            {selectedCountry && (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sky-300 text-xs">Country Intelligence</p>
                    <h2 className="text-xl font-semibold">{selectedCountry.name}</h2>
                  </div>
                  <button
                    onClick={closeCountryIntel}
                    className="rounded-lg border border-white/10 bg-white/10 p-1.5 text-slate-300 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="rounded-xl bg-slate-900/70 border border-white/10 p-3">
                    <p className="text-xs text-slate-400">Current Operating Conditions</p>
                    <p className="text-sm font-semibold">{selectedCountry.status}</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/70 border border-white/10 p-3">
                    <p className="text-xs text-slate-400">Updated</p>
                    <p className="text-sm font-semibold">5 min ago</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Operations Summary</h3>
                    <p className="text-sm text-slate-300 leading-6">{selectedCountry.summary}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-300" /> Area Advisories
                    </h3>
                    <div className="space-y-1.5">
                      {selectedCountry.advisories.map((advisory) => (
                        <p key={advisory} className="text-sm text-slate-300">{advisory}</p>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Cross className="w-3.5 h-3.5 text-sky-300" /> Medical Support
                    </h3>
                    <div className="space-y-1.5">
                      {selectedCountry.hospitals.map((hospital) => (
                        <p key={hospital} className="text-sm text-slate-300">{hospital}</p>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-sky-300" /> Law Enforcement
                    </h3>
                    <div className="space-y-1.5">
                      {selectedCountry.police.map((station) => (
                        <p key={station} className="text-sm text-slate-300">{station}</p>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Country Overview</h3>
                    <p className="text-sm text-slate-300 leading-6">{selectedCountry.overview}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}