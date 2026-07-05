import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Tooltip, useMap, useMapEvent } from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import "leaflet/dist/leaflet.css";
import { ArrowRight, MapPin, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import { COUNTRY_CAPITALS } from "@/lib/country-capitals";

// Full-world country boundaries (Natural Earth, ~4MB) are served as a
// static asset and fetched at runtime rather than bundled into the JS
// build - keeps the app's core bundle lean regardless of dataset size.
const COUNTRY_BORDERS_URL = `${import.meta.env.BASE_URL}data/operational-country-borders.json`;

// Night-map base layer (dark landmass, black ocean, real amber city-light
// glow), served as standard Web Mercator XYZ tiles rather than one giant
// static image - see generate-night-map-tiles.py alongside the tiles/
// directory for the full pipeline/provenance (same country-borders dataset
// and real Natural Earth populated-places data as before). A single image
// large enough to stay crisp at country-zoom (16383px) fixed blur, but
// cost the browser several seconds to decode on every zoom transition,
// since it had to decode the same ~268 million pixels whether or not the
// viewport actually needed that much detail. Tiling fixes this the
// standard way every web map uses: only the handful of small tiles
// actually visible at the current zoom ever get decoded, so cost stays
// small regardless of the map's total resolution. Two full tile sets
// exist - lit (default world view) and lights-free (Index 1.3, country
// zoom) - selected by NightMapLayer below.
const NIGHT_MAP_LIT_TILES_URL = `${import.meta.env.BASE_URL}data/tiles/lit/{z}/{x}_{y}.webp`;
const NIGHT_MAP_NO_LIGHTS_TILES_URL = `${import.meta.env.BASE_URL}data/tiles/no-lights/{z}/{x}_{y}.webp`;

// 512px tiles (not the more typical 256px) - same total pixel density,
// but a quarter as many tiles cover any given viewport. This app's zoom
// changes are all animated flyToBounds calls that pass through several
// intermediate integer zoom levels, and Leaflet fetches tiles for each
// one even mid-animation - a single country selection was measured
// firing ~180 tile requests, most for zoom levels never actually seen
// at rest. Bigger tiles cut that request count (not just decode cost)
// proportionally - the fix for a "feels like slow internet" perception,
// as distinct from the earlier decode-time fix. zoomOffset=-1 below
// compensates in the map <-> tile-z mapping: our tile z is always one
// less than the map's own zoom, since each tile already covers 2x the
// linear ground a 256px tile would at that same map zoom.
const NIGHT_MAP_TILE_SIZE = 512;
const NIGHT_MAP_TILE_ZOOM_OFFSET = -1;

// Native resolution of each tile set, in map-zoom terms (i.e. already
// accounting for NIGHT_MAP_TILE_ZOOM_OFFSET) - Leaflet upscales beyond
// this rather than requesting tiles that don't exist. The lit set only
// ever needs to cover the default world-fit view (never higher, since
// Index 1.3 swaps to the no-lights set the moment a country is
// selected), so it stops well short of the no-lights set's full
// country-zoom range (matches this app's own flyToBounds maxZoom of 6).
const NIGHT_MAP_LIT_MAX_NATIVE_ZOOM = 5;
const NIGHT_MAP_NO_LIGHTS_MAX_NATIVE_ZOOM = 6;

// Background tone for the outer page wrapper (behind MapLayer), and the
// same tone the Leaflet container's own CSS fallback (index.css) uses
// for open ocean wherever no landmass fill covers it.
const OCEAN_COLOR = "#00081a";

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

// Belt-and-suspenders: the MapContainer interaction props already disable
// these handlers, but calling the imperative API too guarantees the
// Operational Canvas map starts fully static-locked (default world view)
// regardless of how the map instance was constructed. Scroll/double-click
// /touch/box-zoom/keyboard stay disabled permanently - nothing else in
// the app re-enables them. Dragging is the one exception: CountrySelect
// (Index 1.2) re-enables it only while zoomed in on a selected country,
// and disables it again the moment that selection clears.
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

// Fill is a near-invisible 0.01-opacity layer, not real landmass
// appearance - that's the raster night-map image underneath (see
// NightMapLayer). It exists only to keep each country's true shape
// clickable/hoverable everywhere within its borders, not just on the
// (invisible) outline itself. Only color/weight (the amber
// selected-country outline) change with selection.
function countryOutlineStyle(feature: Feature | undefined, selectedCountryId: string | null): L.PathOptions {
  const isSelected = isFeatureSelected(feature, selectedCountryId);
  return {
    color: isSelected ? "#FFB800" : "transparent",
    weight: isSelected ? 2 : 0,
    fillColor: "#000000",
    fillOpacity: isSelected ? 0 : 0.01,
  };
}

// Manual zoom control (Index 1.1): hidden on the default world view,
// shown only once a country's zoom-in animation completes ("visible"
// mirrors MapLayer's own zoomSettled timing exactly, for the same
// reason - wait for the flyToBounds move to actually finish). Built as a
// real Leaflet control (not plain positioned JSX) so it mounts/unmounts
// from the DOM entirely rather than just toggling a CSS class - "must
// not be visible" on the default view, not just visually hidden. Offers
// only a single zoom-out affordance, and that affordance is the same
// full reset to the world view used by click-outside-to-deselect, not
// Leaflet's own default zoomOut() (which would just step the zoom level
// down once, leaving the country still selected/outlined).
function ZoomOutControl({ visible, onZoomOut }: { visible: boolean; onZoomOut: () => void }) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return;

    const control = new L.Control({ position: "topleft" });
    control.onAdd = () => {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control-zoom");
      const link = L.DomUtil.create("a", "leaflet-control-zoom-out", container);
      link.href = "#";
      link.title = "Zoom out";
      link.setAttribute("role", "button");
      link.setAttribute("aria-label", "Zoom out");
      link.innerHTML = "&#8722;";
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, "click", (event: Event) => {
        L.DomEvent.preventDefault(event);
        onZoomOut();
      });
      return container;
    };
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [visible, map, onZoomOut]);

  return null;
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
  zoomSettled,
}: {
  selectedCountryId: string | null;
  onSelectCountry: (id: string | null) => void;
  zoomSettled: boolean;
}) {
  const map = useMap();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const [countryBorders, setCountryBorders] = useState<FeatureCollection | null>(null);

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

  // Free camera drag (Index 1.2) is enabled only in the zoomed-in-on-country
  // state, once the zoom-in animation has actually finished - the same
  // zoomSettled gate (owned by MapLayer) already used for the capital
  // marker, the 1.1 zoom-out control, and city-lights visibility, not a
  // separate timer. MapLock's own imperative dragging.disable() call
  // still runs once on mount (matching the default world view's static
  // lock); this effect is the only thing that re-enables it, and only
  // for the duration of a country selection. No maxBounds is set
  // anywhere, so once enabled this is unrestricted free panning - not a
  // bounded exception.
  useEffect(() => {
    if (zoomSettled) {
      map.dragging.enable();
    } else {
      map.dragging.disable();
    }
  }, [zoomSettled, map]);

  function resetToWorldView() {
    onSelectCountry(null);
    map.flyTo(WORLD_VIEW, computeWorldFitZoom(map), { duration: WORLD_ZOOM_DURATION });
  }

  useMapEvent("click", resetToWorldView);

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

  const capital = selectedCountryId != null ? COUNTRY_CAPITALS[selectedCountryId] : undefined;

  return (
    <>
      <GeoJSON
        ref={geoJsonRef}
        data={countryBorders}
        style={(feature) => countryOutlineStyle(feature, selectedCountryId)}
        onEachFeature={onEachFeature}
      />

      <ZoomOutControl visible={zoomSettled} onZoomOut={resetToWorldView} />

      {zoomSettled && capital && (
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

// Index 1.3: while zoomed into a country, the amber city-lights glow is
// hidden, but landmass/ocean/coastline texture must stay visible behind
// the outline - so this swaps to a genuinely separate tile set (baked
// without the city-lights pass, see generate-night-map-tiles.py), not a
// CSS filter or a conditional unmount of the whole layer. A `key` prop
// forces React to fully remount the TileLayer on swap rather than trying
// to reuse the existing one with a new url - Leaflet's own tile cache is
// keyed by tile coordinate, not by which url template produced it, so
// reusing the same layer instance across a url change could show stale
// tiles from the other set. Unlike the single-image approach this
// replaces, there's no custom edge-fade handling needed for wide
// viewports - standard Leaflet tile layers already wrap tile x-indices
// around the antimeridian automatically, the same way any other web map
// handles a viewport wider than 360deg of longitude.
function NightMapLayer({ noLights }: { noLights: boolean }) {
  // updateWhenZooming=false: Leaflet's default fetches tiles at every
  // *intermediate* integer zoom level a flyToBounds animation passes
  // through, not just the one the user actually ends up looking at - a
  // single country selection (animating from the world-fit zoom up to
  // zoom 6) fired ~180 tile requests this way, only ~30 of which were
  // for the final zoom. Deferring tile loads until the animation settles
  // cuts that to just the tiles actually needed. Harmless here since
  // there's no manual zoom control to make the in-between frames matter -
  // all zoom changes are the same handful of programmatic camera moves.
  return noLights ? (
    <TileLayer
      key="no-lights"
      url={NIGHT_MAP_NO_LIGHTS_TILES_URL}
      tileSize={NIGHT_MAP_TILE_SIZE}
      zoomOffset={NIGHT_MAP_TILE_ZOOM_OFFSET}
      maxNativeZoom={NIGHT_MAP_NO_LIGHTS_MAX_NATIVE_ZOOM}
      minZoom={0}
      updateWhenZooming={false}
    />
  ) : (
    <TileLayer
      key="lit"
      url={NIGHT_MAP_LIT_TILES_URL}
      tileSize={NIGHT_MAP_TILE_SIZE}
      zoomOffset={NIGHT_MAP_TILE_ZOOM_OFFSET}
      maxNativeZoom={NIGHT_MAP_LIT_MAX_NATIVE_ZOOM}
      minZoom={0}
      updateWhenZooming={false}
    />
  );
}

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

  // This wrapper's own background is a THIRD place a colour could
  // silently drift from the map's ocean tone (previously a separate
  // hardcoded #050816) - it now uses the exact same OCEAN_COLOR
  // constant as the Leaflet container's fallback, so there is no seam
  // possible between this wrapper and the map, regardless of how close
  // a hand-picked hex value might otherwise look.
  return (
    <div className="fixed inset-0 z-50 overflow-hidden text-white" style={{ backgroundColor: OCEAN_COLOR }}>
      <MapLayer />
    </div>
  );
}

// LAYER 1: Map (static)
// Base layer of the Operational Canvas stack. Default world view is
// fully static-locked (no drag/scroll/touch-pan). There is no manual
// zoom-in control at all; the only zoom changes are the programmatic
// camera moves triggered by selecting/deselecting a country (see
// CountrySelect/ZoomOutControl, Index 1.1) - dragging is the one
// exception, and only once zoomed in on a selected country (Index 1.2).
// Landmass/coastline/city-lights are static raster tiles (NightMapLayer),
// rasterized offline at this app's own native pixel density per zoom
// level, so they stay crisp at any zoom without ever decoding more
// resolution than the current viewport actually needs. Colour-coded
// operational markers sit on top. Nothing else renders yet - Layers 2-7
// (including
// Layer 8: Status Legend) are built and approved one at a time per the
// Debug Layer Rule.
function MapLayer() {
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  // True only once a country's zoom-in animation has actually finished -
  // gates the capital marker, the 1.1 zoom-out control, free drag (1.2),
  // and the night-map's lights-hidden variant below, all off this same
  // timing so they change state together. A timer matching COUNTRY_ZOOM_DURATION is
  // simpler and more robust here than chaining off Leaflet's own
  // moveend/zoomend events, which can fire more than once (or not
  // exactly at animation end) across browsers during a flyToBounds
  // animation. Resets to false immediately (not gated by a timer) the
  // instant a selection clears, via any exit path - only becoming true
  // again is delayed, never becoming false.
  const [zoomSettled, setZoomSettled] = useState(false);

  useEffect(() => {
    setZoomSettled(false);
    if (selectedCountryId == null) return;
    const timer = setTimeout(() => setZoomSettled(true), COUNTRY_ZOOM_DURATION * 1000);
    return () => clearTimeout(timer);
  }, [selectedCountryId]);

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
        zoomControl={false}
        attributionControl={false}
        className="venueguard-operational-canvas-map h-full w-full"
      >
        <MapLock />
        <WorldFitZoom />

        {/* Earth-at-Night is the only map rendering layer, full stop - it
            stays mounted for both the default world view and while a
            country is selected/zoomed in. There is no alternate
            rendering path (no satellite imagery) to switch to, only the
            lit vs. lights-free tile set (see NightMapLayer). Standard
            Leaflet tile wrapping handles any viewport wider than 360deg
            of longitude natively, without duplicating real geography.
            Per Index 1.3, the tile set swaps to lights-free once zoomed
            in on a country and settled, and swaps back immediately the
            moment a selection clears via any exit path - landmass/ocean/
            coastline stay visible throughout, only the city-lights glow
            toggles. */}
        <NightMapLayer noLights={zoomSettled} />

        <CountrySelect
          selectedCountryId={selectedCountryId}
          onSelectCountry={setSelectedCountryId}
          zoomSettled={zoomSettled}
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
    </div>
  );
}