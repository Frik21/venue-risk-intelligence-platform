import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Venue } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { Building2, Plus, MapPin, Search, Globe, ClipboardList } from "lucide-react";
import { useState } from "react";
import { VENUE_TYPES } from "@/lib/display-utils";

export default function VenuesList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data: venues = [], isLoading } = useQuery<Venue[]>({
    queryKey: ["venues"],
    queryFn: api.venues.list,
  });

  const filtered = venues.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.city.toLowerCase().includes(search.toLowerCase()) ||
      v.country.toLowerCase().includes(search.toLowerCase())
  );

  const venueTypeLabel = (type: string) =>
    VENUE_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Venues</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage all assessed physical locations</p>
        </div>
        <Button onClick={() => navigate("/venues/new")}>
          <Plus className="w-4 h-4 mr-1.5" /> New Venue
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No venues found</h3>
            <p className="text-sm text-slate-400 mb-4">
              {search ? "Try a different search term" : "Add your first venue to start assessing it"}
            </p>
            {!search && (
              <Button onClick={() => navigate("/venues/new")}>
                <Plus className="w-4 h-4 mr-1.5" /> Add Venue
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((venue) => (
            <Link key={venue.id} href={`/venues/${venue.id}`}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize shrink-0">
                      {venueTypeLabel(venue.venueType)}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm mb-1 truncate">{venue.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{venue.city}, {venue.country}</span>
                  </div>
                  {venue.district && (
                    <div className="text-xs text-slate-400 truncate mb-2">{venue.district}</div>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>{venue.assessmentCount} assessment{venue.assessmentCount !== 1 ? "s" : ""}</span>
                    </div>
                    {venue.lat && venue.lng && (
                      <div className="flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" />
                        <span className="font-mono text-[10px]">{venue.lat.toFixed(4)}, {venue.lng.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
