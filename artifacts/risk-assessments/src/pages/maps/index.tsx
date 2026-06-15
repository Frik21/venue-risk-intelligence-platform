import { useQuery } from "@tanstack/react-query";
import { api, type Venue, type Incident } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { Map, Building2, AlertTriangle, Layers } from "lucide-react";
import { getSeverityColor } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

// Leaflet imports — loaded client side only
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, LayersControl } from "react-leaflet";

// Fix leaflet default icon in vite/webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const SEVERITY_CIRCLE_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high:     "#ea580c",
  medium:   "#d97706",
  low:      "#16a34a",
};

const venueIcon = L.divIcon({
  html: `<div style="width:28px;height:28px;background:#2563eb;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

export default function MapsPage() {
  const [layer, setLayer] = useState<"venues" | "incidents" | "both">("both");
  const [selectedVenueStr, setSelectedVenueStr] = useState<string>("all");
  const selectedVenue = selectedVenueStr === "all" ? null : Number(selectedVenueStr);

  const { data: venues = [], isLoading: vLoading } = useQuery<Venue[]>({
    queryKey: ["venues"],
    queryFn: api.venues.list,
  });
  const { data: incidents = [], isLoading: iLoading } = useQuery<Incident[]>({
    queryKey: ["incidents"],
    queryFn: api.incidents.list,
  });

  const mappableVenues = venues.filter(v => v.lat !== null && v.lng !== null);
  const mappableIncidents = incidents.filter(i => i.lat !== null && i.lng !== null);

  const isLoading = vLoading || iLoading;

  // Center map on first venue or world center
  const center: [number, number] = mappableVenues.length > 0
    ? [mappableVenues[0].lat!, mappableVenues[0].lng!]
    : [20, 0];

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Intelligence Map</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {mappableVenues.length} venue{mappableVenues.length !== 1 ? "s" : ""} ·{" "}
            {mappableIncidents.length} incident{mappableIncidents.length !== 1 ? "s" : ""} plotted
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Select value={layer} onValueChange={v => setLayer(v as any)}>
            <SelectTrigger className="w-44">
              <Layers className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Venues + Incidents</SelectItem>
              <SelectItem value="venues">Venues only</SelectItem>
              <SelectItem value="incidents">Incidents only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedVenueStr} onValueChange={setSelectedVenueStr}>
            <SelectTrigger className="w-52">
              <Building2 className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Filter by venue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {mappableVenues.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Legend */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Legend</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs">
            {(layer === "venues" || layer === "both") && (
              <div>
                <div className="font-semibold text-slate-600 mb-1.5">Venues</div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow" />
                  <span>Mapped venue</span>
                </div>
              </div>
            )}
            {(layer === "incidents" || layer === "both") && (
              <div>
                <div className="font-semibold text-slate-600 mb-1.5">Incidents by Severity</div>
                {[
                  { sev: "critical", label: "Critical" },
                  { sev: "high",     label: "High" },
                  { sev: "medium",   label: "Medium" },
                  { sev: "low",      label: "Low" },
                ].map(({ sev, label }) => (
                  <div key={sev} className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full border border-white shadow" style={{ background: SEVERITY_CIRCLE_COLORS[sev] }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 text-slate-400">
              {mappableVenues.length === 0 && <p className="italic">Add coordinates to venues to plot them</p>}
            </div>
          </CardContent>
        </Card>

        {/* Map */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <Skeleton className="h-[520px] rounded-xl" />
          ) : (
            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 520 }}>
              <MapContainer center={center} zoom={mappableVenues.length > 0 ? 10 : 2} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Venue markers */}
                {(layer === "venues" || layer === "both") &&
                  mappableVenues
                    .filter(v => !selectedVenue || v.id === selectedVenue)
                    .map((v) => (
                      <Marker key={`venue-${v.id}`} position={[v.lat!, v.lng!]} icon={venueIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold text-slate-900">{v.name}</div>
                            <div className="text-slate-500">{v.city}, {v.country}</div>
                            <div className="text-slate-500 capitalize text-xs mt-1">{v.venueType}</div>
                            <div className="text-blue-600 text-xs mt-1">
                              {v.assessmentCount} assessment{v.assessmentCount !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                {/* Incident circles */}
                {(layer === "incidents" || layer === "both") &&
                  mappableIncidents
                    .filter(inc => !selectedVenue || inc.venueId === selectedVenue)
                    .map((inc) => (
                      <CircleMarker
                        key={`inc-${inc.id}`}
                        center={[inc.lat!, inc.lng!]}
                        radius={inc.severity === "critical" ? 10 : inc.severity === "high" ? 8 : 6}
                        pathOptions={{
                          color: SEVERITY_CIRCLE_COLORS[inc.severity] ?? "#64748b",
                          fillColor: SEVERITY_CIRCLE_COLORS[inc.severity] ?? "#64748b",
                          fillOpacity: 0.6,
                          weight: 2,
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold capitalize text-slate-800">{inc.incidentType.replace(/_/g, " ")}</div>
                            <div className="text-slate-500 mt-0.5">{inc.summary}</div>
                            <div className="text-xs text-slate-400 mt-1">
                              {inc.severity.toUpperCase()} · {new Date(inc.incidentDate).toLocaleDateString()}
                            </div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
              </MapContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
