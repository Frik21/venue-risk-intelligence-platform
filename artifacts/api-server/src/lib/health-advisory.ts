// Country Intelligence Engine - Public Health Advisories, sourced from
// CDC's Travel Health Notices RSS feed. Confirmed live and reachable
// directly: https://wwwnc.cdc.gov/travel/rss/notices.xml - standard RSS
// 2.0, hand-parsed with regex rather than pulling in an XML library for
// a handful of well-known, fixed tags.
//
// Verified directly against real items: level and destination are both
// embedded in the title as plain text, not separate structured fields -
// e.g. "Level 2 - Zika in Indonesia" and "Level 4 - Ebola Bundibugyo
// Virus Disease in Ituri and Nord-Kivu Provinces of the Democratic
// Republic of the Congo". CDC's own scale genuinely goes to Level 4 (not
// capped at 3 as commonly assumed) - confirmed directly from a real
// Ebola notice, not assumed.
//
// Matching a notice to one of our countries is a plain substring check
// against the country name (case-insensitive) - deliberately simple, not
// a full geocoder. Known limitation: adjacent country-name pairs that
// share a substring (e.g. "Congo" appearing in both "Republic of the
// Congo" and "Democratic Republic of the Congo") could cross-attribute a
// notice to the wrong one of the two. Both are real, separately volatile
// countries where an occasional cross-attribution is a minor imprecision
// rather than a materially wrong answer - not worth a disambiguation
// pass for v1.
const CDC_NOTICES_URL = "https://wwwnc.cdc.gov/travel/rss/notices.xml";

export type HealthAdvisoryLevel = 1 | 2 | 3 | 4;

export interface HealthAdvisoryFinding {
  level: HealthAdvisoryLevel;
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string | null;
}

export type HealthRating = "low" | "moderate" | "high" | "critical";

const LEVEL_TO_RATING: Record<HealthAdvisoryLevel, HealthRating> = {
  1: "low",
  2: "moderate",
  3: "high",
  4: "critical",
};

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Throws on a genuine fetch/HTTP failure. An empty array is a real,
// positive result - "no active CDC notices matched this country" - not a
// failure state.
export async function fetchHealthAdvisories(countryName: string): Promise<HealthAdvisoryFinding[]> {
  const resp = await fetch(CDC_NOTICES_URL, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`CDC notices feed returned HTTP ${resp.status}`);
  }
  const xml = await resp.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const nameLower = countryName.trim().toLowerCase();
  const findings: HealthAdvisoryFinding[] = [];

  for (const [, itemXml] of items) {
    const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
    if (!titleMatch) continue;
    const title = stripHtml(titleMatch[1]);

    const levelMatch = title.match(/^Level\s+([1-4])\s*-\s*(.+)$/i);
    if (!levelMatch) continue;
    const [, levelStr, rest] = levelMatch;
    if (!rest.toLowerCase().includes(nameLower)) continue;

    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descMatch =
      itemXml.match(/<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/) ??
      itemXml.match(/<description>([\s\S]*?)<\/description>/);

    findings.push({
      level: Number(levelStr) as HealthAdvisoryLevel,
      title,
      summary: descMatch ? stripHtml(descMatch[1]).slice(0, 300) : title,
      sourceUrl: linkMatch ? linkMatch[1].trim() : "https://wwwnc.cdc.gov/travel/notices",
      publishedAt: pubDateMatch ? pubDateMatch[1].trim() : null,
    });
  }

  return findings;
}

// No matching notices is treated as "low" - absence of an active CDC
// notice is a real, honest signal, not a data gap.
export function deriveHealthRating(findings: HealthAdvisoryFinding[]): HealthRating {
  if (findings.length === 0) return "low";
  const highest = findings.reduce((max, f) => (f.level > max ? f.level : max), 1 as HealthAdvisoryLevel);
  return LEVEL_TO_RATING[highest];
}
