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

// Cert/license types deliberately span the jurisdictions CPOs actually
// work under (PSIRA in South Africa, SIA in the UK, state-level cards
// elsewhere) rather than one generic "certification" bucket - per
// direct product direction (Following Roadmap Tier 1, item 4). Every
// type here shares the same expiryDate field on operator_documents;
// "Other Certification / License" is the catch-all for anything not
// explicitly listed.
export const DOCUMENT_TYPES = [
  { value: "id_document", label: "ID Document" },
  { value: "passport", label: "Passport" },
  { value: "psira_registration", label: "PSIRA Registration" },
  { value: "sia_license", label: "SIA License" },
  { value: "firearm_competency", label: "Firearm Competency Certificate" },
  { value: "medical_certificate", label: "Medical / First Aid Certificate" },
  { value: "drivers_license", label: "Driver's License" },
  // Insurance/liability policy tracking - Following Roadmap Tier 3,
  // item 21. Scoped via AskUserQuestion to per-operator only (not a
  // separate company-level policy entity) - these are just two more
  // document types, so the expiry-tracking machinery already built for
  // PSIRA/SIA/etc. (item 4's Expiring Certifications card, the HR
  // dashboard's cert tiles, and the Compliance Rollup) picks them up
  // automatically with no new code.
  { value: "professional_indemnity_insurance", label: "Professional Indemnity Insurance" },
  { value: "public_liability_insurance", label: "Public Liability Insurance" },
  { value: "other_certification", label: "Other Certification / License" },
] as const;
