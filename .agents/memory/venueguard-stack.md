---
name: VenueGuard stack decisions
description: Key decisions and gotchas for the VenueGuard physical venue risk assessment platform
---

**Why:** Non-obvious constraints that tripped up previous work.

**Zod in api-server:** Must add `"zod": "catalog:"` to `artifacts/api-server/package.json` dependencies. Using `import { z } from "zod"` directly in route files. Do NOT use `zod/v4` subpath — esbuild cannot resolve it.

**Assessment status flow:** `draft → under_review → approved → monitoring → review_required → escalated → archived` (not the older draft/active/completed).

**Risk ratings:** `low | moderate | moderate_high | high | unknown` (five levels, snake_case).

**SelectItem empty string:** Radix UI `<SelectItem value="">` throws a runtime error. Always use a non-empty sentinel like `"all"` or `"none"` for "no selection" options.

**Frontend API client:** Uses a hand-rolled `apiFetch` in `artifacts/risk-assessments/src/lib/api.ts` (NOT codegen React Query hooks) for all new endpoints. Codegen hooks exist but are for the older endpoints.

**OSINT flow:** Mock — queries `GET /api/venues/:id/osint` to generate template events; accepting a crime/protest/riot event auto-creates an alert. Review via `PATCH /api/osint/:id/review`.

**Leaflet:** Installed as `leaflet react-leaflet @types/leaflet` in `@workspace/risk-assessments`. Default icon fix required (delete `_getIconUrl` and mergeOptions with CDN URLs).
