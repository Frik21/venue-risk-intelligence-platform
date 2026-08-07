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

const HIGH_WIND_GUST_KMH = 60;
const SEVERE_WIND_GUST_KMH = 90;

const SEVERITY_RANK: Record<WeatherSeverity, number> = { moderate: 0, high: 1, critical: 2 };

// Throws on a genuine fetch/HTTP failure (caller decides how to handle -
// a live-data outage should never be silently reported as "conditions
// are fine"). Returns null when the fetch succeeds but conditions simply
// aren't notable - a real, positive "nothing to report" result.
export async function fetchWeatherFinding(lat: number, lng: number): Promise<WeatherFinding | null> {
  const url =
    `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,weather_code&timezone=auto`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`Open-Meteo returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  const current = data.current;
  if (!current) return null;

  const code = current.weather_code as number | undefined;
  const gust = current.wind_gusts_10m as number | undefined;
  const precipitation = current.precipitation as number | undefined;

  const codeFinding = code !== undefined ? WEATHER_CODE_FINDINGS[code] : undefined;

  let windFinding: { label: string; severity: WeatherSeverity } | undefined;
  if (gust !== undefined && gust >= SEVERE_WIND_GUST_KMH) {
    windFinding = { label: `Severe wind gusts (${Math.round(gust)} km/h)`, severity: "critical" };
  } else if (gust !== undefined && gust >= HIGH_WIND_GUST_KMH) {
    windFinding = { label: `High wind gusts (${Math.round(gust)} km/h)`, severity: "high" };
  }

  const candidates = [codeFinding, windFinding].filter((f): f is { label: string; severity: WeatherSeverity } => !!f);
  if (candidates.length === 0) return null;

  const worst = candidates.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));

  const parts = [worst.label];
  if (precipitation !== undefined && precipitation > 0) {
    parts.push(`${precipitation.toFixed(1)}mm precipitation`);
  }

  return {
    summary: `${parts.join(" - ")} in effect near the venue`,
    severity: worst.severity,
    sourceName: "Open-Meteo",
    sourceUrl: `https://open-meteo.com/en/docs`,
  };
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
