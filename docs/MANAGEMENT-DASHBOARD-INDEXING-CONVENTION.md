# Management Dashboard Sub-Layer Indexing Convention

## Rule

The project tracks major build stages of the Management Dashboard (the
Manager/Admin-facing side of VenueGuard - Dashboard, Calendar, Tasks,
Operator Deployment, Operator Onboarding, Offices, Costs, Users, and the
schema/backend routes/shared components that support them) as numbered
layers, separate from `docs/INDEXING-CONVENTION.md`'s Operational Canvas
layers (the CPO-facing map/country-focus system). The two indexes never
share numbering and are never cross-referenced by number.

- Whenever the user says the exact phrase **"New dashboard line"**, the
  current layer's sub-counter increments by one.
- The first use while on Layer 1 becomes `1.1`, the next `1.2`, and so on,
  chronologically.
- When work moves to a new layer, the sub-counter resets, and the first
  "New dashboard line" on that layer becomes e.g. `2.1`, then `2.2`.
- This index was backfilled in one pass from real git history (see commit
  hashes below) up to the point the convention was introduced - entries
  before that point are numbered for reference but weren't logged
  incrementally as they happened. Numbering going forward is not
  retroactive beyond that backfill.

## Index

| Sub-Layer Index | Description |
|---|---|
| 1.1 | Admin (Manager) Dashboard foundation - `App.tsx`, `components/layout.tsx`, `pages/admin/dashboard.tsx` (`87cc330`). First Manager-facing page, distinct from the CPO's own Operational Canvas. |
| 1.2 | A way to switch between the Operator and Admin experiences - `layout.tsx`, `pages/dashboard.tsx` (`a68fcf9`). Precursor to the later CPO/Admin quick-access chooser (8.1). |
| 1.3 | Decluttered the admin sidebar/dashboard - removed Maps and OSINT, which are analyst/CPO concerns, not Manager dispatch concerns (`868c145`). |
| 1.4 | Turned the Management Dashboard into a real task-creation hub - `new-task-dialog.tsx`, `admin/dashboard.tsx`, `tasks/list.tsx` (`52a03e6`). |
| 1.5 | Restructured Management Dashboard to the full VenueGuard information architecture (`133c2fa`). |
| 1.6 | Built out the remaining VenueGuard information architecture with real data - global field-notes/evidence/audit-log endpoints (`assessments.ts`, `evidence.ts`, `venue-risk-assessments.ts` routes), Field Intelligence / Documents / Audit History pages, `api.ts` client methods (`c4a08ca`). |
| 1.7 | Rebuilt the Management Dashboard around a refined 9-section hierarchy - `expenses.ts`, `task-pdf.ts`, `tasks.ts` routes, `new-task-dialog.tsx` (`9bacefe`). |
| 1.8 | Turned the Management Dashboard into a lean dispatch console - the pivot down from the full 9-section architecture (1.5-1.7) to the lean Manager set that stands today (Dashboard, Calendar, Tasks, Operator Deployment, Operator Onboarding, Offices, Costs, Users); `offices.ts` route, `cpo-deployment.tsx`, sidebar nav rebuild in `layout.tsx` (`0b7f4fe`). |
| 2.1 | Real Personnel Costs - CPO pay rates, task-linked timesheet, overtime; `lib/personnel-cost.ts`, `personnel-costs.ts` / `settings.ts` / `timesheet.ts` / `users.ts` routes (`8eb0668`). |
| 2.2 | Gated Personnel Costs behind Manager approval of logged hours - `timesheet-entries.ts` schema (`approved` flag), approve UI in `tasks/list.tsx` (`e506994`). |
| 3.1 | Operator Onboarding - checklist + document tracking per CPO; `lib/onboarding-checklist.ts`, `onboarding.ts` route, `pages/admin/onboarding.tsx` (`16599ce`). |
| 3.2 | Renamed "CPO Deployment" to "Operator Deployment" in the nav and page title (`b468e1c`). |
| 3.3 | Added onboarding status categories: Onboarded / In Progress / Denied (`6537040`). |
| 3.4 | Added "Add Operator" button to Operator Onboarding (`e4ce7b1`). |
| 3.5 | Auto-expand the onboarding checklist right after adding an operator (`2f20662`). |
| 3.6 | Relabelled onboarding status: Pending / Approved / Denied (`277dd2b`). |
| 3.7 | Gated CPO account creation behind onboarding approval - first version of this rule, later fully replaced by 5.6's independent Operational Access gate (`c295f25`). |
| 3.8 | Relabelled onboarding document type: "ID Document or Passport" (`8e9e77d`). |
| 3.9 | Split onboarding document type into separate ID Document and Passport options (`8761d51`). |
| 3.10 | Trimmed onboarding document types down to just ID Document and Passport (`42bc770`). |
| 3.11 | Made onboarding stat cards clickable filters (`89e81da`) - the pattern later reused for Operator Deployment (4.3) and Tasks (7.1/7.4). |
| 3.12 | Added name search to Operator Onboarding (`39f9588`). |
| 4.1 | Added a full month-grid Calendar page to the Management nav - `pages/admin/calendar.tsx` (`2b0ddf0`). |
| 4.2 | Calendar: render multi-day tasks as spanning bars (`2794766`). |
| 4.3 | Made Operator Deployment's stat cards clickable filters, same pattern as 3.11 (`a39c221`). |
| 5.1 | Added "Assign User" button for Approved operators on the onboarding list - first attempt at a CPO-account-activation control, later superseded (`ddee431`). |
| 5.2 | Added "Assign User" button to Operator Deployment - a second, separate attempt at the same underlying problem (`f1151da`). |
| 5.3 | Added an inert "Assign Operational Access" placeholder button - UI shell only, no real gate behind it yet (`d86aaae`). |
| 5.4 | Removed the 5.1 "Assign User" button from the onboarding list, consolidating onto 5.3's marker instead (`1a5e8e3`). |
| 5.5 | Wired up "Assign Operational Access" as an independent access marker - tracked, but not yet the real account gate (`812852e`). |
| 5.6 | Made "Assign Operational Access" the real gate on CPO account access - `operationalAccessGrantedAt`, decoupled from onboarding `status`, with the full grant/revoke/reactivate/deny-cascade backend logic and matching disabled-state frontend UX (`cd8575f`). |
| 6.1 | Let Managers add a location directly from the Task Request form - first version of `AddVenueDialog`, a separate popup reached via a dropdown + "+ Add Location" link (`822676a`). |
| 6.2 | Replaced that dropdown + link with a combined search-or-create combobox (`LocationCombobox`) - typing filters existing venues and offers "Create '\<query\>'" inline (`374fb3a`). |
| 6.3 | Added real-address search (Photon/OpenStreetMap, free/no API key - same engine as the full Add New Venue page) to the quick Add Location dialog (`4889bea`). |
| 6.4 | Merged location creation into the Location field itself, no separate window at all - real address matches and a bare "Add as new location" fallback both live inline in the same dropdown; removed the now-unused `AddVenueDialog` (`9d64cf0`). |
| 7.1 | Added `clientConfirmedAt` and Pending / Running / Completed client-confirmation buckets to Tasks, independent of the CPO's own work-progress `status` (`074a5e5`). |
| 7.2 | Removed "Assign CPO(s)" from the New Task Request and Edit Task forms - assignment was moving to its own dedicated location (`ad29dcb`). |
| 7.3 | Turned Operator Deployment's "Assign User" link into an "Assign Task" dropdown shell - empty, no options wired up yet (`efaa163`). |
| 7.4 | Split the Pending bucket into Pending Details (not yet client-confirmed) and Pending Allocation (confirmed, no CPO yet); Running now requires both confirmed and staffed (`210171b`). |
| 7.5 | Wired Operator Deployment's Assign Task dropdown to real Pending Allocation tasks - picking one assigns that CPO and moves the task to Running; extracted the shared bucket rule into `lib/task-bucket.ts` so Tasks and Operator Deployment can't drift out of sync (`d27f38a`). |
| 8.1 | Added a CPO/Admin quick-access chooser in front of the CPO canvas - temporary landing page at `/`, CPO Operational Canvas moved to `/cpo` (`cf01e44`). |
| 8.2 | Added Quotation Status (Quotation Approved / Quotation Awaiting Approval / Quotation Denied) as a 3-button picker on the New Task Request and Edit Task forms - `quotationStatus` field, independent of `clientConfirmedAt`/status for now (`e8e0601`). **In progress**: how this relates to the Pending Details / Pending Allocation buckets (7.4) is still an open question - resuming here next. |
