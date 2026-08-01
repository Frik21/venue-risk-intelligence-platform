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
//
// "Aurora Glass" (chosen directly from a 7-concept pitch) - colour and
// width both carry that identity now, not the shared gold MAP_ACCENT_RGB
// (which stays gold, still used by the debug grid). No blur/glow filter
// on this stroke deliberately - vector-effect: non-scaling-stroke already
// keeps it a crisp, constant screen width at any zoom (verified to
// 3000x), and a Gaussian-blur glow filter on the same scaled element
// would reintroduce the drop-shadow-at-scale risk documented below for
// the fill's own gradient. A saturated, bright rim colour carries the
// "neon" read without needing an actual blur. Thinned again, 0.9 to 0.6,
// and recoloured from a pale cyan to a deep, saturated navy blue - per
// direct feedback ("thinner neon dark navy blue") after the fill itself
// moved to the richer "Frozen Sapphire" palette below.
export const MAP_FOCUS_BORDER_VISIBLE = true;
export const MAP_FOCUS_BORDER_WIDTH = 0.6;
export const MAP_FOCUS_BORDER_RGB = "30, 64, 255";

// Selected-country paint: a colour wash across the entire cutout shape
// (same clip path/transform as the image and rim-light above), not just
// its edge - per explicit direction ("I want the entire country to be
// painted over" when you click it). "Aurora Glass", refined to "Frozen
// Sapphire" (chosen from a follow-up icy-blue pitch, "I want to capture
// the colour of their eyes" - White Walker eyes, Game of Thrones): a
// five-stop diagonal gradient, vivid cyan through sapphire to a genuinely
// dark corner, richer and more saturated than the first pass's washed-out
// pale blues ("I need it much more richer"). A gradient has none of
// feTurbulence's rasterization cost, so - unlike the papermache texture
// this replaced - it needs no pattern/scale trick and can sit directly
// on the scaled fill path.
export const MAP_FOCUS_FILL_VISIBLE = true;
export const MAP_FOCUS_FILL_GRADIENT_STOPS: { offset: string; color: string }[] = [
  { offset: "0%", color: "#3fd8ff" },
  { offset: "22%", color: "#0fa0dc" },
  { offset: "48%", color: "#0a68ac" },
  { offset: "75%", color: "#0a3468" },
  { offset: "100%", color: "#020815" },
];

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

// Approved Colour Treatment (Index 4.x) - two independent pieces, per an
// exact colour specification with hex targets, verified numerically
// against the real image (Python/PIL, pixel-sampled) before either was
// written into the app:
//
// 1. Land colour mask: the approved base map image (world-map-v17.png)
//    does not contain a land/ocean colour signal to grade - verified
//    directly by sampling deep-interior land points across seven
//    continents (central USA, China, India, Sahara, Amazon, Siberia,
//    Australian outback): every one of them is the same near-black navy
//    as open ocean. There is nothing in the pixels to select "land" from
//    with a filter. So land colour comes from the country vector
//    geometry the app already loads for hit-zones (OPERATIONAL_SELECTABLE_REGIONS)
//    - the exact same shapes, rendered once as a flat, restrained fill,
//    nothing else. An approved exception to "no new visual layer",
//    granted specifically because the alternative (a filter) cannot
//    physically produce this requirement from this asset.
// 2. A recolour filter for the base map image's own coastline/border/
//    city-light pixels, which DO have a distinguishable luminance
//    signature (verified via histogram) - a filter can select and
//    recolour those without touching land/ocean, which stays exactly as
//    it is today ("ocean remains the existing approved map background").
export const SHOW_LAND_COLOUR_MASK = true;
export const MAP_LAND_MASK_RGB = "38, 50, 64"; // #263240
export const MAP_LAND_MASK_OPACITY = 0.58;

export const MAP_COAST_RECOLOR_RGB = "91, 127, 163"; // #5B7FA3
export const MAP_BORDER_RECOLOR_RGB = "64, 86, 111"; // #40566F
export const MAP_CITY_CORE_RECOLOR_RGB = "255, 214, 122"; // #FFD67A
export const MAP_CITY_HALO_RECOLOR_RGB = "217, 169, 78"; // #D9A94E
