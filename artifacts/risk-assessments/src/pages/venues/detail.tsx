import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type VenueDetail } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Building2, MapPin, ExternalLink, Plus, ClipboardList, AlertTriangle, Radio } from "lucide-react";
import { getStatusColor, getStatusLabel, getRiskRatingColor, getRiskRatingLabel, getSeverityColor, formatDate, VENUE_TYPES } from "@/lib/display-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function VenueDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const id = Number(params.id);

  const { data: venue, isLoading } = useQuery<VenueDetail>({
    queryKey: ["venues", id],
    queryFn: () => api.venues.get(id),
    enabled: !isNaN(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.venues.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues"] });
      toast({ title: "Venue deleted" });
      navigate("/venues");
    },
  });

  if (isLoading) return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!venue) return <div className="text-center py-20 text-slate-400">Venue not found</div>;

  const venueTypeLabel = VENUE_TYPES.find(t => t.value === venue.venueType)?.label ?? venue.venueType;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/venues")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Venues
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{venue.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{venueTypeLabel}</Badge>
              {venue.environmentType && <Badge variant="outline" className="capitalize">{venue.environmentType}</Badge>}
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {venue.city}, {venue.country}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate(`/venues/${id}/edit`)}>Edit</Button>
          <Button size="sm" onClick={() => navigate(`/assessments/new?venueId=${id}`)}>
            <Plus className="w-4 h-4 mr-1" /> New Assessment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Venue info */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Location Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-slate-500">Address:</span><div className="text-slate-800">{venue.address}</div></div>
              <div><span className="text-slate-500">City:</span><div className="text-slate-800">{venue.city}, {venue.country}</div></div>
              {venue.district && <div><span className="text-slate-500">District:</span><div className="text-slate-800">{venue.district}</div></div>}
              {venue.lat && venue.lng && (
                <div>
                  <span className="text-slate-500">Coordinates:</span>
                  <div className="font-mono text-xs text-slate-700">{venue.lat.toFixed(6)}, {venue.lng.toFixed(6)}</div>
                </div>
              )}
              {venue.googleMapsUrl && (
                <a href={venue.googleMapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline text-xs mt-1">
                  <ExternalLink className="w-3.5 h-3.5" /> Open in Google Maps
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">OSINT Monitoring</CardTitle></CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/osint?venueId=${id}`)}>
                <Radio className="w-4 h-4 mr-1.5" /> View OSINT for this venue
              </Button>
            </CardContent>
          </Card>

          {venue.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-slate-600 whitespace-pre-wrap">{venue.notes}</p></CardContent>
            </Card>
          )}
        </div>

        {/* Assessments */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Assessments ({venue.assessments?.length ?? 0})</CardTitle>
                <Button size="sm" variant="outline" onClick={() => navigate(`/assessments/new?venueId=${id}`)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!venue.assessments?.length ? (
                <div className="py-8 text-center text-sm text-slate-400">No assessments yet</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {venue.assessments.map((a) => (
                    <Link key={a.id} href={`/assessments/${a.id}`}>
                      <div className="px-5 py-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{a.title}</div>
                          <div className="text-xs text-slate-400 mt-0.5">v{a.version} · {formatDate(a.updatedAt)}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {a.overallRating && (
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase", getRiskRatingColor(a.overallRating))}>
                              {getRiskRatingLabel(a.overallRating)}
                            </span>
                          )}
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border uppercase font-medium", getStatusColor(a.status))}>
                            {getStatusLabel(a.status)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent incidents */}
          {venue.recentIncidents && venue.recentIncidents.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recent Incidents</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {venue.recentIncidents.map((inc) => (
                    <div key={inc.id} className="px-5 py-3 flex items-start gap-3">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 mt-0.5", getSeverityColor(inc.severity))}>
                        {inc.severity}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-slate-700 truncate">{inc.summary}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{inc.incidentType.replace(/_/g," ")} · {formatDate(inc.incidentDate)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
