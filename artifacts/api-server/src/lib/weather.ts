// OSINT Weather Engine - the first live (non-template) OSINT source, per
// direct product direction ("let's tackle Alerts first"). Source:
// Open-Meteo's forecast API (https://open-meteo.com) - free, no API key,
// no auth, matching the same native-fetch + AbortSignal.timeout pattern
// already used for OSRM in routes.ts.
//
// Deliberately reports nothing for ordinary conditions (clear, light
// rain, breezy) - only crosses into an actual OSINT finding at genuinely
// notable severity. Per the Product Constitution ("reduce uncertainty,
// never increase anxiety"), a "moderate" badge on every normal sunny day
// would be noise, not intelligence, and would train analysts to ignore
// the OSINT feed entirely.
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

export type WeatherSeverity = "moderate" | "high" | "critical";

export interface WeatherFinding {
  summary: string;
  severity: WeatherSeverity;
  sourceName: string;
  sourceUrl: string;
}

// WMO Weather interpretation codes (https://open-meteo.com/en/docs) mapped
// to a plain-language label and severity. Only codes worth surfacing are
// listed here - anything not in this table (clear sky, light rain, etc.)
// intentionally produces no finding.
const WEATHER_CODE_FINDINGS: Record<number, { label: string; severity: WeatherSeverity }> = {
  65: { label: "Heavy rain", severity: "moderate" },
  67: { label: "Heavy freezing rain", severity: "high" },
  75: { label: "Heavy snowfall", severity: "moderate" },
  82: { label: "Violent rain showers", severity: "high" },
  86: { label: "Heavy snow showers", severity: "moderate" },
  95: { label: "Thunderstorm", severity: "high" },
  96: { label: "Thunderstorm with hail", severity: "critical" },
  99: { label: "Thunderstorm with heavy hail", severity: "critical" },
};

// Full WMO Weather interpretation code table (https://open-meteo.com/en/docs)
// mapped to a plain-language sky condition - unlike WEATHER_CODE_FINDINGS
// above, every code is covered here, since this is a general "what's it
// like right now" description (rain/sunshine/etc.), not a notable-only
// finding.
const WMO_CONDITIONS_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

const WINDY_GUST_KMH = 30;
const HIGH_WIND_GUST_KMH = 60;
const SEVERE_WIND_GUST_KMH = 90;

function conditionsLabel(current: RawCurrentConditions): string {
  const sky = current.code !== undefined ? WMO_CONDITIONS_LABELS[current.code] : undefined;
  const skyLabel = sky ?? "Conditions unavailable";
  if (current.gust !== undefined && current.gust >= WINDY_GUST_KMH) {
    return `${skyLabel}, Windy`;
  }
  return skyLabel;
}

const SEVERITY_RANK: Record<WeatherSeverity, number> = { moderate: 0, high: 1, critical: 2 };

interface RawCurrentConditions {
  temperatureC: number | null;
  code: number | undefined;
  gust: number | undefined;
  precipitation: number | undefined;
}

// Throws on a genuine fetch/HTTP failure (caller decides how to handle -
// a live-data outage should never be silently reported as "conditions
// are fine"). Shared by fetchWeatherFinding and fetchCurrentWeather so
// a caller wanting both the OSINT-style finding and the raw temperature
// only makes one request.
async function fetchRawCurrentConditions(lat: number, lng: number): Promise<RawCurrentConditions> {
  const url =
    `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,weather_code&timezone=auto`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`Open-Meteo returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  const current = data.current ?? {};

  return {
    temperatureC: typeof current.temperature_2m === "number" ? current.temperature_2m : null,
    code: current.weather_code as number | undefined,
    gust: current.wind_gusts_10m as number | undefined,
    precipitation: current.precipitation as number | undefined,
  };
}

// null when conditions simply aren't notable - a real, positive
// "nothing to report" result, not a failure.
function buildFinding(current: RawCurrentConditions): WeatherFinding | null {
  const codeFinding = current.code !== undefined ? WEATHER_CODE_FINDINGS[current.code] : undefined;

  let windFinding: { label: string; severity: WeatherSeverity } | undefined;
  if (current.gust !== undefined && current.gust >= SEVERE_WIND_GUST_KMH) {
    windFinding = { label: `Severe wind gusts (${Math.round(current.gust)} km/h)`, severity: "critical" };
  } else if (current.gust !== undefined && current.gust >= HIGH_WIND_GUST_KMH) {
    windFinding = { label: `High wind gusts (${Math.round(current.gust)} km/h)`, severity: "high" };
  }

  const candidates = [codeFinding, windFinding].filter((f): f is { label: string; severity: WeatherSeverity } => !!f);
  if (candidates.length === 0) return null;

  const worst = candidates.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));

  const parts = [worst.label];
  if (current.precipitation !== undefined && current.precipitation > 0) {
    parts.push(`${current.precipitation.toFixed(1)}mm precipitation`);
  }

  return {
    summary: `${parts.join(" - ")} in effect near the venue`,
    severity: worst.severity,
    sourceName: "Open-Meteo",
    sourceUrl: `https://open-meteo.com/en/docs`,
  };
}

// Unchanged behavior/signature from before this file grew a second
// entry point - still what the OSINT pipeline (osint.ts) calls.
export async function fetchWeatherFinding(lat: number, lng: number): Promise<WeatherFinding | null> {
  const current = await fetchRawCurrentConditions(lat, lng);
  return buildFinding(current);
}

export interface CurrentWeather {
  temperatureC: number | null;
  // Plain-language sky condition (e.g. "Partly cloudy", "Rain, Windy") -
  // always populated when the code is known, unlike `finding`, which
  // stays null on an unremarkable day.
  conditions: string;
  finding: WeatherFinding | null;
}

// For callers that want the actual temperature and general conditions
// alongside (not instead of) the notable-conditions finding - e.g. the
// Operational Brief, where "22°C, Partly cloudy" is worth showing even
// on an otherwise unremarkable day.
export async function fetchCurrentWeather(lat: number, lng: number): Promise<CurrentWeather> {
  const current = await fetchRawCurrentConditions(lat, lng);
  return { temperatureC: current.temperatureC, conditions: conditionsLabel(current), finding: buildFinding(current) };
}

// OSINT event_type is free text (no DB enum) - encoding severity directly
// into the type string, same convention "riot" vs "crime"/"protest"
// already uses for a heavier alert priority, rather than adding a new
// schema column for a single source.
export function weatherEventType(severity: WeatherSeverity): string {
  if (severity === "critical") return "weather_critical";
  if (severity === "high") return "weather_high";
  return "weather";
}

export function weatherAlertPriority(eventType: string): "medium" | "high" | "critical" {
  if (eventType === "weather_critical") return "critical";
  if (eventType === "weather_high") return "high";
  return "medium";
}
