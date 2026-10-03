import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { api, type LiveOperatorPosition } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, MapPin } from "lucide-react";
import { timeAgo } from "@/lib/display-utils";
import { SafetyAlertsPanel, FieldIncidentReportsPanel } from "@/pages/alerts/list";
import CommunicationsPage from "@/pages/admin/communications";

// GSOC's own live console - a Global Security Operations Center seat
// (routes/companies.ts's BASE_SEATS_BY_ROLE), scoped via AskUserQuestion
// to per-company (not a VenueGuard-internal, cross-company role) with
// monitoring/acknowledging/communicating permissions (no write access
// to Tasks/Quotes/Invoices/Payroll/Onboarding/Users - see the role's
// own exclusion from every restrictWritesToRoles() allowlist). Built
// almost entirely by reusing already-verified panels rather than new
// surface area, per direct product direction not to ship anything that
// could come back "broken": Safety Alerts and Field Incident Reports
// are the exact same exported components /alerts already renders, and
// Communications is the exact same page component /admin/communications
// already renders. The one genuinely new piece is the Live Operator Map
// below.
function LiveOperatorMap() {
  const { data: positions = [], isLoading } = useQuery<LiveOperatorPosition[]>({
    queryKey: ["gsoc-live-map"],
    queryFn: api.taskLocationPings.liveMap,
    refetchInterval: 60000,
  });

  if (isLoading) return <Skeleton className="h-64" />;

  if (positions.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        No operators currently live - a CPO's position appears here automatically while they have an in-progress task open in Operators Note.
      </p>
    );
  }

  const center: [number, number] = [positions[0].latitude, positions[0].longitude];

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{positions.length} operator{positions.length === 1 ? "" : "s"} live right now (last 30 minutes)</p>
      <div className="h-80 rounded-md overflow-hidden border border-slate-200">
        <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          {positions.map((p) => (
            <CircleMarker key={p.cpoId} center={[p.latitude, p.longitude]} radius={7} pathOptions={{ color: "#2563eb", fillOpacity: 0.9 }}>
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">{p.cpoName}</div>
                  <div className="text-slate-500">{p.taskTitle}</div>
                  <div className="text-slate-400">{timeAgo(p.capturedAt)}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default function GsocDashboard() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Radar className="w-5 h-5 text-slate-400" /> GSOC
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">Live monitoring, communication, and check-in oversight for every CPO in the field.</p>
      </div>

      <SafetyAlertsPanel />

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-slate-400" /> Live Operator Map
          </h2>
          <LiveOperatorMap />
        </CardContent>
      </Card>

      <FieldIncidentReportsPanel />

      <CommunicationsPage />
    </div>
  );
}
