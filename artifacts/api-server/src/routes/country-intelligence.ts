import { Router, type IRouter } from "express";
import { fetchTravelAdvisory } from "../lib/travel-advisory";
import { fetchUkTravelAdvisory } from "../lib/uk-travel-advisory";
import { fetchHealthAdvisories, deriveHealthRating } from "../lib/health-advisory";

const router: IRouter = Router();

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
// Stateless - no database involved, live-fetched on every request, same
// pattern as the OSINT weather check (osint.ts / lib/weather.ts). Each
// underlying fetch is independently caught so one source failing (or
// this session's own sandbox network policy blocking a domain, as
// happened repeatedly during development) never breaks the others.
type RiskLevel = "unrated" | "low" | "elevated" | "critical" | "do_not_travel";

const LEVEL_TO_RISK: Record<number, RiskLevel> = {
  1: "low",
  2: "elevated",
  3: "critical",
  4: "do_not_travel",
};

router.get("/countries/:iso2/intelligence", async (req, res): Promise<void> => {
  const iso2 = req.params.iso2;
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!iso2 || !name) {
    res.status(400).json({ error: "iso2 path param and name query param are both required" });
    return;
  }

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

  res.json({
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
  });
});

export default router;
