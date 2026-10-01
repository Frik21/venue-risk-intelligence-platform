import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, usersTable, taskAssignmentsTable, tasksTable, venuesTable } from "@workspace/db";
import { requireCompanyId } from "../lib/resolve-company";
import { fetchTravelAdvisory } from "../lib/travel-advisory";

const router: IRouter = Router();

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

// Rate benchmarking - Following Roadmap Tier 3, item 28 ("is a given
// day/night rate competitive for the region and risk level"). No
// external market-rate data source exists (same real gap item 16
// found for visa requirements - nothing free/reliable to pull live),
// so this is an internal benchmark: a CPO's own rate against the
// company's own other CPOs, bucketed by "region" (the country of the
// venue they most recently worked, via their latest task_assignments
// row) where there's enough of a sample to mean anything, falling
// back to a flat company-wide average otherwise. "Risk level" reuses
// the existing US State Dept travel-advisory levels this app already
// has (lib/travel-advisory.ts, the same data Country Intelligence
// reads) as shown-for-context alongside the region, rather than a
// second bucketing axis - this app's CPO headcount is small enough
// that slicing by region AND risk level separately would mostly
// produce single-CPO "averages" that aren't really averages of
// anything.
router.get("/rate-benchmarking", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const cpos = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.companyId, companyId), eq(usersTable.role, "cpo"), eq(usersTable.active, true)));

  const regionByUser = new Map<number, string | null>();
  for (const cpo of cpos) {
    const [row] = await db
      .select({ country: venuesTable.country })
      .from(taskAssignmentsTable)
      .innerJoin(tasksTable, eq(taskAssignmentsTable.taskId, tasksTable.id))
      .innerJoin(venuesTable, eq(tasksTable.venueId, venuesTable.id))
      .where(and(eq(taskAssignmentsTable.operatorId, cpo.id), eq(taskAssignmentsTable.companyId, companyId)))
      .orderBy(desc(tasksTable.createdAt))
      .limit(1);
    regionByUser.set(cpo.id, row?.country ?? null);
  }

  const companyAvgDayRate = average(cpos.map((c) => c.dayRate).filter((r): r is number => r != null));
  const companyAvgNightRate = average(cpos.map((c) => c.nightRate).filter((r): r is number => r != null));

  const regionGroups = new Map<string, { day: number[]; night: number[] }>();
  for (const cpo of cpos) {
    const region = regionByUser.get(cpo.id);
    if (!region) continue;
    const group = regionGroups.get(region) ?? { day: [], night: [] };
    if (cpo.dayRate != null) group.day.push(cpo.dayRate);
    if (cpo.nightRate != null) group.night.push(cpo.nightRate);
    regionGroups.set(region, group);
  }

  const riskByRegion = new Map<string, Awaited<ReturnType<typeof fetchTravelAdvisory>>>();
  for (const region of regionGroups.keys()) {
    riskByRegion.set(region, await fetchTravelAdvisory("", region));
  }

  const rows = cpos
    .filter((c) => c.dayRate != null || c.nightRate != null)
    .map((cpo) => {
      const region = regionByUser.get(cpo.id) ?? null;
      const group = region ? regionGroups.get(region) : undefined;
      // Need at least 2 OTHER CPOs in the region (excluding this one)
      // for a regional average to mean anything - otherwise a CPO is
      // just being compared to themselves.
      const regionSampleSize = group ? group.day.length + group.night.length : 0;
      const hasRegionSample = (group?.day.length ?? 0) >= 2 || (group?.night.length ?? 0) >= 2;
      const risk = region ? riskByRegion.get(region) : undefined;
      return {
        userId: cpo.id,
        name: cpo.name,
        dayRate: cpo.dayRate,
        nightRate: cpo.nightRate,
        region,
        riskLevel: risk?.level ?? null,
        riskLevelLabel: risk?.levelLabel ?? null,
        comparisonBasis: hasRegionSample ? ("region" as const) : ("company" as const),
        avgDayRate: hasRegionSample ? average(group!.day) : companyAvgDayRate,
        avgNightRate: hasRegionSample ? average(group!.night) : companyAvgNightRate,
        regionSampleSize,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(rows);
});

export default router;
