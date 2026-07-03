import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, ImageOverlay, CircleMarker, GeoJSON, Tooltip, useMap, useMapEvent } from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import "leaflet/dist/leaflet.css";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import { COUNTRY_CAPITALS } from "@/lib/country-capitals";

// Full-world country boundaries (Natural Earth, ~4MB) are served as a
// static asset and fetched at runtime rather than bundled into the JS
// build - keeps the app's core bundle lean regardless of dataset size.
const COUNTRY_BORDERS_URL = `${import.meta.env.BASE_URL}data/operational-country-borders.json`;

// Static "Earth at Night" world map (dark navy landmasses, black ocean,
// amber city-light glow) - the Operational Canvas's default-view base
// layer, replacing the earlier ESRI tile base. Pre-rendered once from
// the same country-borders dataset rather than served as map tiles,
// since a raster tile provider can't express this custom styling.
const NIGHT_MAP_URL = `${import.meta.env.BASE_URL}data/earth-at-night.png`;

// General antimeridian fix: any ring whose consecutive points jump by
// more than 180deg of longitude (i.e. it crosses the 180/-180 dateline,
// e.g. Russia, Fiji) gets its longitudes "unwrapped" into a continuous
// range instead of snapping back and forth across the seam. Applied to
// every ring of every feature - not country-specific - so it fixes any
// dateline-crossing geometry in the dataset, and rings that never cross
// the dateline are returned unchanged (offset stays 0 throughout).
// crossedAntimeridian tracks whether THIS ring itself needed unwrapping,
// which alignCrossingRings (below) uses to decide which rings are safe
// to shift again for consistency with the rest of the same feature.
function unwrapRingLongitudes(ring: Position[]): { points: Position[]; crossedAntimeridian: boolean } {
  let offset = 0;
  let crossedAntimeridian = false;
  const points: Position[] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const delta = ring[i][0] - ring[i - 1][0];
    if (delta > 180) {
      offset -= 360;
      crossedAntimeridian = true;
    } else if (delta < -180) {
      offset += 360;
      crossedAntimeridian = true;
    }
    points.push([ring[i][0] + offset, ring[i][1]]);
  }
  return { points, crossedAntimeridian };
}

// A ring that crosses the antimeridian on its own (e.g. Russia's
// Wrangel Island, whose coastline straddles exactly 180deg) unwraps
// independently of every other ring in the same feature, so it can land
// 360deg away from where the rest of the country ended up - e.g.
// Wrangel Island unwrapping to roughly -181..-177 while the Russian
// mainland (which also crosses, via the Chukotka coastline) unwraps to
// roughly 27..190. That leaves a small, correctly-shaped island
// floating on the opposite side of the map from the rest of its own
// country, right next to a different country entirely (Alaska/the US,
// in Russia's case). Re-shifting only the rings that themselves crossed,
// by whole multiples of 360deg, to sit next to the feature's largest
// ring (by area, whichever side it happens to be on) keeps every part
// of a dateline-straddling country on the same side of the seam. Rings
// that never crossed are returned completely untouched - this is what
// keeps already-correct geometry (e.g. the US's Aleutian islands, which
// sit at valid, unmodified positive longitudes without ever crossing
// the seam within a single ring) from being shifted unnecessarily.
function alignCrossingRings(rings: { points: Position[]; crossedAntimeridian: boolean }[]): Position[][] {
  const largest = rings.reduce((best, r) => (ringArea(r.points) > ringArea(best.points) ? r : best));
  const referenceLng = largest.points[0][0];

  return rings.map(({ points, crossedAntimeridian }) => {
    if (!crossedAntimeridian) return points;
    const shift = Math.round((referenceLng - points[0][0]) / 360) * 360;
    return shift === 0 ? points : points.map(([lng, lat]): Position => [lng + shift, lat]);
  });
}

function unwrapGeometry(geometry: Geometry): Geometry {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: alignCrossingRings(geometry.coordinates.map(unwrapRingLongitudes)) };
  }
  if (geometry.type === "MultiPolygon") {
    const unwrappedPolygons = geometry.coordinates.map((polygon) => polygon.map(unwrapRingLongitudes));
    const aligned = alignCrossingRings(unwrappedPolygons.flat());
    let cursor = 0;
    const coordinates = unwrappedPolygons.map((polygon) => polygon.map(() => aligned[cursor++]));
    return { ...geometry, coordinates };
  }
  return geometry;
}

// Planar shoelace-formula area of a ring, in (degree^2) units. Not a
// true geodesic area, but that's not needed here - it's only used to
// rank a country's own sub-polygons against each other by relative
// size, and for that a simple planar comparison is accurate enough.
function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// Multi-part countries (US: mainland + Alaska + Hawaii; France: mainland
// + overseas territories; NZ: North/South Island + Chatham Islands,
// etc.) must zoom to their primary/largest landmass, not a bounding box
// spanning every part - that box is often huge or degenerate and breaks
// the camera transition. This finds the largest polygon by area (the
// outer ring only) and returns bounds for just that one part. Outline
// rendering is untouched - it still draws every part of the geometry,
// since this bounds calculation is only used for the flyToBounds camera
// target, never passed to the GeoJSON layer's own style/render path.
function getPrimaryPolygonBounds(geometry: Geometry): L.LatLngBounds | null {
  let rings: Position[][];
  if (geometry.type === "Polygon") {
    rings = [geometry.coordinates[0]];
  } else if (geometry.type === "MultiPolygon") {
    rings = geometry.coordinates.map((polygon) => polygon[0]);
  } else {
    return null;
  }

  const largestRing = rings.reduce((largest, ring) => (ringArea(ring) > ringArea(largest) ? ring : largest));

  return L.latLngBounds(largestRing.map(([lng, lat]) => L.latLng(lat, lng)));
}

// The satellite TileLayer (Layer 1's country-zoom rendering) is bounded
// to just the selected country - a single, well-defined box that avoids
// the world-spanning antimeridian/edge bugs the earlier global raster
// base map hit. Russia is the exception this note warns about: its
// primary-polygon bounds (see getPrimaryPolygonBounds), after
// unwrapGeometry/alignCrossingRings, legitimately extend past +180deg
// (its Chukotka coastline runs to roughly 190deg in this app's unwrapped
// representation). A single bounds object with east > 180 would look
// fine for the flyToBounds camera move (raw lat/lng arithmetic doesn't
// care), but Leaflet's tile-validity check for a TileLayer's `bounds`
// option compares against each tile's own projected lat/lng, which the
// CRS always keeps within -180..180 - so the "overflow" portion (180 to
// 190) would never overlap any real tile there, and the western half of
// Chukotka (natively indexed as x-coordinates near the antimeridian's
// other side, i.e. lng close to -180) would never load. Splitting any
// bounds that cross +-180 into two normal, non-crossing boxes - one on
// each side of the seam - and rendering one TileLayer per box fixes this
// the same way the outline geometry itself needed splitting/aligning.
function splitBoundsAtAntimeridian(bounds: L.LatLngBounds): L.LatLngBoundsExpression[] {
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  if (east > 180) {
    return [
      [
        [south, west],
        [north, 180],
      ],
      [
        [south, -180],
        [north, east - 360],
      ],
    ];
  }
  if (west < -180) {
    return [
      [
        [south, west + 360],
        [north, 180],
      ],
      [
        [south, -180],
        [north, east],
      ],
    ];
  }
  return [
    [
      [south, west],
      [north, east],
    ],
  ];
}

// Bounds for the satellite TileLayer(s): the primary-polygon bounds used
// for the camera move, padded by 25% on every side (Leaflet's own
// LatLngBounds.pad()) so satellite tiles are available slightly beyond
// the tight country outline - matching flyToBounds's own pixel padding
// conceptually - then split at the antimeridian if needed.
function getSatelliteBoundsSegments(geometry: Geometry): L.LatLngBoundsExpression[] {
  const bounds = getPrimaryPolygonBounds(geometry);
  if (!bounds) return [];
  return splitBoundsAtAntimeridian(bounds.pad(0.25));
}

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

// Fits the world-view floor to the actual rendered viewport instead of a
// zoom number measured against one specific window size. Runs before
// paint (useLayoutEffect) so there's no flash of the wrong scale, and
// re-fits on window resize. If the map is currently sitting at the
// world view (not zoomed into a country), the resize also re-centers it
// at the newly-fitted zoom so the floor never leaves the map framed
// wider than the reference; an active country selection is left alone.
function WorldFitZoom() {
  const map = useMap();

  useLayoutEffect(() => {
    const initialZoom = computeWorldFitZoom(map);
    map.setMinZoom(initialZoom);
    map.setView(WORLD_VIEW, initialZoom, { animate: false });

    function handleResize() {
      const previousMinZoom = map.getMinZoom();
      const wasAtFloor = map.getZoom() <= previousMinZoom;
      const zoom = computeWorldFitZoom(map);
      map.setMinZoom(zoom);
      if (wasAtFloor) {
        map.setView(WORLD_VIEW, zoom, { animate: false });
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);

  return null;
}

const COUNTRY_ZOOM_DURATION = 1.2;
const WORLD_ZOOM_DURATION = 1.2;

function mercatorYFraction(latDeg: number): number {
  const latRad = (latDeg * Math.PI) / 180;
  return 0.5 - Math.asinh(Math.tan(latRad)) / (2 * Math.PI);
}

// The reference framing is "the world fills the viewport" without
// clipping any continent - not one fixed zoom number, and not simply
// "fill the width." World pixel width/height at a given zoom is
// 256 * 2^zoom (Leaflet's standard tile scale); fitting to width alone
// assumes a roughly square-ish window, but a wide/short browser window
// needs a smaller world so Cape Horn (South America's southern tip, the
// most extreme continental landmass point from the WORLD_VIEW center)
// stays above the bottom edge instead of being cropped, the same way
// the high Arctic needs to stay below the top edge. Taking the more
// restrictive of a width-fit and a height-fit zoom guarantees neither
// dimension ever clips a continent, whatever the viewport's aspect ratio.
function computeWorldFitZoom(map: L.Map): number {
  const size = map.getSize();
  const widthFitZoom = Math.log2((size.x * 180) / (256 * WORLD_HALF_SPAN_DEG));

  const centerYFrac = mercatorYFraction(WORLD_VIEW[0]);
  const southHalfSpan = mercatorYFraction(-56) - centerYFrac; // Cape Horn
  const northHalfSpan = centerYFrac - mercatorYFraction(83); // high Arctic
  const halfSpan = Math.max(southHalfSpan, northHalfSpan) * 1.05; // small safety margin
  const heightFitZoom = Math.log2(size.y / (2 * halfSpan) / 256);

  return Math.min(widthFitZoom, heightFitZoom);
}

function isFeatureSelected(feature: Feature | undefined, selectedCountryId: string | null): boolean {
  return feature?.id != null && String(feature.id) === selectedCountryId;
}

function countryOutlineStyle(feature: Feature | undefined, selectedCountryId: string | null): L.PathOptions {
  const isSelected = isFeatureSelected(feature, selectedCountryId);
  return {
    color: isSelected ? "#FFB800" : "transparent",
    weight: isSelected ? 2 : 0,
    fillColor: "#000000",
    fillOpacity: isSelected ? 0 : 0.01,
  };
}

// Country Select & Outline: clicking within a country's true boundary
// (Natural Earth geometry, including enclaves like Lesotho) flies the
// camera to frame it and renders a static neon outline. Clicking
// anywhere else (the country features stop event propagation) flies
// back to the world view and clears the selection. This is a discrete,
// programmatic camera action - it does not re-enable free dragging,
// scrolling, touch, or keyboard navigation.
function CountrySelect({
  selectedCountryId,
  onSelectCountry,
}: {
  selectedCountryId: string | null;
  onSelectCountry: (id: string | null) => void;
}) {
  const map = useMap();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const [countryBorders, setCountryBorders] = useState<FeatureCollection | null>(null);
  // Gates the capital marker/label until the flyToBounds camera move has
  // actually finished, per spec ("only once the zoom-to-country animation
  // completes"), rather than appearing instantly alongside a still-moving
  // camera. A timer matching COUNTRY_ZOOM_DURATION is simpler and more
  // robust here than chaining off Leaflet's own moveend/zoomend events,
  // which can fire more than once (or not exactly at animation end) across
  // browsers during a flyToBounds animation.
  const [showCapital, setShowCapital] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(COUNTRY_BORDERS_URL)
      .then((res) => res.json())
      .then((data: FeatureCollection) => {
        if (cancelled) return;
        setCountryBorders({
          ...data,
          features: data.features.map((f) => ({ ...f, geometry: unwrapGeometry(f.geometry) })),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setShowCapital(false);
    if (selectedCountryId == null) return;
    const timer = setTimeout(() => setShowCapital(true), COUNTRY_ZOOM_DURATION * 1000);
    return () => clearTimeout(timer);
  }, [selectedCountryId]);

  useMapEvent("click", () => {
    onSelectCountry(null);
    map.flyTo(WORLD_VIEW, computeWorldFitZoom(map), { duration: WORLD_ZOOM_DURATION });
  });

  // Leaflet's Path.setStyle() only updates stroke/fill CSS properties - it
  // does not re-apply a `className` after the path element exists. The
  // glow effect is a CSS class, so it's toggled directly on the path's
  // DOM element (Path.getElement(), Leaflet 1.3+) whenever selection
  // changes, alongside the declarative colour/weight update.
  useEffect(() => {
    geoJsonRef.current?.eachLayer((layer) => {
      const path = layer as L.Path & { feature?: Feature };
      const isSelected = isFeatureSelected(path.feature, selectedCountryId);
      path.setStyle(countryOutlineStyle(path.feature, selectedCountryId));
      path.getElement()?.classList.toggle("venueguard-country-outline-selected", isSelected);
    });
  }, [selectedCountryId]);

  function onEachFeature(feature: Feature, layer: L.Layer) {
    layer.on("click", (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
      onSelectCountry(feature.id != null ? String(feature.id) : null);

      // Zoom to the primary/largest landmass only, not a bounding box
      // spanning every part of a multi-part country (see
      // getPrimaryPolygonBounds) - the full geometry still renders via
      // the GeoJSON layer above, unaffected by this bounds choice.
      const bounds = getPrimaryPolygonBounds(feature.geometry);
      if (bounds) {
        map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 6, duration: COUNTRY_ZOOM_DURATION });
      }
    });
  }

  if (!countryBorders) return null;

  const selectedFeature =
    selectedCountryId != null
      ? countryBorders.features.find((f) => f.id != null && String(f.id) === selectedCountryId)
      : undefined;
  const satelliteBoundsSegments = selectedFeature ? getSatelliteBoundsSegments(selectedFeature.geometry) : [];
  const capital = selectedCountryId != null ? COUNTRY_CAPITALS[selectedCountryId] : undefined;

  return (
    <>
      {/* Satellite imagery only covers the selected country's own bounds
          (split at the antimeridian if needed, see
          getSatelliteBoundsSegments) - never the whole world - and only
          mounts while a country is selected, so it's fully unmounted
          (not just hidden) the moment the view returns to the vector
          world map. */}
      {satelliteBoundsSegments.map((segmentBounds, index) => (
        <TileLayer
          key={`${selectedCountryId}-satellite-${index}`}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
          noWrap
          bounds={segmentBounds}
        />
      ))}

      <GeoJSON
        ref={geoJsonRef}
        data={countryBorders}
        style={(feature) => countryOutlineStyle(feature, selectedCountryId)}
        onEachFeature={onEachFeature}
      />

      {showCapital && capital && (
        <CircleMarker
          key={selectedCountryId}
          className="venueguard-capital-marker"
          center={capital.position}
          radius={5}
          pathOptions={{
            color: "#f1f5f9",
            fillColor: "#f1f5f9",
            fillOpacity: 0.95,
            weight: 1.5,
          }}
        >
          <Tooltip className="venueguard-marker-tooltip" direction="right" offset={[8, 0]} permanent>
            {capital.name}
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
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

const WORLD_VIEW: [number, number] = [44, 11];

// computeWorldFitZoom's width-fit branch implicitly assumed the
// visible half-span from WORLD_VIEW's center could always be exactly
// 180deg (i.e. the container width maps to one full 360deg world).
// That assumption silently requires the center longitude to be
// equidistant from the antimeridian on both sides - WORLD_VIEW's
// center (11deg E) is not. Measured directly against the actual
// dataset (post unwrapGeometry/alignCrossingRings): the US's
// westernmost point (the Aleutian chain, down to -178.19deg) needs a
// 189.19deg half-span to stay on screen, while Russia's easternmost
// point (the Chukotka peninsula, up to 190.27deg) only needs 179.27deg.
// A fixed 180deg half-span left the Aleutians' westernmost tip's
// bounding box starting at x=-32 in a 1288px-wide viewport (genuinely
// off-screen, confirmed via the rendered path's own getBoundingClientRect)
// while giving Russia's tip only ~2px of margin on the other edge
// (technically on-screen, but pixel-thin enough to read as clipped).
// Using the larger of the two real requirements, plus a small safety
// margin, fits both comfortably instead of assuming symmetry that
// isn't actually there.
const WORLD_HALF_SPAN_DEG =
  Math.max(
    WORLD_VIEW[1] - -178.19, // US: Aleutian Islands westernmost point
    190.27 - WORLD_VIEW[1], // Russia: Chukotka easternmost point (post-alignment)
  ) + 3;

// The night-map image's own render window - it was generated with its
// seam deliberately placed at 191.1deg (=-168.9deg) rather than the
// standard +-180deg, specifically so Russia's full mainland (max
// 190.27deg) and Alaska's full mainland (min -168.09deg) both render
// whole, on the correct side, with a small margin to spare, instead of
// one of them being clipped or duplicated at a seam that would
// otherwise fall inside one of their landmasses. This is (within
// 0.1deg) the same antipodal seam this app's own WORLD_VIEW center
// already implies (11deg + 180deg = 191deg), so it lines up with the
// existing vector country borders without needing to touch the
// framing. Latitude is capped at the standard Web Mercator limit
// (matching Leaflet's own default CRS), not +-90, since the image was
// rendered with that same projection.
const NIGHT_MAP_BOUNDS: L.LatLngBoundsExpression = [
  [-85.05112877980659, -168.9],
  [85.05112877980659, 191.1],
];

// Current Operating Conditions - locked to these four levels plus the
// "No Data" marker state (docs/Operations-Centre-v1.md).
const STATUS_COLORS: Record<OperatingStatus, string> = {
  Normal: "#22c55e",
  Elevated: "#f59e0b",
  High: "#f97316",
  Severe: "#ef4444",
  "No Data": "#94a3b8",
};

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
// are the only way to zoom. Colour-coded operational markers sit on top.
// Nothing else renders yet - Layers 2-7 (including Layer 8: Status
// Legend) are built and approved one at a time per the Debug Layer Rule.
function MapLayer() {
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);

  return (
    <div data-layer="1" className="absolute inset-0 z-[1] h-full w-full">
      <MapContainer
        center={WORLD_VIEW}
        zoom={2}
        maxZoom={16}
        zoomSnap={0}
        zoomDelta={1}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl
        attributionControl={false}
        className="venueguard-operational-canvas-map h-full w-full"
      >
        <MapLock />
        <WorldFitZoom />
        {/* Earth-at-Night base layer only mounts for the default/world
            view. It's fully unmounted (not just hidden) the moment a
            country is selected, since the amber city-lights glow baked
            into this image would otherwise sit awkwardly underneath the
            real satellite imagery that covers the selected country -
            the gap outside the satellite tiles' bounds falls back to
            the map's own ocean-colour background instead. */}
        {selectedCountryId == null && <ImageOverlay url={NIGHT_MAP_URL} bounds={NIGHT_MAP_BOUNDS} />}

        <CountrySelect selectedCountryId={selectedCountryId} onSelectCountry={setSelectedCountryId} />

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
    </div>
  );
}