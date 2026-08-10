import { eq, and, ne, isNotNull } from "drizzle-orm";
import { db, tasksTable, venuesTable, taskAssignmentsTable, venueSearchPhrasesTable, osintEventsTable } from "@workspace/db";
import { fetchGdeltFindings, gdeltEventType } from "./gdelt";
import { logger } from "./logger";

// Server-side mirror of the frontend's taskBucket() "running" case (see
// lib/task-bucket.ts) - a task counts as Running once every detail field
// is filled in, its quotation is approved, and at least one CPO is on
// the roster. Used to decide which venues GDELT should actually be
// watching right now, per direct product direction: "when a task is
// running, GDELT must then start monitoring the location that was
// used, using the phrases that was provided."
export async function getRunningVenues(): Promise<{ venueId: number; venueName: string }[]> {
  const rows = await db
    .selectDistinct({ venueId: tasksTable.venueId, venueName: venuesTable.name })
    .from(tasksTable)
    .innerJoin(venuesTable, eq(tasksTable.venueId, venuesTable.id))
    .innerJoin(taskAssignmentsTable, eq(taskAssignmentsTable.taskId, tasksTable.id))
    .where(
      and(
        eq(tasksTable.archived, false),
        ne(tasksTable.status, "completed"),
        eq(tasksTable.quotationStatus, "approved"),
        ne(tasksTable.title, ""),
        ne(tasksTable.clientName, ""),
        ne(tasksTable.clientContact, ""),
        ne(tasksTable.clientRequirements, ""),
        isNotNull(tasksTable.dueDate),
        isNotNull(tasksTable.endDate),
      ),
    );

  return rows.filter((r): r is { venueId: number; venueName: string } => r.venueId != null);
}

// Runs a GDELT check for one venue using the current global phrase list
// (see venueId comment on venueSearchPhrasesTable) and inserts any new
// findings as pending OSINT events, deduped by sourceUrl against what's
// already there for that venue - same insert shape the manual
// per-venue check on GET /venues/:id/osint already used. Returns how
// many new events were added.
export async function runGdeltCheckForVenue(venueId: number): Promise<number> {
  const phrases = await db.select({ phrase: venueSearchPhrasesTable.phrase }).from(venueSearchPhrasesTable);
  if (phrases.length === 0) return 0;

  const findings = await fetchGdeltFindings(phrases.map((p) => p.phrase));
  if (findings.length === 0) return 0;

  const existing = await db
    .select({ sourceUrl: osintEventsTable.sourceUrl })
    .from(osintEventsTable)
    .where(eq(osintEventsTable.venueId, venueId));
  const existingUrls = new Set(existing.map((r) => r.sourceUrl).filter((u): u is string => Boolean(u)));
  const fresh = findings.filter((f) => !existingUrls.has(f.sourceUrl));
  if (fresh.length === 0) return 0;

  await db.insert(osintEventsTable).values(
    fresh.map((f) => ({
      venueId,
      eventType: gdeltEventType(f.severity),
      summary: f.summary,
      sourceName: f.sourceName,
      sourceUrl: f.sourceUrl,
      status: "pending" as const,
    })),
  );
  return fresh.length;
}

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

async function checkAllRunningVenues() {
  const venues = await getRunningVenues();
  if (venues.length === 0) return;

  logger.info({ count: venues.length }, "GDELT monitor: checking Running-task venues");
  for (const v of venues) {
    try {
      const added = await runGdeltCheckForVenue(v.venueId);
      if (added > 0) {
        logger.info({ venueId: v.venueId, venueName: v.venueName, added }, "GDELT monitor: new findings");
      }
    } catch (err) {
      logger.error({ err, venueId: v.venueId }, "GDELT monitor: check failed for venue");
    }
  }
}

// Starts the recurring check - runs once immediately, then every
// CHECK_INTERVAL_MS for as long as this server process is up. There's
// no external cron here, so monitoring only runs while the API server
// itself is running.
export function startGdeltMonitor() {
  checkAllRunningVenues().catch((err) => logger.error({ err }, "GDELT monitor: initial check failed"));
  setInterval(() => {
    checkAllRunningVenues().catch((err) => logger.error({ err }, "GDELT monitor: interval check failed"));
  }, CHECK_INTERVAL_MS);
}
