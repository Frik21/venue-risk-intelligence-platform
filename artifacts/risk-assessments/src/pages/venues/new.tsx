import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2 } from "lucide-react";
import { VENUE_TYPES, ENVIRONMENT_TYPES } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";

export default function VenueNew() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", venueType: "other", address: "", city: "", country: "",
    lat: "", lng: "", googleMapsUrl: "", district: "", environmentType: "urban", notes: "",
  });

  const mutation = useMutation({
    mutationFn: () => api.venues.create({
      ...form,
      lat: form.lat ? parseFloat(form.lat) : undefined,
      lng: form.lng ? parseFloat(form.lng) : undefined,
    }),
    onSuccess: (venue) => {
      qc.invalidateQueries({ queryKey: ["venues"] });
      toast({ title: "Venue created" });
      navigate(`/venues/${venue.id}`);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/venues")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Venues
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add New Venue</h1>
        <p className="text-slate-500 text-sm mt-0.5">Register a physical location for risk assessment</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Venue Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Venue Name *</Label>
              <Input placeholder="e.g. Grand Hyatt Dubai" value={form.name} onChange={e => set("name", e.target.value)} />
            </div>
            <div>
              <Label>Venue Type</Label>
              <Select value={form.venueType} onValueChange={v => set("venueType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENUE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Environment Type</Label>
              <Select value={form.environmentType} onValueChange={v => set("environmentType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENVIRONMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Location</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Street Address *</Label>
            <Input placeholder="123 Main Street" value={form.address} onChange={e => set("address", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>City *</Label>
              <Input placeholder="Dubai" value={form.city} onChange={e => set("city", e.target.value)} />
            </div>
            <div>
              <Label>Country *</Label>
              <Input placeholder="United Arab Emirates" value={form.country} onChange={e => set("country", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>District / Area</Label>
            <Input placeholder="Downtown District" value={form.district} onChange={e => set("district", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Latitude</Label>
              <Input placeholder="25.1972" type="number" step="any" value={form.lat} onChange={e => set("lat", e.target.value)} />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input placeholder="55.2744" type="number" step="any" value={form.lng} onChange={e => set("lng", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Google Maps URL</Label>
            <Input placeholder="https://maps.google.com/?q=..." value={form.googleMapsUrl} onChange={e => set("googleMapsUrl", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea placeholder="Additional context about this venue..." value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.name || !form.address || !form.city || !form.country}
        >
          {mutation.isPending ? "Creating..." : "Create Venue"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/venues")}>Cancel</Button>
      </div>
    </div>
  );
}
