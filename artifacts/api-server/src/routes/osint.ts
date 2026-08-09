import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, osintEventsTable, venuesTable, venueSearchPhrasesTable, alertsTable } from "@workspace/db";
import { z } from "zod";
import { fetchWeatherFinding, weatherEventType, weatherAlertPriority } from "../lib/weather";
import { fetchGdeltFindings, gdeltEventType, gdeltAlertPriority } from "../lib/gdelt";

const router: IRouter = Router();

// A live weather check runs on every /venues/:id/osint fetch (below) -
// conditions genuinely change, unlike the static templates. To avoid
// inserting a fresh row on every page load while a storm is ongoing, a
// pending weather-type row created within this window gets its summary
// updated in place instead of duplicated. Once it's older than this (or
// an analyst has already reviewed it), the next live finding starts a
// new row.
const WEATHER_REFRESH_WINDOW_MS = 3 * 60 * 60 * 1000;

function formatOsint(row: typeof osintEventsTable.$inferSelect) {
  return {
    id: row.id,
    venueId: row.venueId,
    eventType: row.eventType,
    summary: row.summary,
    sourceName: row.sourceName ?? null,
    sourceUrl: row.sourceUrl ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    status: row.status as "pending" | "accepted" | "rejected",
    analystNote: row.analystNote ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const OSINT_TEMPLATES = [
  { eventType: "hospital", summary: "Nearest major hospital identified within 2km", sourceName: "OpenStreetMap", confidenceLevel: "high" },
  { eventType: "police_station", summary: "Police station located 800m from venue", sourceName: "OpenStreetMap", confidenceLevel: "high" },
  { eventType: "transport", summary: "Metro station 300m from venue entrance", sourceName: "OpenStreetMap", confidenceLevel: "high" },
  { eventType: "crime", summary: "Elevated petty crime reported in surrounding district (last 90 days)", sourceName: "Local Crime Index", confidenceLevel: "medium" },
  { eventType: "advisory", summary: "General security advisory issued for city centre", sourceName: "Government Advisory Portal", confidenceLevel: "medium" },
  { eventType: "news", summary: "Recent public gathering reported near venue", sourceName: "Local News Feed", confidenceLevel: "low" },
  { eventType: "protest", summary: "Planned demonstration scheduled in vicinity next week", sourceName: "Protest Monitor", confidenceLevel: "medium" },
  { eventType: "road_closure", summary: "Temporary road closure affecting primary access route", sourceName: "Traffic Authority", confidenceLevel: "high" },
];

router.get("/venues/:id/osint", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, id));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  const existing = await db
    .select()
    .from(osintEventsTable)
    .where(eq(osintEventsTable.venueId, id))
    .orderBy(desc(osintEventsTable.createdAt));

  if (existing.length === 0) {
    const toInsert = OSINT_TEMPLATES.map((t) => ({
      venueId: id,
      eventType: t.eventType,
      summary: t.summary,
      sourceName: t.sourceName,
      lat: venue.lat ? venue.lat + (Math.random() - 0.5) * 0.01 : null,
      lng: venue.lng ? venue.lng + (Math.random() - 0.5) * 0.01 : null,
      status: "pending" as const,
    }));
    await db.insert(osintEventsTable).values(toInsert);
  }

  // Live weather check - the one real (non-template) OSINT source so
  // far. Failures here must never break the rest of the OSINT feed, so
  // they're caught and logged rather than propagated.
  if (venue.lat != null && venue.lng != null) {
    try {
      const finding = await fetchWeatherFinding(venue.lat, venue.lng);
      if (finding) {
        const eventType = weatherEventType(finding.severity);
        const recentPendingWeather = existing.find(
          (row) =>
            row.eventType.startsWith("weather") &&
            row.status === "pending" &&
            Date.now() - row.createdAt.getTime() < WEATHER_REFRESH_WINDOW_MS,
        );
        if (recentPendingWeather) {
          await db
            .update(osintEventsTable)
            .set({ eventType, summary: finding.summary, sourceUrl: finding.sourceUrl })
            .where(eq(osintEventsTable.id, recentPendingWeather.id));
        } else {
          await db.insert(osintEventsTable).values({
            venueId: id,
            eventType,
            summary: finding.summary,
            sourceName: finding.sourceName,
            sourceUrl: finding.sourceUrl,
            lat: venue.lat,
            lng: venue.lng,
            status: "pending",
          });
        }
      }
    } catch (err) {
      console.error(`Weather OSINT check failed for venue ${id}:`, err);
    }
  }

  // Live GDELT news check - only runs if this venue has search phrases
  // configured (see venueSearchPhrasesTable's own comment for why that's
  // deliberate). Deduped against existing rows by sourceUrl so the same
  // article isn't inserted again on every page load.
  try {
    const phrases = await db
      .select({ phrase: venueSearchPhrasesTable.phrase })
      .from(venueSearchPhrasesTable)
      .where(eq(venueSearchPhrasesTable.venueId, id));

    if (phrases.length > 0) {
      const findings = await fetchGdeltFindings(phrases.map((p) => p.phrase));
      const existingUrls = new Set(existing.map((row) => row.sourceUrl).filter((url): url is string => Boolean(url)));
      const fresh = findings.filter((f) => !existingUrls.has(f.sourceUrl));

      if (fresh.length > 0) {
        await db.insert(osintEventsTable).values(
          fresh.map((f) => ({
            venueId: id,
            eventType: gdeltEventType(f.severity),
            summary: f.summary,
            sourceName: f.sourceName,
            sourceUrl: f.sourceUrl,
            status: "pending" as const,
          })),
        );
      }
    }
  } catch (err) {
    console.error(`GDELT OSINT check failed for venue ${id}:`, err);
  }

  const finalRows = await db
    .select()
    .from(osintEventsTable)
    .where(eq(osintEventsTable.venueId, id))
    .orderBy(desc(osintEventsTable.createdAt));
  res.json(finalRows.map(formatOsint));
});

router.patch("/osint/:id/review", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const ReviewSchema = z.object({
    status: z.enum(["accepted", "rejected"]),
    analystNote: z.string().optional(),
  });
  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .update(osintEventsTable)
    .set(parsed.data)
    .where(eq(osintEventsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "OSINT event not found" }); return; }

  const promotableTypes = ["crime", "protest", "riot", "weather", "weather_high", "weather_critical", "news", "news_high", "news_critical"];
  if (parsed.data.status === "accepted" && promotableTypes.includes(row.eventType)) {
    const priority = row.eventType.startsWith("weather")
      ? weatherAlertPriority(row.eventType)
      : row.eventType.startsWith("news")
        ? gdeltAlertPriority(row.eventType)
        : row.eventType === "riot"
          ? "critical"
          : "medium";
    await db.insert(alertsTable).values({
      venueId: row.venueId,
      priority,
      title: `OSINT Alert: ${row.eventType.replace(/_/g, " ")}`,
      summary: row.summary,
      status: "pending",
    });
  }

  res.json(formatOsint(row));
});

export default router;
