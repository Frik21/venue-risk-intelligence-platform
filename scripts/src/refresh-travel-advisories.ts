// Regenerates artifacts/api-server/src/lib/travel-advisory-data.ts from
// the US State Department's own authoritative ArcGIS feature service -
// see the comment at the top of that file for why this reference table
// exists instead of a live API call (short version: no live endpoint
// reliably exposes the Level 1-4 rating; this feature service backs
// their own official map and is real, not fabricated).
//
// Run monthly (or whenever you want fresher data) from the repo root:
//   pnpm --filter @workspace/scripts run refresh-travel-advisories
// Then review the diff and commit it like any other change.
import { writeFileSync } from "node:fs";
import path from "node:path";

const FEATURE_SERVICE_QUERY =
  "https://services6.arcgis.com/R6wlO6UHmSzqm9Vs/arcgis/rest/services/Travel_Advisory_Levels_viewOnlyVectors/FeatureServer/0/query" +
  "?where=1%3D1&outFields=NAME,LEVEL_,ADVDATE&returnGeometry=false&orderByFields=NAME&f=json";

const OUTPUT_PATH = path.resolve(import.meta.dirname, "..", "..", "api-server", "src", "lib", "travel-advisory-data.ts");

interface RawFeature {
  attributes: { NAME: string; LEVEL_: number; ADVDATE: number | null };
}

function toIsoDate(epochMs: number | null): string | null {
  if (epochMs === null) return null;
  return new Date(epochMs).toISOString().slice(0, 10);
}

function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function main() {
  const resp = await fetch(FEATURE_SERVICE_QUERY);
  if (!resp.ok) {
    throw new Error(`Feature service returned HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { features?: RawFeature[]; error?: { message?: string } };
  if (data.error) {
    throw new Error(`Feature service error: ${data.error.message ?? "unknown"}`);
  }
  const features = data.features ?? [];
  if (features.length < 200) {
    // The real dataset has ~289 rows (countries plus some sub-national
    // entries). A drastically smaller count means something's wrong
    // upstream (empty/partial response) - refuse to overwrite good data
    // with bad data.
    throw new Error(`Only got ${features.length} rows - expected ~289. Refusing to overwrite the existing table.`);
  }

  const rows = features.map(({ attributes: a }) => {
    const levelRaw = a.LEVEL_;
    const higherRiskAreas = levelRaw >= 10;
    const level = higherRiskAreas ? levelRaw / 10 : levelRaw;
    if (![1, 2, 3, 4].includes(level)) {
      throw new Error(`Unexpected LEVEL_ value ${levelRaw} for "${a.NAME}"`);
    }
    return { name: a.NAME, level, higherRiskAreas, advisoryDate: toIsoDate(a.ADVDATE) };
  });

  const generatedAt = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push("// Country Intelligence Engine - US State Department Travel Advisory");
  lines.push("// reference table.");
  lines.push("//");
  lines.push("// The live State Department APIs don't expose the actual Level 1-4");
  lines.push("// rating anywhere reachable (CountryTravelInformation has no such");
  lines.push("// field; TravelAdvisories/XMLTravelAdvisories return empty or error;");
  lines.push("// travel.state.gov itself blocks all automated requests with");
  lines.push("// Cloudflare bot protection). So this table is transcribed from the");
  lines.push("// State Department Bureau of Consular Affairs' own authoritative");
  lines.push('// ArcGIS feature service ("Travel Advisory Levels (View Layer - Read');
  lines.push('// Only)", id 85cf3abbe6ce41298b238cb661ba1ef8, description: "stewarded');
  lines.push('// exclusively by authoritative members of OCS [Office of Consular');
  lines.push('// Services]") - the same data that drives the official interactive');
  lines.push("// map. Reachable because it's hosted on public ArcGIS infrastructure,");
  lines.push("// not behind the .gov domain's bot protection.");
  lines.push("//");
  lines.push("// Real data, not live - a deliberate tradeoff given no live path");
  lines.push("// exists. `advisoryDate` is the real, per-country date the State");
  lines.push("// Department itself last updated that country's advisory, shown in");
  lines.push("// the UI so this is never presented as more current than it is.");
  lines.push("//");
  lines.push("// GENERATED FILE - do not hand-edit. Regenerate monthly (or as");
  lines.push("// needed) via:");
  lines.push("//   pnpm --filter @workspace/scripts run refresh-travel-advisories");
  lines.push(`// Last generated: ${generatedAt}`);
  lines.push("//");
  lines.push("// LEVEL_ encodes two things: the base 1-4 level, and (values >= 10)");
  lines.push('// whether the country "contains areas with higher security risk" (a');
  lines.push("// State Dept map legend category, e.g. 20 = Level 2 with higher-risk");
  lines.push("// areas) - divided out into `higherRiskAreas` below so callers get a");
  lines.push("// plain 1-4 level.");
  lines.push("//");
  lines.push("// Includes State Dept entries below the country level (Mexican");
  lines.push("// states, Gaza Strip, West Bank, etc.) as-is; lookups in");
  lines.push("// travel-advisory.ts match by name against our own registry, so");
  lines.push("// these are simply never matched rather than filtered out here.");
  lines.push("export interface TravelAdvisoryRow {");
  lines.push("  name: string;");
  lines.push("  level: 1 | 2 | 3 | 4;");
  lines.push("  higherRiskAreas: boolean;");
  lines.push("  advisoryDate: string | null;");
  lines.push("}");
  lines.push("");
  lines.push("export const TRAVEL_ADVISORY_LEVELS: TravelAdvisoryRow[] = [");
  for (const row of rows) {
    const advStr = row.advisoryDate ? `"${row.advisoryDate}"` : "null";
    lines.push(
      `  { name: "${escape(row.name)}", level: ${row.level}, higherRiskAreas: ${row.higherRiskAreas}, advisoryDate: ${advStr} },`,
    );
  }
  lines.push("];");
  lines.push("");

  writeFileSync(OUTPUT_PATH, lines.join("\n"));
  console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Refresh failed:", err.message ?? err);
  process.exitCode = 1;
});
