import { Router, type IRouter } from "express";
import { fetchTravelAdvisory } from "../lib/travel-advisory";
import { fetchUkTravelAdvisory } from "../lib/uk-travel-advisory";
import { fetchHealthAdvisories, deriveHealthRating } from "../lib/health-advisory";

const router: IRouter = Router();

// Our own registry carries a handful of countries in inverted
// gazetteer-comma style ("Congo, Democratic Republic of the",
// "Tanzania, United Republic of", "Palestine, State of") - a common
// convention for alphabetised lists, but not how any of the three
// external sources refer to a country. Reported directly ("countries
// like the drc... just shows unrated") and confirmed concretely: US/UK/
// CDC name-matching all silently failed for DRC until un-inverted to
// "Democratic Republic of the Congo," at which point every source
// matched correctly (UK: Level 4, CDC: 4 real Ebola/meningococcal
// notices). Only 3 of 235 registry entries use this pattern - simple
// "X, Y" -> "Y X" un-inversion, not a general name-normalisation engine.
function normalizeCountryName(name: string): string {
  const commaIndex = name.indexOf(",");
  if (commaIndex === -1) return name;
  const before = name.slice(0, commaIndex).trim();
  const after = name.slice(commaIndex + 1).trim();
  return `${after} ${before}`;
}

// Country Intelligence Engine - the composite Risk Rating combines the
// US State Department and UK FCDO travel advisories (per direct product
// direction: "a combination of the US and UK travel advisories... we
// create our own risk assessment"), taking the WORSE (higher) of the two
// normalised 1-4 levels rather than averaging - a security-relevant
// warning from either government is a real signal that shouldn't be
// diluted by the other saying nothing.
//
// Deliberately transparent, not a black box: the response always
// includes `drivers`, naming exactly which source(s) produced the
// rating and their own stated level, so the panel can show "why" rather
// than just a number (Product Constitution: "Within 30 seconds an
// operator should understand... Why").
//
// If NEITHER source has data for a country (most of our 235 registry
// entries - small territories, dependencies - genuinely have no
// government travel advisory at all), the rating is "unrated" rather
// than falling back to any kind of placeholder score - the entire point
// of this engine is replacing invented signal with real signal.
//
// Public Health stays a separate badge (per direct product direction),
// fed only by CDC - not folded into the Risk Rating composite.
//
// No database involved - the response itself is never persisted, only
// held in a short-lived in-memory cache (below). Each underlying fetch
// is independently caught so one source failing (or this session's own
// sandbox network policy blocking a domain, as happened repeatedly
// during development) never breaks the others.
type RiskLevel = "unrated" | "low" | "elevated" | "critical" | "do_not_travel";

const LEVEL_TO_RISK: Record<number, RiskLevel> = {
  1: "low",
  2: "elevated",
  3: "critical",
  4: "do_not_travel",
};

// The three external sources are real government/CDC servers, not
// always fast, and every country selection was re-querying all three
// from scratch - reported directly as slow. None of these change
// minute-to-minute (a travel advisory or CDC notice is a standing
// status, not a live feed), so a short in-memory cache trades a small,
// honest amount of staleness for every repeat lookup of the same
// country being instant instead of a multi-second round trip. Bounded
// by the registry's own ~235 countries - no eviction needed beyond the
// TTL check on read.
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; body: unknown }>();

async function buildCountryIntelligence(iso2: string, name: string) {
  const [usResult, ukResult, healthResult] = await Promise.allSettled([
    fetchTravelAdvisory(iso2, name),
    fetchUkTravelAdvisory(name),
    fetchHealthAdvisories(name),
  ]);

  if (usResult.status === "rejected") console.error(`US travel advisory fetch failed for ${iso2}:`, usResult.reason);
  if (ukResult.status === "rejected") console.error(`UK travel advisory fetch failed for ${name}:`, ukResult.reason);
  if (healthResult.status === "rejected") console.error(`CDC health advisory fetch failed for ${name}:`, healthResult.reason);

  const us = usResult.status === "fulfilled" ? usResult.value : null;
  const uk = ukResult.status === "fulfilled" ? ukResult.value : null;
  const healthFindings = healthResult.status === "fulfilled" ? healthResult.value : [];

  const drivers: string[] = [];
  let maxLevel = 0;
  if (us) {
    drivers.push(`US State Department: ${us.levelLabel}`);
    maxLevel = Math.max(maxLevel, us.level);
  }
  if (uk) {
    drivers.push(`UK FCDO: ${uk.summary.replace("UK FCDO Travel Advice - ", "")}`);
    maxLevel = Math.max(maxLevel, uk.level);
  }

  return {
    riskRating: {
      level: maxLevel > 0 ? LEVEL_TO_RISK[maxLevel] : ("unrated" as RiskLevel),
      drivers,
    },
    travelAdvisories: {
      us: us ? { level: us.level, label: us.levelLabel, summary: us.summary, sourceUrl: us.sourceUrl } : null,
      uk: uk ? { level: uk.level, summary: uk.summary, sourceUrl: uk.sourceUrl } : null,
    },
    health: {
      rating: deriveHealthRating(healthFindings),
      notices: healthFindings,
    },
  };
}

router.get("/countries/:iso2/intelligence", async (req, res): Promise<void> => {
  const iso2 = req.params.iso2;
  const rawName = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!iso2 || !rawName) {
    res.status(400).json({ error: "iso2 path param and name query param are both required" });
    return;
  }
  const name = normalizeCountryName(rawName);

  const cacheKey = `${iso2}:${name}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.body);
    return;
  }

  const body = await buildCountryIntelligence(iso2, name);
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, body });
  res.json(body);
});

export default router;
