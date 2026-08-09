// Operator Onboarding's checklist - a fixed, ordered list (same
// "defined once here as the single source of truth" pattern as
// plan-checklist.ts) rather than user-configurable. A CPO's stored
// checklist is just a { [key]: boolean } map, filled in against this
// list on every read so a missing key (an item added after the record
// was created) reads as unchecked rather than causing a data migration.
export interface OnboardingChecklistItem {
  key: string;
  label: string;
}

export const ONBOARDING_CHECKLIST_ITEMS: OnboardingChecklistItem[] = [
  { key: "application_received", label: "Application received" },
  { key: "id_verified", label: "ID verified" },
  { key: "psira_verified", label: "PSIRA registration verified" },
  { key: "background_check", label: "Background check completed" },
  { key: "references_checked", label: "References checked" },
  { key: "contract_signed", label: "Contract signed" },
  { key: "equipment_issued", label: "Equipment issued" },
  { key: "training_complete", label: "Training complete" },
  { key: "ready_for_deployment", label: "Ready for deployment" },
];

export const DOCUMENT_TYPES = [
  { value: "id_document", label: "ID Document" },
  { value: "passport", label: "Passport" },
] as const;
