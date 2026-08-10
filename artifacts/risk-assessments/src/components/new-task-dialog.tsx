import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Venue, type User, type TaskPriority, type QuotationStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useState } from "react";
import { Plus, Check, ChevronsUpDown, MapPin, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { searchPhoton, type LocationSearchResult } from "@/components/location-search";

const ADDRESS_SEARCH_DEBOUNCE_MS = 350;
const ADDRESS_SEARCH_MIN_LENGTH = 3;

const QUOTATION_STATUS_OPTIONS: { value: QuotationStatus; label: string; activeClass: string }[] = [
  { value: "approved", label: "Quotation Approved", activeClass: "bg-green-600 text-white border-green-600" },
  { value: "awaiting_approval", label: "Quotation Pending", activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "denied", label: "Quotation Denied", activeClass: "bg-red-600 text-white border-red-600" },
];

// Three-button picker (not a dropdown) so all three quotation states are
// visible at a glance on the task form, shared by New Task Request and
// Edit Task.
export function QuotationStatusPicker({ value, onChange }: { value: QuotationStatus; onChange: (v: QuotationStatus) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {QUOTATION_STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md border px-2 py-2 text-xs font-medium text-center transition-colors",
            value === opt.value ? opt.activeClass : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// One field to find or add a task's location - no separate window.
// Typing filters existing venues AND (after a moment) searches real
// addresses/places (Photon/OpenStreetMap, same free service as the
// full Venues > Add New Venue page) in the same dropdown. Picking a
// real place creates the venue from its actual address/coordinates
// and selects it immediately. If nothing real-world matches either
// (e.g. a private venue not on the map), a plain "Add as new location"
// row still creates one from just the typed name - address/city/
// country can be filled in later from the full Venues page.
export function LocationCombobox({
  venues,
  value,
  onChange,
}: {
  venues: Venue[];
  value: string;
  onChange: (venueId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addressResults, setAddressResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const selected = venues.find((v) => String(v.id) === value);
  const trimmedQuery = query.trim();
  const filteredVenues = trimmedQuery
    ? venues.filter((v) => v.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : venues;
  const exactMatch = venues.some((v) => v.name.toLowerCase() === trimmedQuery.toLowerCase());

  useEffect(() => {
    if (trimmedQuery.length < ADDRESS_SEARCH_MIN_LENGTH) {
      setAddressResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchPhoton(trimmedQuery, controller.signal)
        .then(setAddressResults)
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Address search failed:", err);
          setAddressResults([]);
        })
        .finally(() => setSearching(false));
    }, ADDRESS_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  const createMutation = useMutation({
    mutationFn: (input: { name: string; address: string; city: string; country: string; lat?: number; lng?: number }) =>
      api.venues.create(input),
    onSuccess: (venue) => {
      qc.invalidateQueries({ queryKey: ["venues"] });
      toast({ title: "Location added" });
      onChange(String(venue.id));
      setQuery("");
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function createFromAddress(result: LocationSearchResult) {
    const streetLine = [result.street, result.housenumber].filter(Boolean).join(" ");
    createMutation.mutate({
      name: result.name ?? result.label,
      address: streetLine || result.label,
      city: result.city ?? result.district ?? result.state ?? "Unknown",
      country: result.country ?? "Unknown",
      lat: result.lat ?? undefined,
      lng: result.lng ?? undefined,
    });
  }

  function createBare(name: string) {
    createMutation.mutate({ name, address: "Address to be confirmed", city: "Unknown", country: "Unknown" });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <span className={selected ? "" : "text-slate-400"}>
            {selected ? selected.name : "Search or add a location..."}
          </span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search locations or addresses..." value={query} onValueChange={setQuery} />
          <CommandList>
            {filteredVenues.length === 0 && addressResults.length === 0 && !searching && !trimmedQuery && (
              <CommandEmpty>No locations yet.</CommandEmpty>
            )}
            {filteredVenues.length > 0 && (
              <CommandGroup heading="Your Locations">
                {filteredVenues.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`venue-${v.id}`}
                    onSelect={() => {
                      onChange(String(v.id));
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("w-4 h-4", String(v.id) === value ? "opacity-100" : "opacity-0")} />
                    {v.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {trimmedQuery.length >= ADDRESS_SEARCH_MIN_LENGTH && (searching || addressResults.length > 0) && (
              <CommandGroup heading="Real Places">
                {searching && (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Searching…
                  </div>
                )}
                {addressResults.map((r, i) => (
                  <CommandItem
                    key={`${r.label}-${i}`}
                    value={`addr-${i}-${r.label}`}
                    disabled={createMutation.isPending}
                    onSelect={() => createFromAddress(r)}
                  >
                    <MapPin className="w-4 h-4" />
                    {r.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {trimmedQuery && !exactMatch && (
              <CommandGroup>
                <CommandItem
                  value={`create-${trimmedQuery}`}
                  disabled={createMutation.isPending}
                  onSelect={() => createBare(trimmedQuery)}
                >
                  <Plus className="w-4 h-4" />
                  Add "{trimmedQuery}" as a new location
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Task Request - shared by the Management Dashboard's primary action
// and the full Tasks list page. Modelled as an intake form for a
// phone-in request (per direct product direction: "someone calls to
// say they need a CPO for these dates... operators amount/vehicles
// needed, special requests") rather than a bare title + one assignee -
// the CPO roster can hold several operators when a client asks for
// more than one.
export function NewTaskDialog({
  venues,
  users,
  onClose,
  initialAssigneeId,
}: {
  venues: Venue[];
  users: User[];
  onClose: () => void;
  // Pre-checks a CPO as assignee - used by Operator Onboarding's
  // "Assign User" button so approving an operator can flow straight
  // into giving them their first task.
  initialAssigneeId?: number;
}) {
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const [form, setForm] = useState({
    venueId: "",
    assigneeIds: initialAssigneeId != null ? [initialAssigneeId] : [] as number[],
    assignedBy: "",
    title: "",
    dueDate: "",
    endDate: "",
    priority: "medium",
    quotationStatus: "awaiting_approval" as QuotationStatus,
    clientName: "",
    clientContact: "",
    clientRequirements: "",
    operatorsRequired: "1",
    vehiclesRequired: "0",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.tasks.create({
        venueId: form.venueId ? Number(form.venueId) : undefined,
        assigneeIds: form.assigneeIds,
        assignedBy: Number(form.assignedBy),
        title: form.title || undefined,
        dueDate: form.dueDate || undefined,
        endDate: form.endDate || undefined,
        priority: form.priority as TaskPriority,
        quotationStatus: form.quotationStatus,
        clientName: form.clientName,
        clientContact: form.clientContact,
        clientRequirements: form.clientRequirements,
        operatorsRequired: Number(form.operatorsRequired) || 1,
        vehiclesRequired: Number(form.vehiclesRequired) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: form.assigneeIds.length ? "Task assigned" : "Task request created - unassigned" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  // No CPO picker on this form - assignment happens elsewhere. Requests
  // are created unassigned (or pre-assigned via initialAssigneeId, e.g.
  // Operator Onboarding's "Assign User" flow) and picked up later.
  //
  // Required to create at all: client name/contact/requirements + who's
  // assigning it. Everything else (title, location, dates, quotation
  // status) can be filled in later - a task missing any of those just
  // sits in Pending Details until it's complete (see lib/task-bucket.ts),
  // per direct product direction. Estimated Cost is off both task forms
  // for now (coming back later) - not part of that completeness check.
  const canSubmit =
    form.clientName.trim() && form.clientContact.trim() && form.clientRequirements.trim() && form.assignedBy;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">New Task Request</h2>
          <p className="text-xs text-slate-400 mt-0.5">Capture the details of a client request and assign it when ready.</p>
        </div>

        <div>
          <Label>Task</Label>
          <Input placeholder='e.g. "Close protection for venue X"' value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>

        <div>
          <Label>Location</Label>
          <LocationCombobox venues={venues} value={form.venueId} onChange={(v) => set("venueId", v)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Client Name *</Label>
            <Input placeholder="Who's requesting this" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} />
          </div>
          <div>
            <Label>Client Contact *</Label>
            <Input placeholder="Phone / email" value={form.clientContact} onChange={(e) => set("clientContact", e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Client Requirements / Special Requests *</Label>
          <Textarea
            placeholder="Anything specific the client asked for..."
            value={form.clientRequirements}
            onChange={(e) => set("clientRequirements", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start Date/Time</Label>
            <Input type="datetime-local" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>
          <div>
            <Label>End Date/Time</Label>
            <Input type="datetime-local" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Operators Needed</Label>
            <Input type="number" min={0} value={form.operatorsRequired} onChange={(e) => set("operatorsRequired", e.target.value)} />
          </div>
          <div>
            <Label>Vehicles Needed</Label>
            <Input type="number" min={0} value={form.vehiclesRequired} onChange={(e) => set("vehiclesRequired", e.target.value)} />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Quotation Status</Label>
          <QuotationStatusPicker
            value={form.quotationStatus}
            onChange={(v) => setForm((f) => ({ ...f, quotationStatus: v }))}
          />
        </div>

        <div>
          <Label>Assigned By (Manager) *</Label>
          <Select value={form.assignedBy} onValueChange={(v) => set("assignedBy", v)}>
            <SelectTrigger><SelectValue placeholder="Select a Manager" /></SelectTrigger>
            <SelectContent>
              {managers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No Manager/Admin users yet</div>
              ) : (
                managers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Creating..." : "Create Task Request"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
