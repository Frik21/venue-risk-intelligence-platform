Every new Claude Code session must read this document before making any
engineering changes.

# VenueGuard Engineering Baseline

This document describes **how** VenueGuard is currently implemented. It is
generated from the repository as of Process 3.6 — nothing below is
aspirational or invented. For **what** VenueGuard is and the product rules
engineering must never violate, see `docs/PRODUCT_CONSTITUTION.md` (highest
authority) and `docs/Product-Constitution.md`.

---

## Current Branch

`feature/remove-night-map-for-rebuild`

HEAD at time of writing: `9ba77ce` — "DEV-1 stabilize Codespaces
development environment".

This branch contains the full Operational Canvas rebuild: the sequence of
commits indexed `1.2` through `3.4I` (see Sub-Layer Indexing Convention
below), plus `DEV-1`.

---

## Repository Layout

This is a pnpm workspace (`pnpm-workspace.yaml`) with packages under:

- `artifacts/risk-assessments` — **the active VenueGuard product surface.**
  All Operational Canvas / Layer Registry / Country Registry / Country
  Focus / QA Mode work described below lives here. React 19 + Vite 7 +
  TypeScript + Tailwind v4, built with `@vitejs/plugin-react`.
- `artifacts/api-server` — a scaffolded Express-based API package. Not
  currently wired to the Operational Canvas or any VenueGuard product
  feature described in this document.
- `artifacts/mockup-sandbox` — a scaffolded Vite/React mockup sandbox. Not
  part of the shipped VenueGuard product surface.
- `lib/api-zod`, `lib/api-client-react`, `lib/api-spec`, `lib/db` —
  scaffolded shared libraries (OpenAPI codegen via Orval, Drizzle ORM
  schema/client). Not currently consumed by `artifacts/risk-assessments`.
- `scripts` — workspace-level scripts package (currently a placeholder
  `hello.ts` plus `post-merge.sh`).
- `supabase/migrations` — one initial-schema SQL migration. Not currently
  wired to `artifacts/risk-assessments`.

Everything described in the sections below is implemented in
`artifacts/risk-assessments/src`, primarily in a single file:
`artifacts/risk-assessments/src/pages/dashboard.tsx` (798 lines), plus
three data/logic modules under `artifacts/risk-assessments/src/lib/`.

---

## Renderer Architecture

There is no interactive map library mounted (no Leaflet, no tile server,
no pan/zoom/drag base map). The Operational Canvas renders:

1. One approved static map image — `world-map-v17.png`
   (`artifacts/risk-assessments/public/data/world-map-v17.png`, a
   2048x2048 square image) — as a plain `<img>`.
2. A stack of absolutely-positioned SVG overlays on top of it, all sharing
   the exact same `viewBox="0 0 1000 1000"` /
   `preserveAspectRatio="xMidYMid slice"` pair as the base image's own
   `object-fit: cover; object-position: center center` CSS, so overlay
   geometry and the image are scaled/cropped by the identical browser
   algorithm on every resize (Operational Geometry Alignment Engine,
   Index 2.2C). No JS resize listener, no measured offsets.

Earlier history on this branch (see `docs/INDEXING-CONVENTION.md`, Index
1.3–1.7) built a Leaflet-based tiled "Earth at Night" city-lights raster
map. That approach was removed and replaced with the approved static
image (commits "Remove Operational Canvas map rendering, replace with
rebuild placeholder" and "Replace map placeholder with approved static
Operational Canvas image", both pre-`1.2` on this branch) before the
current Layer 1–3 rebuild began. The tile-generation Python scripts from
that era (`generate-night-map-tiles.py`,
`generate-night-map-edge-fades.py`, `generate-city-lights.py`) still exist
under `public/data/` but their output is not part of the current renderer.

---

## Layer Registry

Defined as data (not just JSX/CSS) in `dashboard.tsx` as
`CANVAS_LAYERS` (Index 1.8), a single source of truth for stacking order:

| Order | id | Renders today |
|---|---|---|
| 1 | `base-map` | The approved static map image |
| 2 | `operational-layers` | Country Selection Engine hit-zones (invisible SVG paths) |
| 3 | `operational-footprint` | Country Focus render (dim overlay + clipped country cutout) |
| 4 | `country-intelligence` | Country boundary debug overlay + QA Mode overlay |
| 5 | `breathing-markers` | Declared, renders nothing yet |
| 6 | `debug-layer-numbers` | Declared, renders nothing yet (badge stack is separately gated, see below) |

Every layer's `<div>` is always mounted regardless of its `visible` flag —
`visible` is metadata only today and does not gate rendering. A layer
being "off" is meant to mean its content is empty, not that the div itself
stops existing, so stacking order and future overlays are never disturbed
by toggling a layer.

---

## Operational Canvas

`OperationalCanvas()` in `dashboard.tsx` is the component that renders the
full layer stack inside a fixed, full-viewport `<section
className="operational-canvas">`. It is reached after the `login` →
`preparing` → `brief` step flow in the top-level `Dashboard` component
(all three earlier steps are static/placeholder UI, not backed by real
auth or data yet).

The Canvas itself is static (no drag/pan/scroll) — the only interactions
are: click a country to select it, click outside a selected/focused
country to clear the selection, or press `Escape` to clear the selection.

---

## Operational Geometry

- `OPERATIONAL_GEOMETRY_VIEWBOX = "0 0 1000 1000"`
- `OPERATIONAL_GEOMETRY_FIT = "xMidYMid slice"`

Every SVG overlay in the Canvas (selection hit-zones, boundary debug
overlay, QA overlay, country focus clip/image) uses this exact pair, so
all overlay geometry stays pixel-aligned to the base map at any viewport
size without touching the map itself (Index 2.2C).

---

## Operational Country Registry

`artifacts/risk-assessments/src/lib/country-registry.ts` — a **generated
file** (comment: "do not edit by hand. Regenerate via
`public/data/generate-country-registry.py`"). Built offline from
`operational-country-borders.json` (Natural Earth–derived data),
pre-projected into the same square 1000x1000 source-image space as
`world-map-v17.png` and pre-simplified. Covers all 235 countries.

```ts
export interface CountryDefinition {
  id: string;
  iso2: string;
  iso3: string;
  name: string;
  svgPath: string;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}
```

These paths are for selection/masking/isolation only — not a display
asset in their own right. A `country-adjustments.json` file exists
alongside the registry for reviewer-flagged corrections (see QA Mode
below) but currently ships empty; generating corrections into the
registry itself is out of scope for the current pipeline.

---

## Country Selection Engine

`artifacts/risk-assessments/src/lib/country-selection-engine.ts` (Index
3.0) — the single, permanent entry point for country selection. Pure
state + pub/sub module: `selectCountry`, `clearSelection`,
`getSelectedCountry`, `subscribe`/`unsubscribe`. It never touches the DOM
or the Canvas directly — selecting a country here causes no visual change
by itself; consumers (currently just `OperationalCanvas`) subscribe and
render in response.

Every future selection entry point (search, deep links, AI actions, the
Camera Engine, Country Focus Engine, Operational Intelligence, User
Presence, Operational Layers) is intended to select through this module
rather than holding its own selection state.

---

## Country Focus Registry / Country Focus Engine

`artifacts/risk-assessments/src/lib/country-focus-registry.ts` (Index
3.2–3.4I) extends every `CountryDefinition` with a `focusPoint`,
`cameraTarget`, and `defaultFocusScale`, computed once at module load for
all 235 countries — no hardcoded per-country values remain.

- **Focus point:** the centroid of a country's own largest-area ring
  (mainland), found generically from its SVG path via the shoelace
  formula — not a hand-reviewed override list.
- **Camera target:** currently the same Canvas centre, `{ x: 500, y: 500
  }`, for every country (no per-country camera behaviour built yet).
- **Default focus scale:** derived from the largest ring's own bounding
  box so every country reaches roughly the same 45%-of-canvas visual
  footprint regardless of true geographic size (Country Focus
  Normalisation Engine, Index 3.3), clamped to `[0.85, 26.0]`. A
  visibility constraint (Index 3.4I) reduces this scale further when a
  country has other significant, distant territory (e.g. the USA's
  Alaska) that would otherwise be pushed off-screen by a mainland-only
  zoom — this only ever reduces the candidate scale and runs generically
  for all countries.

The focus **animation** itself lives in `dashboard.tsx`:

- Entrance is a staggered 650ms sequence (separate opacity, blur, and
  transform/scale phases — see the `FOCUS_*` constants and
  `getCountryFocusImageStyle`/`getBackgroundFocusStyle`/
  `getDimOverlayStyle`). Return-to-world is a single uniform 450ms
  ease-out (Index 3.4), using CSS's direction-aware `transition` property
  rather than separate enter/exit animation logic.
- The focused country is rendered as a `<clipPath>`-masked copy of the
  same approved map image, not a filled/coloured shape — no gold fill, no
  border, no glow.
- `buildFocusClipPath` (Index 3.4C) cleans the raw registry geometry
  before building the clip: it drops zero-area degenerate rings (data
  artifacts in high-vertex countries like Russia/USA) and applies a
  Ramer-Douglas-Peucker simplification pass, memoised per selection, and
  never mutates the stored registry data.
- Selecting a new country while a previous return animation is still in
  flight is handled via `renderedCountry` state lagging `activeCountry`,
  plus an `activeCountryRef` guard (Index 3.4A) against a stale timeout
  clearing a just-selected country's render state.

---

## QA Mode

Gated by `SHOW_COUNTRY_QA` (currently `true`) in `dashboard.tsx` (Index
2.2, "Country Boundary QA Mode"). A reviewer-facing panel, distinct from
the "draw every boundary at once" debug overlay
(`SHOW_COUNTRY_BOUNDARIES`):

- Steps through `COUNTRY_REGISTRY` one country at a time (Previous / Next
  / Jump to ISO).
- Toggle fill, toggle outline, opacity slider, Reset View.
- Shows ISO2/ISO3, bounding box, vertex count, path length for the
  current country.
- "Flag for Review" records an in-session `CountryAdjustment` and logs the
  exact JSON to the console for a reviewer to hand-copy into
  `country-adjustments.json` — a static frontend has no filesystem write
  access, so this cannot and does not persist automatically.

---

## Other Dev/Debug Flags Currently in `dashboard.tsx`

All currently `true` (i.e. currently rendering in every build, including
production):

- `SHOW_CANVAS_CALIBRATION` (Index 1.9) — mouse-position readout tool for
  aligning hit-zone paths to the rendered image.
- `SHOW_COUNTRY_BOUNDARIES` (Index 2.1) — draws every country boundary at
  once (thin gold outline).
- `SHOW_SELECTION_DEBUG` (Index 3.0A) — fixed badge showing the active
  country on selection.

`showDebugLayerNumbers` (a `useState`/local const, not a module-level
flag) is currently hardcoded `false`.

---

## Country Focus Verification Log

Spot-checks of the Country Focus Engine's rendered output against the
Product Constitution's "lifted, not zoomed" requirement, recorded as they
happen so future sessions don't have to re-derive them.

**3.7 — Australia (Process Index 3.7, "Perfect Australia Operational
Focus").** Verified the generic, non-hardcoded Country Focus Registry
values already computed for Australia — no registry edit was made.
Verification used the running app (Playwright over a real, non-headless
Chromium under Xvfb), not static code reading, because the approved map's
"earth at night" palette is low-contrast enough that the lift is easy to
misjudge from a screenshot alone:

- `getScreenCTM()` on the focused `<image>` confirmed the composed
  transform matrix is exact (`1.6 × 4.007 = 6.4114` scale, matching
  translate values).
- `elementFromPoint()` at the intended screen centre returned the focused
  image element on top, as expected.
- A high-contrast proof render (dim overlay swapped to solid red)
  revealed a correctly shaped, scaled, and positioned Australia cutout.
- Pixel-level connected-component measurement of that cutout: **44.7% of
  viewport width**, against the ticket's ~45% target — mainland and
  Tasmania both rendered, reasonably centred.

Conclusion: Australia's current Focus Point (`{ x: 842.63, y: 574.91 }`,
the mainland ring's own centroid), Camera Target (`{ x: 500, y: 500 }`),
and Default Focus Scale (`4.007`) already satisfy the stated visual goal
via the existing generic algorithm. No per-country override was added -
doing so would have reversed the Index 3.4A decision to keep the registry
free of hardcoded per-country values, and the measured gap didn't justify
that trade-off.

---

## Current Development Workflow

Per `CLAUDE.md` (project instructions, checked into the repo):

- The Product Constitution is the highest authority. Engineering must
  never override product decisions; if implementation would conflict with
  it, stop, explain the conflict, and wait for approval.
- Per-task workflow: create a feature branch → implement → run
  `pnpm run build` → run a Constitution Compliance Check against the
  Product Constitution → commit → push → open a Pull Request → wait for
  merge approval.
- **Merge policy:** never merge directly into `main` unless explicitly
  instructed.

### Git Workflow / Commit Policy / Push Policy

- Work happens on a named feature branch (this document was produced on
  `feature/remove-night-map-for-rebuild`).
- Commits on this branch follow the Sub-Layer Indexing Convention (see
  `docs/INDEXING-CONVENTION.md`): major build stages are numbered Layers
  (`1`–`8`); within a layer, each granular change gets a stable sub-layer
  index (`1.1`, `1.2`, ... `2.1`, ...), assigned chronologically and only
  when the user says the exact phrase "New rule line". Numbering is not
  retroactive.
- Push to the current feature branch. **Never merge automatically** —
  every change waits for explicit merge approval, per the VenueGuard
  Merge Policy in `CLAUDE.md`.

### Codespaces Workflow

- `.nvmrc` pins Node `v24.18.0`.
- `artifacts/risk-assessments/vite.config.ts` requires `PORT` and
  `BASE_PATH` as environment variables (throws if either is missing) —
  supplied by the package's own `dev`/`serve` npm scripts
  (`PORT=5173 BASE_PATH=/ vite ...`), not by the shell or a `--host` CLI
  flag. The dev/preview server already binds `host: "0.0.0.0"` and
  `allowedHosts: true` unconditionally.
- `DEV-1` (`9ba77ce`, current branch HEAD) fixes Vite's HMR client for
  GitHub Codespaces specifically: Codespaces forwards the dev server
  through its own HTTPS edge proxy on a different host/port than the
  container's own `0.0.0.0:5173`, so HMR's websocket needs to be pointed
  at the forwarded `wss://<codespace-name>-<port>.<forwarding-domain>:443`
  address instead of its same-origin default. This is derived at runtime
  from Codespaces' own `CODESPACE_NAME` /
  `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` env vars (only when
  `CODESPACES === "true"`) — local, non-Codespaces dev is untouched.
- `replit.md` at the repo root is still the unpopulated project template
  (placeholder headings, describes a generic API-server/Postgres/Drizzle
  stack that does not reflect `artifacts/risk-assessments` specifically)
  — not yet written up for this project.

---

## Known Engineering Debt / Known Issues

- Four dev/QA-only flags (`SHOW_CANVAS_CALIBRATION`,
  `SHOW_COUNTRY_BOUNDARIES`, `SHOW_COUNTRY_QA`, `SHOW_SELECTION_DEBUG`)
  are hardcoded `true` in `dashboard.tsx`, so the calibration overlay, the
  gold country-boundary outline, the full QA panel, and the selection
  debug badge all currently render in every build, including whatever a
  real user would see. There is no environment/build-mode gate on any of
  them yet.
- The QA Mode "Flag for Review" workflow only logs JSON to the browser
  console; there is no automated or UI-driven path from a flagged country
  into `country-adjustments.json`.
- `artifacts/api-server`, `lib/db`, `lib/api-spec`, `lib/api-client-react`,
  and `artifacts/mockup-sandbox` are scaffolded in the workspace but not
  wired to `artifacts/risk-assessments` or any feature described in this
  document.
- `replit.md` has not been filled in for this project.
- `docs/INDEXING-CONVENTION.md`'s own Index table only records `1.3`–
  `1.7` (the earlier night-map era); it has not been kept up to date
  through the `2.x`/`3.x` work, even though individual commits and code
  comments continued using the same index numbers.

---

## Future Roadmap

Per `docs/PROJECT_CONTEXT.md` ("Current Sprint" — build the Operations
Experience): Operational Brief, Operations Centre, Operational Canvas,
Operational Plan, Operational Report, Ask Intelligence, Operational
Route.

Within the Layer Registry specifically, layers 5 (Breathing Markers) and
6 (Debug Layer Numbers) are declared but not yet implemented, and layer 4
(Country Intelligence) currently only carries the boundary-debug and QA
overlays rather than real operational intelligence content — both are
named/reserved slots for that future work, not yet built.
