import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// A reusable address/place search box, backed by Photon
// (photon.komoot.io, built on OpenStreetMap data) - free, no API key.
// Called directly from the browser (not proxied through our own
// backend), same as any other client-side fetch in this app.
export interface LocationSearchResult {
  label: string;
  lat: number | null;
  lng: number | null;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  // ISO 3166-1 alpha-2, e.g. "ZA" - handy for matching a result back to
  // an internal country record without fuzzy-matching country names.
  countrycode: string | null;
  postcode: string | null;
}

const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

function formatLabel(props: Record<string, unknown>): string {
  const get = (key: string) => (typeof props[key] === "string" ? (props[key] as string) : undefined);
  const name = get("name");
  const street = get("street");
  const housenumber = get("housenumber");
  const city = get("city");
  const district = get("district");
  const state = get("state");
  const country = get("country");

  const streetLine = [street, housenumber].filter(Boolean).join(" ");
  const parts = [name, streetLine || undefined, city, district, state, country].filter(
    (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index,
  );
  return parts.join(", ") || "Unknown location";
}

async function searchPhoton(query: string, signal: AbortSignal): Promise<LocationSearchResult[]> {
  const url = `${PHOTON_ENDPOINT}?q=${encodeURIComponent(query)}&limit=6`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Location search failed (${res.status})`);
  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features.map((feature: { properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }) => {
    const props = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;
    const get = (key: string) => (typeof props[key] === "string" ? (props[key] as string) : null);
    return {
      label: formatLabel(props),
      lat: coords ? coords[1] : null,
      lng: coords ? coords[0] : null,
      street: get("street"),
      housenumber: get("housenumber"),
      city: get("city"),
      district: get("district"),
      state: get("state"),
      country: get("country"),
      countrycode: get("countrycode")?.toUpperCase() ?? null,
      postcode: get("postcode"),
    };
  });
}

// Controlled like a normal text input (value/onChange always work, so
// typing without ever picking a suggestion is a fully valid way to use
// this) - onSelect additionally fires when a suggestion is picked, for
// callers that want the structured fields (lat/lng, city, country...).
export function LocationSearch({
  value,
  onChange,
  onSelect,
  placeholder,
  rows,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (result: LocationSearchResult) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      searchPhoton(query, controller.signal)
        .then((found) => setResults(found))
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Location search failed:", err);
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  function handleSelect(result: LocationSearchResult) {
    onChange(result.label);
    onSelect?.(result);
    setOpen(false);
    setResults([]);
  }

  const InputTag = rows ? "textarea" : "input";

  return (
    <div
      ref={containerRef}
      className="location-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <InputTag
        value={value}
        rows={rows}
        placeholder={placeholder ?? "Search for an address or place…"}
        className={cn("location-search-input", className)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.blur();
          } else if (event.key === "Enter" && results.length > 0) {
            event.preventDefault();
            handleSelect(results[0]);
          }
        }}
      />

      {open && value.trim().length >= MIN_QUERY_LENGTH && (
        <div className="location-search-results">
          {loading ? (
            <div className="location-search-empty">Searching…</div>
          ) : results.length === 0 ? (
            <div className="location-search-empty">No matches - you can still type the location manually.</div>
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.label}-${index}`}
                type="button"
                className="location-search-result"
                onClick={() => handleSelect(result)}
              >
                <MapPin className="w-4 h-4 location-search-result-icon" />
                <span>{result.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
