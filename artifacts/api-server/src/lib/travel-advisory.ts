// Country Intelligence Engine - Government Travel Advisories, sourced
// from the U.S. State Department's public Bureau of Consular Affairs
// API. Confirmed live and reachable directly (not guessed from docs):
// https://cadataapi.state.gov/api/CountryTravelInformation/{code}
// returns an array with one country's travel-information record.
//
// Verified directly against a real response: the top-level "TravelAdvisories"
// list endpoint (no path segment) returns an empty array with no error -
// unusable as a source, so per-country lookup is the only confirmed
// working path.
//
// Critical, directly-confirmed gotcha: this API's own country "tag" codes
// do NOT reliably match ISO 3166-1 alpha-2 - querying tag "ZA" returns
// Zambia's record, not South Africa's (ISO's meaning for "ZA"). There is
// no documented mapping table. Rather than build one blind, every
// response is cross-checked against the country name our own registry
// already has before any of it is trusted - a mismatch is treated as "no
// data available," never as "close enough to show."
//
// The exact field carrying a structured Level 1-4 rating was not
// confirmed against a real response (every field seen so far is long-
// form HTML prose - road safety, health, entry requirements - not one
// dedicated "level" field). Rather than guess a key name that might not
// exist, every string value in the response is scanned for a "Level N"
// phrase, the same way CDC's own feed embeds it directly in text rather
// than a dedicated field (see health-advisory.ts). If it's genuinely not
// present anywhere in the response, this correctly returns null instead
// of fabricating a number - a wrong risk level is a worse failure than a
// missing one.
const STATE_DEPT_BASE = "https://cadataapi.state.gov/api/CountryTravelInformation";

export type TravelAdvisoryLevel = 1 | 2 | 3 | 4;

export interface TravelAdvisoryFinding {
  level: TravelAdvisoryLevel;
  levelLabel: string;
  summary: string;
  sourceUrl: string;
}

const LEVEL_LABELS: Record<TravelAdvisoryLevel, string> = {
  1: "Exercise Normal Precautions",
  2: "Exercise Increased Caution",
  3: "Reconsider Travel",
  4: "Do Not Travel",
};

function namesLikelyMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

// Throws on a genuine fetch/HTTP failure. Returns null when the fetch
// succeeds but the data isn't usable - country name mismatch (see above)
// or no "Level N" phrase found anywhere in the response.
export async function fetchTravelAdvisory(iso2: string, countryName: string): Promise<TravelAdvisoryFinding | null> {
  const resp = await fetch(`${STATE_DEPT_BASE}/${encodeURIComponent(iso2)}`, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`State Department API returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  const entry = Array.isArray(data) ? data[0] : undefined;
  if (!entry) return null;

  const returnedName = String(entry.geopoliticalarea ?? "");
  if (!namesLikelyMatch(returnedName, countryName)) return null;

  let level: TravelAdvisoryLevel | null = null;
  for (const value of Object.values(entry)) {
    if (typeof value !== "string") continue;
    const match = value.match(/\bLevel\s+([1-4])\b/i);
    if (!match) continue;
    const found = Number(match[1]) as TravelAdvisoryLevel;
    if (level === null || found > level) level = found;
  }
  if (level === null) return null;

  return {
    level,
    levelLabel: `Level ${level}: ${LEVEL_LABELS[level]}`,
    summary: `U.S. State Department Travel Advisory - ${LEVEL_LABELS[level]}`,
    sourceUrl: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html",
  };
}
