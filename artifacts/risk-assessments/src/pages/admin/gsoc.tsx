import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { api, type LiveOperatorPosition } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, MapPin, ArrowLeftRight, LogOut, ShieldAlert } from "lucide-react";
import { timeAgo } from "@/lib/display-utils";
import { SafetyAlertsPanel, FieldIncidentReportsPanel } from "@/pages/alerts/list";
import CommunicationsPage from "@/pages/admin/communications";

const ROLE_LABELS: Record<string, string> = {
  admin: "Owner",
  manager: "Manager",
  finance: "Finance",
  human_resources: "Human Resources",
  operations: "Operations",
  gsoc: "GSOC",
};

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

// Full-bleed, bypasses Layout's Command Desk sidebar/header entirely
// (components/layout.tsx's hideShell list) - per direct product
// direction, GSOC gets its own page and own UI, separated from the
// rest of Command Desk, the same "own product surface" treatment
// Operators Note (/cpo) already gets, rather than living inside the
// regular Management shell like Finance/HR/Operations do. Builds its
// own header bar here (mirroring the Master Console's own standalone
// header, pages/owner/dashboard.tsx) since there's no Layout wrapper
// providing one anymore. Not a hard access restriction the way Solo
// Operator/CPO sessions are locked out of Command Desk - any
// Management role can still reach other Command Desk pages via the
// sidebar's own "GSOC" quick-jump link (components/layout.tsx), this
// is a visual/UX separation, not a permission boundary.
export default function GsocDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="h-14 flex items-center px-6 bg-slate-950 text-white gap-2.5 shrink-0">
        <Radar className="w-5 h-5 text-cyan-400" />
        <div>
          <div className="text-sm font-bold tracking-wide">VENUEGUARD</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest -mt-0.5">GSOC</div>
        </div>
        <div className="flex-1" />
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mr-4"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Command Desk
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-cyan-600/30 flex items-center justify-center text-cyan-300 text-xs font-bold shrink-0">
            {user?.avatarInitials ?? user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 hidden sm:block">
            <div className="text-xs font-medium text-slate-200 truncate">{user?.name ?? "—"}</div>
            <div className="text-[10px] text-slate-500 truncate">{user ? (ROLE_LABELS[user.role] ?? user.role) : ""}</div>
          </div>
          <button
            onClick={() => logout()}
            title="Sign Out"
            className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-slate-400" /> Global Security Operations Center
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
    </div>
  );
}
