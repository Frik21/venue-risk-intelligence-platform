// The Operational Plan's pre-op readiness checklist - a fixed, ordered
// list per direct product direction (from someone who did this job:
// "here is the list"), not a user-configurable one. Defined once here
// as the single source of truth; a plan's stored checklist is just a
// { [key]: boolean } map, filled in against this list on every read so
// a missing key (an item added after the plan was created) reads as
// unchecked rather than causing a data migration.
export interface PlanChecklistItem {
  key: string;
  label: string;
}

export const PLAN_CHECKLIST_ITEMS: PlanChecklistItem[] = [
  { key: "vehicle_inspection_completed", label: "Vehicle inspection completed" },
  { key: "primary_route_confirmed", label: "Primary route confirmed" },
  { key: "alternative_route_confirmed", label: "Alternative route confirmed" },
  { key: "operational_route_mapped", label: "Operational Route mapped" },
  { key: "closest_hospitals_identified", label: "Closest hospitals identified" },
  { key: "closest_police_stations_identified", label: "Closest police stations identified" },
  { key: "fuel_points_identified", label: "Fuel / refuelling points identified" },
  { key: "communications_checked", label: "Communications checked" },
  { key: "personnel_confirmed", label: "Personnel / team confirmed" },
  { key: "equipment_requirements_checked", label: "Equipment requirements checked" },
  { key: "operating_conditions_reviewed", label: "Current Operating Conditions reviewed" },
  { key: "area_advisories_reviewed", label: "Area Advisories reviewed" },
  { key: "venue_assessment_reviewed", label: "Destination / venue assessment reviewed" },
  { key: "contingency_arrangements_confirmed", label: "Emergency / contingency arrangements confirmed" },
  { key: "final_briefing_completed", label: "Final operational briefing completed" },
];
