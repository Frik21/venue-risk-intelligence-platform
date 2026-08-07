// Country Intelligence Engine - Government Travel Advisories, from the
// US State Department only (per direct product direction: scrapped the
// earlier US+UK composite, and confirmed there is no reliable live-fetch
// path for the US rating either - see travel-advisory-data.ts for the
// full story and the reference table itself).
//
// Matching a country name to a row in that table isn't a plain string
// equal - our own registry and the State Department's table each have
// their own naming conventions (diacritics, "The X" articles, and a
// handful of genuinely different names for the same country, e.g.
// "Myanmar" vs "Burma"). This mirrors the same problem the old live
// integration had (ISO codes not matching reliably) - solved the same
// way: normalise first, then a small curated alias list for the
// specific mismatches actually found in our ~235-country registry
// (confirmed by inspecting country-registry.ts directly), never a
// generic "strip any prefix" rule - that would collide distinct
// countries (e.g. "Republic of the Congo" and "Democratic Republic of
// the Congo" both losing their prefix down to "Congo").
import { TRAVEL_ADVISORY_LEVELS, type TravelAdvisoryRow } from "./travel-advisory-data";

export type TravelAdvisoryLevel = 1 | 2 | 3 | 4;

export interface TravelAdvisoryFinding {
  level: TravelAdvisoryLevel;
  levelLabel: string;
  summary: string;
  sourceUrl: string;
  advisoryDate: string | null;
}

const LEVEL_LABELS: Record<TravelAdvisoryLevel, string> = {
  1: "Exercise Normal Precautions",
  2: "Exercise Increased Caution",
  3: "Reconsider Travel",
  4: "Do Not Travel",
};

const SOURCE_URL = "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html";

function normalize(name: string): string {
  const stripped = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.startsWith("the ") ? stripped.slice(4) : stripped;
}

// Registry name (normalised) -> table name (normalised), for the
// specific mismatches confirmed present in country-registry.ts. Not a
// general-purpose alias engine - just the handful this dataset actually
// needs.
const NAME_ALIASES: Record<string, string> = {
  myanmar: "burma",
  "holy see": "vatican city",
  "russian federation": "russia",
  "syrian arab republic": "syria",
  czechia: "czech republic",
  "lao people's democratic republic": "laos",
  "viet nam": "vietnam",
  congo: "republic of the congo",
  "united republic of tanzania": "tanzania",
};

const byNormalizedName = new Map<string, TravelAdvisoryRow>();
for (const row of TRAVEL_ADVISORY_LEVELS) {
  byNormalizedName.set(normalize(row.name), row);
}

function findRow(countryName: string): TravelAdvisoryRow | null {
  const normalized = normalize(countryName);
  const aliased = NAME_ALIASES[normalized] ?? normalized;
  return byNormalizedName.get(aliased) ?? null;
}

function toFinding(row: TravelAdvisoryRow): TravelAdvisoryFinding {
  const riskNote = row.higherRiskAreas ? " (contains areas with higher security risk)" : "";
  const dateNote = row.advisoryDate ? ` as of ${row.advisoryDate}` : "";
  return {
    level: row.level,
    levelLabel: `Level ${row.level}: ${LEVEL_LABELS[row.level]}`,
    summary: `U.S. State Department Travel Advisory - ${LEVEL_LABELS[row.level]}${riskNote}${dateNote}`,
    sourceUrl: SOURCE_URL,
    advisoryDate: row.advisoryDate,
  };
}

// State Dept doesn't publish a unified "Palestine" advisory - it rates
// Gaza Strip and the West Bank separately. Our registry has a single
// "Palestine, State of" entry, so this takes the worse (higher) of the
// two rather than showing nothing for a real, current Level 4 area.
function palestineFinding(): TravelAdvisoryFinding | null {
  const gaza = byNormalizedName.get("gaza strip");
  const westBank = byNormalizedName.get("west bank");
  const worse = [gaza, westBank].filter((r): r is TravelAdvisoryRow => r != null).sort((a, b) => b.level - a.level)[0];
  return worse ? toFinding(worse) : null;
}

// Kept async-shaped (no actual await) so this still fits alongside the
// CDC fetch in a Promise.allSettled without changing that call site -
// this was a live network call before and may be again if a reliable
// path turns up later.
export async function fetchTravelAdvisory(_iso2: string, countryName: string): Promise<TravelAdvisoryFinding | null> {
  if (normalize(countryName) === "state of palestine") return palestineFinding();
  const row = findRow(countryName);
  return row ? toFinding(row) : null;
}
