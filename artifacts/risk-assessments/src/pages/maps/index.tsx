import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Venue, type Incident, type Route, type Waypoint, type RouteType, type RouteCreationMethod } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useRef, useState } from "react";
import {
  Map, Building2, AlertTriangle, Layers, Plus, Trash2, CheckCircle2,
  Navigation, ChevronRight, ChevronLeft, Route as RouteIcon, BarChart2,
  MousePointer2, Edit3, List, RefreshCw, Shield, Crosshair,
} from "lucide-react";
import { getSeverityColor, getRouteTypeColor, getRouteTypeLabel, formatDistance, formatTravelTime, getPriorityColor, ROUTE_TYPES, ROUTE_CREATION_METHODS, ROUTE_CONSTRAINTS } from "@/lib/display-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer, TileLayer, Marker, Popup, CircleMarker,
  Polyline, useMapEvents, useMap,
} from "react-leaflet";

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const SEVERITY_CIRCLE_COLORS: Record<string, string> = {
  critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a",
};

function makeVenueIcon(color = "#2563eb") {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

function makePointIcon(color: string, label: string) {
  return L.divIcon({
    html: `<div style="width:24px;height:24px;background:${color};border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:bold">${label}</div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ── Map click handler for route drawing ──────────────────────────────────────

type DrawMode = "idle" | "start" | "end" | "waypoint" | "freehand";

interface MapClickHandlerProps {
  drawMode: DrawMode;
  onStart: (lat: number, lng: number) => void;
  onEnd: (lat: number, lng: number) => void;
  onWaypoint: (lat: number, lng: number) => void;
}

function MapClickHandler({ drawMode, onStart, onEnd, onWaypoint }: MapClickHandlerProps) {
  useMapEvents({
    click(e) {
      if (drawMode === "start") onStart(e.latlng.lat, e.latlng.lng);
      else if (drawMode === "end") onEnd(e.latlng.lat, e.latlng.lng);
      else if (drawMode === "waypoint" || drawMode === "freehand") onWaypoint(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Auto-pan map to a coordinate
function MapFlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], Math.max(map.getZoom(), 13)); }, [lat, lng]);
  return null;
}

// ── Route form state ─────────────────────────────────────────────────────────

interface RouteForm {
  routeName: string;
  routeType: RouteType;
  creationMethod: RouteCreationMethod;
  startLabel: string;
  startLat: number | null;
  startLng: number | null;
  endLabel: string;
  endLat: number | null;
  endLng: number | null;
  waypoints: Waypoint[];
  streets: string;
  analystNotes: string;
  constraints: string[];
  assessmentId: string;
  venueId: string;
}

const defaultForm = (): RouteForm => ({
  routeName: "", routeType: "primary_extraction", creationMethod: "endpoint_marker",
  startLabel: "Start", startLat: null, startLng: null,
  endLabel: "End", endLat: null, endLng: null,
  waypoints: [], streets: "", analystNotes: "", constraints: [],
  assessmentId: "", venueId: "",
});

// ── Route intelligence findings panel ────────────────────────────────────────

function FindingsPanel({ route, onClose }: { route: Route; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: findings = [], isLoading } = useQuery({
    queryKey: ["routes", route.id, "findings"],
    queryFn: () => api.routes.findings(route.id),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => api.routes.analyze(route.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routes", route.id, "findings"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Corridor Intelligence</h4>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
          <RefreshCw className={cn("w-3 h-3 mr-1", analyzeMutation.isPending && "animate-spin")} />
          Re-analyse
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-1">{[1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : findings.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">No intelligence findings</div>
      ) : (
        <div className="space-y-2">
          {findings.map((f) => (
            <div key={f.id} className="border border-slate-200 rounded-md p-2 bg-white">
              <div className="flex items-start gap-2">
                <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded border uppercase shrink-0", getPriorityColor(f.severity))}>
                  {f.severity}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-700 leading-snug">{f.summary}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    {f.distanceFromRoute && <span>{f.distanceFromRoute}m from route</span>}
                    {f.sourceName && <span>{f.sourceName}</span>}
                    {f.verified && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MapsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Map & layer state
  const [layerFilter, setLayerFilter] = useState<"all" | "venues" | "incidents" | "routes">("all");
  const [selectedVenueStr, setSelectedVenueStr] = useState("all");
  const selectedVenueId = selectedVenueStr === "all" ? null : Number(selectedVenueStr);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<"routes" | "create">("routes");
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [showFindings, setShowFindings] = useState(false);

  // Drawing state
  const [drawMode, setDrawMode] = useState<DrawMode>("idle");
  const [form, setForm] = useState<RouteForm>(defaultForm());
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  // Data
  const { data: venues = [], isLoading: vLoading } = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: incidents = [], isLoading: iLoading } = useQuery({ queryKey: ["incidents"], queryFn: api.incidents.list });
  const { data: routes = [], isLoading: rLoading } = useQuery({
    queryKey: ["routes", selectedVenueId],
    queryFn: () => api.routes.list(selectedVenueId ? { venueId: selectedVenueId } : undefined),
  });
  const { data: assessments = [] } = useQuery({ queryKey: ["assessments"], queryFn: api.assessments.list });

  const mappableVenues = venues.filter(v => v.lat && v.lng);
  const mappableIncidents = incidents.filter(i => i.lat && i.lng);
  const mappableRoutes = routes.filter(r => r.startLat && r.startLng);

  const center: [number, number] = mappableVenues.length > 0
    ? [mappableVenues[0].lat!, mappableVenues[0].lng!]
    : [20, 0];

  const isLoading = vLoading || iLoading || rLoading;

  // Route creation mutation
  const createMutation = useMutation({
    mutationFn: () => {
      const waypoints = form.creationMethod === "street_builder"
        ? form.streets.split("\n").filter(Boolean).map((s, i) => ({ label: s.trim(), lat: 0, lng: 0 }))
        : form.waypoints;
      return api.routes.create({
        routeName: form.routeName,
        routeType: form.routeType,
        creationMethod: form.creationMethod,
        startLabel: form.startLabel || undefined,
        startLat: form.startLat ?? undefined,
        startLng: form.startLng ?? undefined,
        endLabel: form.endLabel || undefined,
        endLat: form.endLat ?? undefined,
        endLng: form.endLng ?? undefined,
        waypointsJson: waypoints.length > 0 ? waypoints : undefined,
        constraints: form.constraints.length > 0 ? form.constraints : undefined,
        analystNotes: form.analystNotes || undefined,
        assessmentId: form.assessmentId && form.assessmentId !== "none" ? Number(form.assessmentId) : undefined,
        venueId: form.venueId && form.venueId !== "none" ? Number(form.venueId) : (selectedVenueId ?? undefined),
        ...(form.creationMethod === "freehand_draw" && form.waypoints.length >= 2
          ? {
              routeGeometryGeojson: {
                type: "LineString",
                coordinates: form.waypoints.map(w => [w.lng, w.lat]),
              },
            }
          : {}),
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      toast({ title: `Route "${r.routeName}" created`, description: r.findings?.length ? `${r.findings.length} corridor findings detected` : undefined });
      setForm(defaultForm());
      setDrawMode("idle");
      setPanelTab("routes");
      setSelectedRoute(r);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.routes.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      setSelectedRoute(null);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => api.routes.verify(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      setSelectedRoute(r);
      toast({ title: "Route verified" });
    },
  });

  // Map click handlers
  const handleMapStart = (lat: number, lng: number) => {
    setForm(f => ({ ...f, startLat: lat, startLng: lng, startLabel: f.startLabel || `Start (${lat.toFixed(4)}, ${lng.toFixed(4)})` }));
    setDrawMode(form.creationMethod === "freehand_draw" ? "freehand" : "end");
    setFlyTarget({ lat, lng });
  };

  const handleMapEnd = (lat: number, lng: number) => {
    setForm(f => ({ ...f, endLat: lat, endLng: lng, endLabel: f.endLabel || `End (${lat.toFixed(4)}, ${lng.toFixed(4)})` }));
    setDrawMode("idle");
  };

  const handleMapWaypoint = (lat: number, lng: number) => {
    setForm(f => ({ ...f, waypoints: [...f.waypoints, { lat, lng }] }));
  };

  // Build route polyline coordinates
  function getRouteCoords(route: Route): [number, number][] {
    if (route.routeGeometryGeojson?.type === "LineString" && route.routeGeometryGeojson.coordinates) {
      return route.routeGeometryGeojson.coordinates.map(([lng, lat]) => [lat, lng]);
    }
    const pts: [number, number][] = [];
    if (route.startLat && route.startLng) pts.push([route.startLat, route.startLng]);
    if (route.waypointsJson) route.waypointsJson.forEach(w => pts.push([w.lat, w.lng]));
    if (route.endLat && route.endLng) pts.push([route.endLat, route.endLng]);
    return pts;
  }

  // Live drawing polyline for freehand
  const liveDrawCoords: [number, number][] = [];
  if (form.startLat && form.startLng) liveDrawCoords.push([form.startLat, form.startLng]);
  form.waypoints.forEach(w => liveDrawCoords.push([w.lat, w.lng]));
  if (form.endLat && form.endLng) liveDrawCoords.push([form.endLat, form.endLng]);

  // Cursor style on map based on draw mode
  const mapCursorStyle = drawMode !== "idle" ? { cursor: "crosshair" } : {};

  const isDrawing = drawMode !== "idle";
  const canSave = !!(form.routeName &&
    (form.creationMethod === "street_builder" ? form.streets.trim().length > 0 : form.startLat !== null) &&
    (form.creationMethod === "endpoint_marker" ? form.endLat !== null : true));

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Intelligence Map</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {mappableVenues.length} venue{mappableVenues.length !== 1 ? "s" : ""} ·{" "}
            {mappableIncidents.length} incident{mappableIncidents.length !== 1 ? "s" : ""} ·{" "}
            {routes.length} route{routes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={layerFilter} onValueChange={v => setLayerFilter(v as any)}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-400" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Layers</SelectItem>
              <SelectItem value="venues">Venues only</SelectItem>
              <SelectItem value="incidents">Incidents only</SelectItem>
              <SelectItem value="routes">Routes only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedVenueStr} onValueChange={setSelectedVenueStr}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <Building2 className="w-3.5 h-3.5 mr-1.5 text-slate-400" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {mappableVenues.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Map + Panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 min-w-0 relative" style={mapCursorStyle}>
          {isDrawing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
              <Crosshair className="w-3.5 h-3.5" />
              {drawMode === "start" ? "Click map to place START point" :
               drawMode === "end" ? "Click map to place END point" :
               drawMode === "freehand" ? `${form.waypoints.length + (form.startLat ? 1 : 0)} points — click to add, Save when done` :
               "Click map to add waypoint"}
            </div>
          )}

          {isLoading ? (
            <Skeleton className="h-full min-h-[500px] rounded-xl" />
          ) : (
            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm h-full min-h-[500px]">
              <MapContainer center={center} zoom={mappableVenues.length > 0 ? 12 : 2} style={{ height: "100%", width: "100%" }}>
                {flyTarget && <MapFlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
                <MapClickHandler
                  drawMode={drawMode}
                  onStart={handleMapStart}
                  onEnd={handleMapEnd}
                  onWaypoint={handleMapWaypoint}
                />

                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Venue markers */}
                {(layerFilter === "all" || layerFilter === "venues") &&
                  mappableVenues.filter(v => !selectedVenueId || v.id === selectedVenueId).map(v => (
                    <Marker key={`v-${v.id}`} position={[v.lat!, v.lng!]} icon={makeVenueIcon()}>
                      <Popup>
                        <div className="text-sm">
                          <div className="font-bold">{v.name}</div>
                          <div className="text-slate-500 text-xs">{v.city}, {v.country}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                {/* Incident circles */}
                {(layerFilter === "all" || layerFilter === "incidents") &&
                  mappableIncidents.filter(i => !selectedVenueId || i.venueId === selectedVenueId).map(i => (
                    <CircleMarker key={`i-${i.id}`}
                      center={[i.lat!, i.lng!]}
                      radius={i.severity === "critical" ? 10 : i.severity === "high" ? 8 : 6}
                      pathOptions={{ color: SEVERITY_CIRCLE_COLORS[i.severity], fillColor: SEVERITY_CIRCLE_COLORS[i.severity], fillOpacity: 0.6, weight: 2 }}>
                      <Popup>
                        <div className="text-sm">
                          <div className="font-bold capitalize">{i.incidentType.replace(/_/g, " ")}</div>
                          <div className="text-slate-500">{i.summary}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{i.severity.toUpperCase()}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}

                {/* Route polylines */}
                {(layerFilter === "all" || layerFilter === "routes") &&
                  mappableRoutes.filter(r => !selectedVenueId || r.venueId === selectedVenueId).map(r => {
                    const coords = getRouteCoords(r);
                    if (coords.length < 2) return null;
                    const color = getRouteTypeColor(r.routeType);
                    const isSelected = selectedRoute?.id === r.id;
                    return (
                      <Polyline key={`r-${r.id}`}
                        positions={coords}
                        pathOptions={{ color, weight: isSelected ? 6 : 4, opacity: isSelected ? 1 : 0.7, dashArray: r.verified ? undefined : "8 4" }}
                        eventHandlers={{ click: () => { setSelectedRoute(r); setPanelTab("routes"); setShowFindings(false); } }}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold">{r.routeName}</div>
                            <div className="text-slate-500 text-xs capitalize">{getRouteTypeLabel(r.routeType)}</div>
                            {r.estimatedDistance && <div className="text-xs text-slate-400">{formatDistance(r.estimatedDistance)} · {formatTravelTime(r.estimatedTravelTime)}</div>}
                            {r.verified && <div className="text-xs text-green-600 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</div>}
                          </div>
                        </Popup>
                      </Polyline>
                    );
                  })}

                {/* Route start/end markers */}
                {(layerFilter === "all" || layerFilter === "routes") &&
                  mappableRoutes.filter(r => !selectedVenueId || r.venueId === selectedVenueId).map(r => (
                    <span key={`rm-${r.id}`}>
                      {r.startLat && r.startLng && (
                        <Marker position={[r.startLat, r.startLng]} icon={makePointIcon(getRouteTypeColor(r.routeType), "S")}>
                          <Popup><div className="text-xs font-medium">{r.startLabel ?? "Start"}<br /><span className="text-slate-500">{r.routeName}</span></div></Popup>
                        </Marker>
                      )}
                      {r.endLat && r.endLng && (
                        <Marker position={[r.endLat, r.endLng]} icon={makePointIcon(getRouteTypeColor(r.routeType), "E")}>
                          <Popup><div className="text-xs font-medium">{r.endLabel ?? "End"}<br /><span className="text-slate-500">{r.routeName}</span></div></Popup>
                        </Marker>
                      )}
                    </span>
                  ))}

                {/* Live draw preview */}
                {liveDrawCoords.length >= 1 && form.startLat && (
                  <>
                    <Marker position={[form.startLat, form.startLng!]} icon={makePointIcon("#2563eb", "S")} />
                    {form.endLat && <Marker position={[form.endLat, form.endLng!]} icon={makePointIcon("#2563eb", "E")} />}
                    {form.waypoints.map((w, i) => (
                      <CircleMarker key={i} center={[w.lat, w.lng]} radius={5} pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.8 }} />
                    ))}
                    {liveDrawCoords.length >= 2 && (
                      <Polyline positions={liveDrawCoords} pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.8, dashArray: "6 4" }} />
                    )}
                  </>
                )}
              </MapContainer>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className={cn("flex flex-col transition-all duration-200 shrink-0", panelOpen ? "w-80" : "w-10")}>
          {/* Collapse toggle */}
          <button
            onClick={() => setPanelOpen(o => !o)}
            className="h-10 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 mb-2"
          >
            {panelOpen ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronLeft className="w-4 h-4 text-slate-500" />}
          </button>

          {panelOpen && (
            <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <Tabs value={panelTab} onValueChange={v => { setPanelTab(v as any); setDrawMode("idle"); }}>
                <TabsList className="w-full rounded-none border-b bg-slate-50 p-0 h-10">
                  <TabsTrigger value="routes" className="flex-1 rounded-none h-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
                    <List className="w-3.5 h-3.5 mr-1" /> Routes ({routes.length})
                  </TabsTrigger>
                  <TabsTrigger value="create" className="flex-1 rounded-none h-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Create
                  </TabsTrigger>
                </TabsList>

                {/* Routes list */}
                <TabsContent value="routes" className="flex-1 overflow-y-auto mt-0 p-0">
                  {selectedRoute && !showFindings ? (
                    <RouteDetailPanel
                      route={selectedRoute}
                      onBack={() => setSelectedRoute(null)}
                      onVerify={() => verifyMutation.mutate(selectedRoute.id)}
                      onDelete={() => { if (confirm("Delete route?")) { deleteMutation.mutate(selectedRoute.id); } }}
                      onShowFindings={() => setShowFindings(true)}
                      verifying={verifyMutation.isPending}
                    />
                  ) : selectedRoute && showFindings ? (
                    <div className="p-3">
                      <button className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-3" onClick={() => setShowFindings(false)}>
                        ← {selectedRoute.routeName}
                      </button>
                      <FindingsPanel route={selectedRoute} onClose={() => setShowFindings(false)} />
                    </div>
                  ) : routes.length === 0 ? (
                    <div className="py-10 text-center px-4">
                      <RouteIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-500 font-medium mb-1">No routes yet</p>
                      <p className="text-xs text-slate-400 mb-3">Create operational routes linked to this venue or assessment</p>
                      <Button size="sm" onClick={() => setPanelTab("create")}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Create Route
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {/* Legend */}
                      <div className="p-3 bg-slate-50 border-b border-slate-100">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Route Types</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                          {ROUTE_TYPES.slice(0, 6).map(rt => (
                            <div key={rt.value} className="flex items-center gap-1.5">
                              <div className="w-3 h-1.5 rounded-full shrink-0" style={{ background: rt.color }} />
                              <span className="text-[10px] text-slate-500 truncate">{rt.label.split(" ").slice(0, 2).join(" ")}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {routes.map(r => (
                        <button
                          key={r.id}
                          className={cn("w-full text-left px-3 py-3 hover:bg-slate-50 transition-colors", selectedRoute?.id === r.id && "bg-blue-50")}
                          onClick={() => { setSelectedRoute(r); setShowFindings(false); }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: getRouteTypeColor(r.routeType) }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-800 truncate">{r.routeName}</span>
                                {r.verified && <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{getRouteTypeLabel(r.routeType)}</div>
                              {r.estimatedDistance && (
                                <div className="text-[10px] text-slate-400">{formatDistance(r.estimatedDistance)} · {formatTravelTime(r.estimatedTravelTime)}</div>
                              )}
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Create route */}
                <TabsContent value="create" className="flex-1 overflow-y-auto mt-0">
                  <CreateRoutePanel
                    form={form}
                    setForm={setForm}
                    drawMode={drawMode}
                    setDrawMode={setDrawMode}
                    assessments={assessments}
                    venues={venues}
                    canSave={canSave}
                    saving={createMutation.isPending}
                    onSave={() => createMutation.mutate()}
                    onReset={() => { setForm(defaultForm()); setDrawMode("idle"); }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Route detail panel ────────────────────────────────────────────────────────

function RouteDetailPanel({ route, onBack, onVerify, onDelete, onShowFindings, verifying }: {
  route: Route; onBack: () => void; onVerify: () => void; onDelete: () => void;
  onShowFindings: () => void; verifying: boolean;
}) {
  return (
    <div className="p-3 space-y-3">
      <button className="text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={onBack}>
        ← All routes
      </button>

      <div>
        <div className="flex items-start gap-2 mb-2">
          <div className="w-3 h-3 rounded-full mt-0.5 shrink-0" style={{ background: getRouteTypeColor(route.routeType) }} />
          <div>
            <div className="font-semibold text-slate-900 text-sm">{route.routeName}</div>
            <div className="text-xs text-slate-500">{getRouteTypeLabel(route.routeType)}</div>
          </div>
          {route.verified && (
            <Badge className="ml-auto text-[10px] bg-green-100 text-green-700 border-green-200">Verified</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {route.estimatedDistance && (
            <div className="bg-slate-50 rounded p-2 text-center">
              <div className="font-bold text-slate-800">{formatDistance(route.estimatedDistance)}</div>
              <div className="text-slate-400">Distance</div>
            </div>
          )}
          {route.estimatedTravelTime && (
            <div className="bg-slate-50 rounded p-2 text-center">
              <div className="font-bold text-slate-800">{formatTravelTime(route.estimatedTravelTime)}</div>
              <div className="text-slate-400">Est. Time</div>
            </div>
          )}
        </div>
      </div>

      {route.startLabel && (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">S</div><span className="text-slate-600">{route.startLabel}</span></div>
          {route.endLabel && <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] font-bold flex items-center justify-center">E</div><span className="text-slate-600">{route.endLabel}</span></div>}
        </div>
      )}

      {route.constraints && Array.isArray(route.constraints) && route.constraints.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Constraints</div>
          <div className="flex flex-wrap gap-1">
            {route.constraints.map((c, i) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}
          </div>
        </div>
      )}

      {route.analystNotes && (
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Analyst Notes</div>
          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-100 p-2 rounded">{route.analystNotes}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
        <Button size="sm" variant="outline" className="w-full text-xs h-7 justify-start" onClick={onShowFindings}>
          <BarChart2 className="w-3 h-3 mr-1.5" /> View Corridor Intelligence
        </Button>
        {!route.verified && (
          <Button size="sm" className="w-full text-xs h-7 justify-start bg-green-600 hover:bg-green-700" onClick={onVerify} disabled={verifying}>
            <CheckCircle2 className="w-3 h-3 mr-1.5" /> {verifying ? "Verifying..." : "Mark as Verified"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="w-full text-xs h-7 justify-start text-red-500 hover:text-red-700" onClick={onDelete}>
          <Trash2 className="w-3 h-3 mr-1.5" /> Delete Route
        </Button>
      </div>
    </div>
  );
}

// ── Create route panel ────────────────────────────────────────────────────────

function CreateRoutePanel({ form, setForm, drawMode, setDrawMode, assessments, venues, canSave, saving, onSave, onReset }: {
  form: RouteForm;
  setForm: React.Dispatch<React.SetStateAction<RouteForm>>;
  drawMode: DrawMode;
  setDrawMode: (m: DrawMode) => void;
  assessments: any[];
  venues: any[];
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const set = (k: keyof RouteForm, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleConstraint = (c: string) => {
    setForm(f => ({
      ...f,
      constraints: f.constraints.includes(c) ? f.constraints.filter(x => x !== c) : [...f.constraints, c],
    }));
  };

  return (
    <div className="p-3 space-y-4">
      {/* Route name + type */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Route Name *</Label>
          <Input className="h-8 text-xs mt-1" placeholder="e.g. Primary Extraction Route A" value={form.routeName} onChange={e => set("routeName", e.target.value)} />
        </div>

        <div>
          <Label className="text-xs">Route Type *</Label>
          <Select value={form.routeType} onValueChange={v => set("routeType", v as RouteType)}>
            <SelectTrigger className="h-8 text-xs mt-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getRouteTypeColor(form.routeType) }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {ROUTE_TYPES.map(rt => (
                <SelectItem key={rt.value} value={rt.value}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: rt.color }} />
                    {rt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Creation Method *</Label>
          <Select value={form.creationMethod} onValueChange={v => { set("creationMethod", v as RouteCreationMethod); setDrawMode("idle"); }}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROUTE_CREATION_METHODS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {ROUTE_CREATION_METHODS.find(m => m.value === form.creationMethod)?.description}
          </p>
        </div>
      </div>

      {/* Endpoint marker mode */}
      {form.creationMethod === "endpoint_marker" && (
        <div className="space-y-2 bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Endpoint Markers</div>
          <div className="space-y-1.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Start Label</Label>
                <Button
                  size="sm" variant={drawMode === "start" ? "default" : "outline"}
                  className="h-6 text-[10px] px-2"
                  onClick={() => setDrawMode(drawMode === "start" ? "idle" : "start")}
                >
                  <Crosshair className="w-3 h-3 mr-1" />
                  {form.startLat ? `${form.startLat.toFixed(3)}, ${form.startLng?.toFixed(3)}` : "Click map"}
                </Button>
              </div>
              <Input className="h-7 text-xs" placeholder="Start point label" value={form.startLabel} onChange={e => set("startLabel", e.target.value)} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">End Label</Label>
                <Button
                  size="sm" variant={drawMode === "end" ? "default" : "outline"}
                  className="h-6 text-[10px] px-2"
                  onClick={() => setDrawMode(drawMode === "end" ? "idle" : "end")}
                >
                  <Crosshair className="w-3 h-3 mr-1" />
                  {form.endLat ? `${form.endLat.toFixed(3)}, ${form.endLng?.toFixed(3)}` : "Click map"}
                </Button>
              </div>
              <Input className="h-7 text-xs" placeholder="End point label" value={form.endLabel} onChange={e => set("endLabel", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Freehand draw mode */}
      {form.creationMethod === "freehand_draw" && (
        <div className="space-y-2 bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Freehand Draw</div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={drawMode === "freehand" ? "default" : "outline"}
              className="h-7 text-xs flex-1"
              onClick={() => setDrawMode(drawMode === "freehand" ? "idle" : "freehand")}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" />
              {drawMode === "freehand" ? "Drawing…" : "Start Drawing"}
            </Button>
            {form.waypoints.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => setForm(f => ({ ...f, waypoints: [], startLat: null, startLng: null }))}>
                Clear
              </Button>
            )}
          </div>
          <p className="text-[10px] text-slate-400">
            {form.waypoints.length > 0 || form.startLat
              ? `${(form.startLat ? 1 : 0) + form.waypoints.length} point(s) drawn`
              : "Click the map to trace your route, point by point"}
          </p>
        </div>
      )}

      {/* Street builder mode */}
      {form.creationMethod === "street_builder" && (
        <div className="space-y-2 bg-slate-50 rounded-lg p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Street Names (one per line)</div>
          <Textarea
            className="text-xs resize-none"
            rows={4}
            placeholder={"Sheikh Zayed Road\nInterchange 3 slip road\nAl Meydan Road\nHyatt Regency driveway"}
            value={form.streets}
            onChange={e => set("streets", e.target.value)}
          />
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Start Coords</Label>
              <Button size="sm" variant={drawMode === "start" ? "default" : "outline"} className="h-6 text-[10px] px-2" onClick={() => setDrawMode(drawMode === "start" ? "idle" : "start")}>
                <Crosshair className="w-3 h-3 mr-1" /> {form.startLat ? `${form.startLat.toFixed(3)}, ${form.startLng?.toFixed(3)}` : "Click map"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Link to assessment / venue */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Assessment</Label>
          <Select value={form.assessmentId} onValueChange={v => set("assessmentId", v)}>
            <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {assessments.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.title.slice(0, 28)}{a.title.length > 28 ? "…" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Venue</Label>
          <Select value={form.venueId} onValueChange={v => set("venueId", v)}>
            <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {venues.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Constraints */}
      <div>
        <Label className="text-xs">Route Constraints</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {ROUTE_CONSTRAINTS.map(c => (
            <button
              key={c}
              onClick={() => toggleConstraint(c)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                form.constraints.includes(c)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Analyst notes */}
      <div>
        <Label className="text-xs">Analyst Notes</Label>
        <Textarea className="text-xs mt-1 resize-none" rows={2} placeholder="Route-specific observations, warnings, recommendations..." value={form.analystNotes} onChange={e => set("analystNotes", e.target.value)} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <Button size="sm" className="flex-1 text-xs h-8" onClick={onSave} disabled={saving || !canSave}>
          {saving ? "Saving…" : "Save Route"}
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-8" onClick={onReset}>Reset</Button>
      </div>

      <p className="text-[10px] text-slate-400 text-center">Route will be analysed for corridor intelligence on save</p>
    </div>
  );
}
