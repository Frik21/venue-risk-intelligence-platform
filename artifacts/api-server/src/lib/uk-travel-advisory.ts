// Country Intelligence Engine - UK Government Travel Advice, sourced
// from GOV.UK's public Content API, combined with the US State
// Department advisory (travel-advisory.ts) per direct product
// direction ("a combination of the US and UK travel advisories").
// Confirmed live and reachable directly - and, unlike the State
// Department API, this one is properly documented and stable:
// https://www.gov.uk/api/content/foreign-travel-advice/{slug}
//
// No ISO code involved at all - GOV.UK addresses each country by a
// lowercase-hyphenated slug matching its own URL structure (e.g.
// "south-africa", "afghanistan"). The slug is derived from our own
// country name; if a guess doesn't resolve to a real GOV.UK page (a 404,
// not a wrong-country mismatch - GOV.UK's slugs are per-country, there's
// no equivalent of the State Department's "ZA" = Zambia gotcha here),
// this returns null rather than fabricate anything.
//
// Verified directly against two real responses: `details.alert_status`
// is an array of self-descriptive snake_case strings - empty when there
// is no current elevated warning (South Africa: []), populated when
// there is (Afghanistan: ["avoid_all_travel_to_whole_country"]).
// `details.summary` is null on every response seen - there is no
// separate plain-language summary field, so the finding's summary text
// is built directly from the alert_status values themselves. The
// severity ranking below is derived from the enum vocabulary's own
// naming convention ("avoid all travel" outranks "avoid all but
// essential travel"), normalised onto the same 1-4 scale the US State
// Department advisory uses so the two sources can feed one composite
// rating.
const GOVUK_CONTENT_BASE = "https://www.gov.uk/api/content/foreign-travel-advice";

export type TravelAdvisoryLevel = 1 | 2 | 3 | 4;

export interface UkTravelAdvisoryFinding {
  level: TravelAdvisoryLevel;
  summary: string;
  sourceUrl: string;
}

// NFD-normalizes then strips all combining marks via the \p{Mn} Unicode
// property escape (standard JS idiom for accent-stripping - avoids
// hardcoding a combining-diacritics code point range), so an accented
// name reduces to plain ASCII before hyphenation.
function slugify(countryName: string): string {
  return countryName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function levelFromStatuses(statuses: string[]): TravelAdvisoryLevel {
  if (statuses.some((s) => s.includes("avoid_all_travel"))) return 4;
  if (statuses.some((s) => s.includes("avoid_all_but_essential"))) return 3;
  return statuses.length > 0 ? 2 : 1;
}

function humanizeStatus(status: string): string {
  const spaced = status.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Throws on a genuine fetch/HTTP failure other than 404. A 404 means the
// slug guess didn't resolve to a real GOV.UK page - returns null rather
// than throw, since a wrong guess for an unusual country name is
// expected, not exceptional.
export async function fetchUkTravelAdvisory(countryName: string): Promise<UkTravelAdvisoryFinding | null> {
  const slug = slugify(countryName);
  const resp = await fetch(`${GOVUK_CONTENT_BASE}/${slug}`, { signal: AbortSignal.timeout(8000) });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`GOV.UK Content API returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  const statuses: string[] = data?.details?.alert_status ?? [];
  const level = levelFromStatuses(statuses);

  const summary =
    statuses.length > 0
      ? `UK FCDO Travel Advice - ${statuses.map(humanizeStatus).join("; ")}`
      : "UK FCDO Travel Advice - No current active warning";

  return {
    level,
    summary,
    sourceUrl: `https://www.gov.uk${data.base_path ?? `/foreign-travel-advice/${slug}`}`,
  };
}
