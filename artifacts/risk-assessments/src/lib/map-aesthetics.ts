// Map & Country Focus Aesthetics Engine - centralises the Operational
// Canvas's visual identity (ocean background, grid/boundary treatment,
// accent border colour) in one place instead of scattered inline values
// across dashboard.tsx and index.css. Covers the map and Country Focus
// cutout only - the rest of the app's UI (sign-in, brief, QA chrome) is
// out of scope here and gets its own aesthetics pass later.
//
// This is infrastructure only: every value below currently reproduces
// VenueGuard's existing look exactly (same grid visibility, same accent
// colour, same flat ocean background, no border on the focus cutout).
// Nothing renders differently yet - changing a value here is how the
// actual aesthetic pass gets applied later, one deliberate step at a
// time, rather than by hunting through dashboard.tsx/index.css.

// Country Boundary Debug Mode's all-countries grid (Index 2.1). Unchanged
// (still visible) - flip to false to hide it as part of the aesthetic pass.
export const MAP_GRID_VISIBLE = true;

// Shared accent colour, as an rgb() triplet so callers can vary opacity
// per use (rgb(var(--x) / alpha)). Currently VenueGuard's existing gold
// (255, 196, 87) - change this one value to re-theme the grid stroke and
// (once enabled) the focus rim-light together.
export const MAP_ACCENT_RGB = "255, 196, 87";

// Ocean background behind the base map. Currently a flat colour (both
// gradient stops equal) matching the existing look - give the two stops
// different values to introduce a vignette.
export const MAP_OCEAN_CENTRE = "#0b0f14";
export const MAP_OCEAN_EDGE = "#0b0f14";

// Focused-country rim-light: an outline traced on the exact cutout shape
// (same clip path/transform as the image), off by default since
// VenueGuard's Country Focus Engine (Index 3.3) was explicitly built with
// "no border/outline/glow". Flip to true to turn it on.
export const MAP_FOCUS_BORDER_VISIBLE = false;
export const MAP_FOCUS_BORDER_WIDTH = 1.5;

// Border edge crispness. buildFocusClipPath (dashboard.tsx) only needs to
// thin a ring's points at all to protect performance on the handful of
// genuinely huge coastlines - measured directly off the real registry
// data: Russia's mainland ring alone is ~4,894 points, Canada's ~3,317,
// USA's two largest ~1,988/~1,618. Every other country's largest ring,
// however small and however far it has to zoom to fill the Operational
// Focus Block, tops out far below that (Indonesia's largest is ~363,
// Canada's own second-largest is ~299) - nowhere near a performance
// concern, so there is no reason to simplify them at all. A ring at or
// under this point count renders at full, unsimplified fidelity; only
// rings above it fall back to distance-based thinning (still scaled by
// the country's own zoom - see FOCUS_CLIP_SIMPLIFY_EPSILON), which is
// exactly the world's biggest countries, rendered at close to 1x zoom,
// where that thinning was always imperceptible in the first place.
export const MAP_BORDER_FULL_DETAIL_MAX_POINTS = 600;
