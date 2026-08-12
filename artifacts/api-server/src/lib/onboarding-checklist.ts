// Operator Onboarding's checklist - a fixed, ordered list (same
// "defined once here as the single source of truth" pattern as
// plan-checklist.ts) rather than user-configurable. A CPO's stored
// checklist is just a { [key]: boolean } map, filled in against this
// list on every read so a missing key (an item added after the record
// was created) reads as unchecked rather than causing a data migration.
export interface OnboardingChecklistItem {
  key: string;
  label: string;
  // Items sharing a group are mutually exclusive (an operator is a
  // Freelancer or on a Long term contract, not both) - checking one
  // clears the rest of its group (see the PATCH .../checklist route),
  // and the whole group counts as a single item toward completion
  // (any one of them checked satisfies it, not every item in it - see
  // computeProgress in routes/onboarding.ts).
  group?: string;
}

export const ONBOARDING_CHECKLIST_ITEMS: OnboardingChecklistItem[] = [
  { key: "application_received", label: "Application received" },
  { key: "id_verified", label: "ID verified" },
  { key: "psira_verified", label: "PSIRA registration verified" },
  { key: "background_check", label: "Background check completed" },
  { key: "references_checked", label: "References checked" },
  { key: "contract_signed", label: "Contract signed" },
  { key: "freelancer", label: "Freelancer", group: "engagement_type" },
  { key: "long_term_contract", label: "Long term contract", group: "engagement_type" },
  { key: "equipment_issued", label: "Equipment issued" },
  { key: "training_complete", label: "Training complete" },
  { key: "ready_for_deployment", label: "Ready for deployment" },
];

export const DOCUMENT_TYPES = [
  { value: "id_document", label: "ID Document" },
  { value: "passport", label: "Passport" },
] as const;
