// OSINT GDELT News Engine - the news-monitoring OSINT source referenced
// by venue_search_phrases (schema/monitoring.ts) since that table was
// first added. Source: GDELT's DOC 2.0 API
// (https://api.gdeltproject.org/api/v2/doc/doc) - free, no API key, no
// auth, same native-fetch + AbortSignal.timeout pattern as weather.ts.
//
// Deliberately opt-in per venue (see venueSearchPhrasesTable's own
// comment) and phrase-scoped rather than a generic "news near this
// venue" search - an unscoped feed would mostly return irrelevant local
// news, training analysts to ignore it. English-language sources only,
// for the same noise-reduction reason.
const GDELT_DOC_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_TIMESPAN = "3d";
const GDELT_MAX_RECORDS = 10;

export type GdeltSeverity = "medium" | "high" | "critical";

export interface GdeltFinding {
  summary: string;
  severity: GdeltSeverity;
  sourceName: string;
  sourceUrl: string;
}

interface GdeltArticle {
  url?: string;
  title?: string;
  domain?: string;
  tone?: number | string;
}

// A phrase is meant to be a literal quoted phrase in GDELT's query
// syntax, not a sub-query of its own - strip characters that would
// otherwise let free text entered on the Alerts page break out of the
// quotes and change the query's meaning.
function sanitizePhrase(phrase: string): string {
  return phrase.replace(/["()]/g, "").trim();
}

// GDELT's `tone` is a rough sentiment score (roughly -100..+100, more
// negative = more negative coverage) - used only to bucket severity,
// same "encode severity into a plain number of buckets" approach
// weather.ts uses for wind gusts.
function toneSeverity(tone: number | undefined): GdeltSeverity {
  if (tone === undefined) return "medium";
  if (tone <= -10) return "critical";
  if (tone <= -5) return "high";
  return "medium";
}

// Throws on a genuine fetch/HTTP failure (caller decides how to handle,
// same convention as fetchWeatherFinding). Returns an empty array when
// the fetch succeeds but nothing matched - a real, positive "nothing to
// report" result, not a failure.
export async function fetchGdeltFindings(phrases: string[]): Promise<GdeltFinding[]> {
  const cleaned = phrases.map(sanitizePhrase).filter((p) => p.length >= 2);
  if (cleaned.length === 0) return [];

  const phraseQuery = cleaned.map((p) => `"${p}"`).join(" OR ");
  const query = `(${phraseQuery}) sourcelang:english`;
  const url =
    `${GDELT_DOC_BASE}?query=${encodeURIComponent(query)}&mode=artlist&format=json` +
    `&maxrecords=${GDELT_MAX_RECORDS}&timespan=${GDELT_TIMESPAN}&sort=datedesc`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`GDELT returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  const articles: GdeltArticle[] = Array.isArray(data.articles) ? data.articles : [];

  return articles
    .filter((a): a is GdeltArticle & { url: string; title: string } => Boolean(a.url && a.title))
    .map((a) => {
      const tone = typeof a.tone === "number" ? a.tone : typeof a.tone === "string" ? parseFloat(a.tone) : undefined;
      return {
        summary: a.title,
        severity: toneSeverity(tone),
        sourceName: a.domain || "GDELT",
        sourceUrl: a.url,
      };
    });
}

// OSINT event_type is free text (no DB enum) - same "encode severity
// into the type string" convention weatherEventType uses.
export function gdeltEventType(severity: GdeltSeverity): string {
  if (severity === "critical") return "news_critical";
  if (severity === "high") return "news_high";
  return "news";
}

export function gdeltAlertPriority(eventType: string): "medium" | "high" | "critical" {
  if (eventType === "news_critical") return "critical";
  if (eventType === "news_high") return "high";
  return "medium";
}
