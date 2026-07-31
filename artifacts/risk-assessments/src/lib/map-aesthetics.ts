// Map & Country Focus Aesthetics Engine - centralises the Operational
// Canvas's visual identity (ocean background, grid/boundary treatment,
// accent border colour) in one place instead of scattered inline values
// across dashboard.tsx and index.css. Covers the map and Country Focus
// cutout only - the rest of the app's UI (sign-in, brief, QA chrome) is
// out of scope here and gets its own aesthetics pass later.
//
// Scaffolded as infrastructure with every value reproducing VenueGuard's
// existing look exactly, then updated one deliberate step at a time as
// the aesthetic pass proceeds, rather than by hunting through
// dashboard.tsx/index.css. Grid visibility (Index 4.5) is the first
// value actually changed from its original default.

// Country Boundary Debug Mode's all-countries grid (Index 2.1). Was a
// verification aid for checking every country's outline against the base
// map during registry/split work - never meant to ship visible. Now off
// as the first item of the Layer 4 aesthetic pass.
export const MAP_GRID_VISIBLE = false;

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
// (same clip path/transform as the image). Switched on as the direct
// answer to removing the old FOCUS_SCALE_MAX ceiling in
// country-focus-registry.ts: once a country's own true fit-to-block
// scale is honoured with no cap, a genuinely tiny territory (Aruba,
// Monaco, Nauru - anything needing several hundred to several thousand
// times zoom) is viewing far less than a single pixel of the source map
// image, so its interior renders as a flat, textureless block - crisp
// edges, but no content to show inside them. The rim-light is what keeps
// that reading as a deliberate, premium "this is the whole of a very
// small place" presentation instead of a plain blank rectangle: a
// visible border was never optional once uncapped scale could produce
// zero interior content, only deferred until this was the actual issue
// to solve, rather than switched on speculatively.
export const MAP_FOCUS_BORDER_VISIBLE = true;
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
