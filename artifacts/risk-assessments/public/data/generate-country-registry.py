# One-time offline generator for src/lib/country-registry.ts - not part of
# the app build or runtime, only re-run by hand if operational-country-
# borders.json itself changes. Run from this directory
# (`python3 generate-country-registry.py`).
#
# Index 2.1: converts the real Natural Earth-derived country border
# geometry already used by this project (operational-country-borders.json)
# into VenueGuard's own internal Country Registry - a plain TS array of
# {id, iso2, iso3, name, svgPath, boundingBox}, pre-projected into the
# full square 1000x1000 source-image space (Index 2.2B - matches
# world-map-v17.png's own 2048x2048 square 1:1, no crop assumption baked
# in) and pre-simplified. No GeoJSON, no projection math, ships to the
# browser - it's an import-time-only format, per the ticket's own
# "GeoJSON is an import format only" rule.
#
# ISO 3166-1 numeric->alpha/name metadata isn't present in the borders
# file itself (every feature's `properties` is empty; only a numeric
# `id` exists) - reproduced here from the public ISO 3166-1 standard
# rather than invented, since no bundled lookup package was available in
# this offline sandbox. Any id missing from ISO_NUMERIC (or from the
# borders file's own occasional missing `id`) is logged as skipped/
# requiring manual review rather than guessed.
import json

import os

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BORDERS_PATH = os.path.join(_SCRIPT_DIR, "operational-country-borders.json")
OUT_TS_PATH = os.path.join(_SCRIPT_DIR, "..", "..", "src", "lib", "country-registry.ts")
OUT_REPORT_PATH = os.path.join(_SCRIPT_DIR, "country-registry-report.txt")

# Matches dashboard.tsx's own historical NIGHT_MAP_BOUNDS-era seam choice
# (Index 1.3-1.9 commentary, and generate-world-map-v5.mjs which rendered
# the approved world-map-v17.png): a seam at 191.1deg (=-168.9deg) is the
# only window that keeps both Russia's and Alaska's mainlands whole - it
# sits in the narrow gap between them, not at the raw +-180deg dateline.
SEAM = 191.1
LEFT_EDGE = SEAM - 360  # -168.9
MERCATOR_LAT_LIMIT = 85.05112877980659

# world-map-v17.png is a square (2048x2048) standard Web Mercator render,
# clamped to +-MERCATOR_LAT_LIMIT over its full height - i.e. no unused
# polar margin. Index 2.1 projected this into a 1000x500 space assuming a
# fixed 2:1 crop of that square image (the middle 50% of its height), to
# match the Operational Canvas's existing hit-zone/calibration viewBox
# convention. That assumption broke (Index 2.2A) because the canvas
# container is `width:100%; height:100vh` - it takes on the live browser
# window's aspect ratio, not a fixed 2:1 - while the base image is
# rendered with `object-fit:cover`, whose true visible crop fraction is
# `1/aspectRatio` and therefore changes on every resize. No single build
# time constant can be correct for every runtime aspect ratio.
#
# Index 2.2B fixes this by not cropping at all here: the registry is
# generated in the FULL square source-image space (1000x1000, matching
# the image's own 2048x2048 square 1:1), with no crop assumption baked
# in. The consuming SVG overlays use viewBox="0 0 1000 1000" with
# preserveAspectRatio="xMidYMid slice" - the SVG-native equivalent of
# object-fit:cover - so the boundary overlay and the base image are
# scaled/cropped by the exact same algorithm at render time, for any
# live viewport aspect ratio, with no JS resize handling needed.


def mercator_y_fraction(lat_deg):
    import math

    lat_rad = math.radians(lat_deg)
    return 0.5 - math.asinh(math.tan(lat_rad)) / (2 * math.pi)


def project(lng, lat):
    x_frac = (lng - LEFT_EDGE) / 360
    clamped_lat = max(-MERCATOR_LAT_LIMIT, min(MERCATOR_LAT_LIMIT, lat))
    y_frac = mercator_y_fraction(clamped_lat)
    return x_frac * 1000, y_frac * 1000


# Antimeridian unwrap/align - ported directly from dashboard.tsx's own
# unwrapRingLongitudes/alignCrossingRings (removed from the app when the
# old Leaflet CountrySelect was deleted, Index "remove legacy map", but
# the logic itself is reused here unchanged since it's still correct).
def unwrap_ring_longitudes(ring):
    offset = 0.0
    crossed = False
    points = [list(ring[0])]
    for i in range(1, len(ring)):
        delta = ring[i][0] - ring[i - 1][0]
        if delta > 180:
            offset -= 360
            crossed = True
        elif delta < -180:
            offset += 360
            crossed = True
        points.append([ring[i][0] + offset, ring[i][1]])
    return points, crossed


def ring_area(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def align_crossing_rings(rings):
    largest = max(rings, key=lambda r: ring_area(r[0]))
    reference_lng = largest[0][0][0]
    out = []
    for points, crossed in rings:
        if not crossed:
            out.append(points)
            continue
        shift = round((reference_lng - points[0][0]) / 360) * 360
        out.append([[lng + shift, lat] for lng, lat in points] if shift else points)
    return out


# unwrap_ring_longitudes/align_crossing_rings only handle a ring that
# itself crosses the dateline (a jump >180deg between two of its OWN
# consecutive points). A small ring that never crosses within itself -
# e.g. a lone Aleutian islet whose raw coordinates are all stored as
# -179.5ish rather than the equivalent +180.5ish - passes through both
# functions completely untouched, at its original raw value. That raw
# value can still fall outside this project's own custom seam window
# ([LEFT_EDGE, LEFT_EDGE+360], i.e. [-168.9, 191.1]) even though it's a
# geographically valid, non-crossing position - producing a whole ring
# placed at the wrong (opposite) side of the canvas once projected.
# Confirmed on USA: several Aleutian-adjacent rings landed near x=0
# instead of their real position near x=950+, stretching the country's
# combined path across nearly the entire canvas width. Fixed by shifting
# any ring whose own midpoint longitude falls outside the window by
# whole multiples of 360deg until it's inside - independent of, and in
# addition to, the crossing-specific handling above.
def normalize_ring_to_window(points):
    lngs = [p[0] for p in points]
    mid = (min(lngs) + max(lngs)) / 2
    shift = 0.0
    while mid + shift < LEFT_EDGE:
        shift += 360
    while mid + shift > LEFT_EDGE + 360:
        shift -= 360
    if shift == 0:
        return points
    return [[lng + shift, lat] for lng, lat in points]


def unwrap_geometry(geometry):
    gtype = geometry["type"]
    if gtype == "Polygon":
        unwrapped = [unwrap_ring_longitudes(ring) for ring in geometry["coordinates"]]
        rings = align_crossing_rings(unwrapped)
        return [[normalize_ring_to_window(ring) for ring in rings]]
    if gtype == "MultiPolygon":
        polys_unwrapped = [[unwrap_ring_longitudes(ring) for ring in poly] for poly in geometry["coordinates"]]
        flat = [r for poly in polys_unwrapped for r in poly]
        aligned = align_crossing_rings(flat)
        polygons = []
        cursor = 0
        for poly in polys_unwrapped:
            rings = [aligned[cursor + i] for i in range(len(poly))]
            polygons.append([normalize_ring_to_window(ring) for ring in rings])
            cursor += len(poly)
        return polygons
    return []


# Standard Douglas-Peucker simplification, run in the already-projected
# 1000x1000 space (so tolerance is a fixed, meaningful pixel-ish distance
# regardless of a country's real-world size), to keep the generated file
# a reasonable size - country borders are only ever used for invisible
# hit-testing/masking (never displayed at full fidelity), so sub-pixel
# coastline detail on large, high-point-count rings buys nothing. A first
# pass at 1.5px incorrectly collapsed small nations (Malta, Singapore,
# Monaco...) below the 3-point minimum a valid ring needs, dropping them
# entirely - real countries, not noise. Fixed by only simplifying rings
# large enough that trimming them is actually worthwhile; small rings are
# kept exactly as sourced.
SIMPLIFY_TOLERANCE_PX = 0.5
SIMPLIFY_MIN_RING_POINTS = 30


def perpendicular_distance(pt, start, end):
    (x, y), (x1, y1), (x2, y2) = pt, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
    px, py = x1 + t * dx, y1 + t * dy
    return ((x - px) ** 2 + (y - py) ** 2) ** 0.5


def simplify_open_polyline(points, tolerance):
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    max_dist = -1.0
    max_index = 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], start, end)
        if d > max_dist:
            max_dist = d
            max_index = i
    if max_dist > tolerance:
        left = simplify_open_polyline(points[: max_index + 1], tolerance)
        right = simplify_open_polyline(points[max_index:], tolerance)
        return left[:-1] + right
    return [start, end]


def simplify_rdp(points, tolerance):
    # Country border rings are closed (first point == last, or very
    # close) - running textbook open-polyline RDP directly on a closed
    # ring uses that near-identical first/last point as the anchor line
    # for the very first split. That anchor is degenerate (near-zero
    # length), so perpendicular-distance math against it is numerically
    # unstable and can pick a wildly wrong split point - this is exactly
    # what produced a spurious straight-line artifact cutting across
    # Canada's coastline (a real jump of ~77 units in the simplified
    # output that doesn't exist anywhere in the raw, unsimplified
    # projected data - confirmed by direct comparison). Fixed by first
    # splitting the closed ring into two open polylines at the point
    # farthest from the start (a well-separated, stable anchor pair),
    # simplifying each half with the standard algorithm, then rejoining.
    if len(points) < 4:
        return points
    start = points[0]
    farthest_index = max(
        range(1, len(points) - 1),
        key=lambda i: (points[i][0] - start[0]) ** 2 + (points[i][1] - start[1]) ** 2,
    )
    first_half = simplify_open_polyline(points[: farthest_index + 1], tolerance)
    second_half = simplify_open_polyline(points[farthest_index:], tolerance)
    return first_half[:-1] + second_half
    return [start, end]


# ISO 3166-1 numeric -> (alpha-2, alpha-3, name), reproduced from the
# public ISO 3166-1 standard for every numeric id actually present in
# operational-country-borders.json (235 of them) - metadata only, not
# geometry; the borders file carries no name/iso fields of its own.
ISO_NUMERIC = {
    "004": ("AF", "AFG", "Afghanistan"), "008": ("AL", "ALB", "Albania"), "010": ("AQ", "ATA", "Antarctica"),
    "012": ("DZ", "DZA", "Algeria"), "016": ("AS", "ASM", "American Samoa"), "020": ("AD", "AND", "Andorra"),
    "024": ("AO", "AGO", "Angola"), "028": ("AG", "ATG", "Antigua and Barbuda"), "031": ("AZ", "AZE", "Azerbaijan"),
    "032": ("AR", "ARG", "Argentina"), "036": ("AU", "AUS", "Australia"), "040": ("AT", "AUT", "Austria"),
    "044": ("BS", "BHS", "Bahamas"), "048": ("BH", "BHR", "Bahrain"), "050": ("BD", "BGD", "Bangladesh"),
    "051": ("AM", "ARM", "Armenia"), "052": ("BB", "BRB", "Barbados"), "056": ("BE", "BEL", "Belgium"),
    "060": ("BM", "BMU", "Bermuda"), "064": ("BT", "BTN", "Bhutan"), "068": ("BO", "BOL", "Bolivia"),
    "070": ("BA", "BIH", "Bosnia and Herzegovina"), "072": ("BW", "BWA", "Botswana"), "076": ("BR", "BRA", "Brazil"),
    "084": ("BZ", "BLZ", "Belize"), "086": ("IO", "IOT", "British Indian Ocean Territory"),
    "090": ("SB", "SLB", "Solomon Islands"), "092": ("VG", "VGB", "British Virgin Islands"),
    "096": ("BN", "BRN", "Brunei Darussalam"), "100": ("BG", "BGR", "Bulgaria"), "104": ("MM", "MMR", "Myanmar"),
    "108": ("BI", "BDI", "Burundi"), "112": ("BY", "BLR", "Belarus"), "116": ("KH", "KHM", "Cambodia"),
    "120": ("CM", "CMR", "Cameroon"), "124": ("CA", "CAN", "Canada"), "132": ("CV", "CPV", "Cabo Verde"),
    "136": ("KY", "CYM", "Cayman Islands"), "140": ("CF", "CAF", "Central African Republic"),
    "144": ("LK", "LKA", "Sri Lanka"), "148": ("TD", "TCD", "Chad"), "152": ("CL", "CHL", "Chile"),
    "156": ("CN", "CHN", "China"), "158": ("TW", "TWN", "Taiwan"), "170": ("CO", "COL", "Colombia"),
    "174": ("KM", "COM", "Comoros"), "178": ("CG", "COG", "Congo"),
    "180": ("CD", "COD", "Congo, Democratic Republic of the"), "184": ("CK", "COK", "Cook Islands"),
    "188": ("CR", "CRI", "Costa Rica"), "191": ("HR", "HRV", "Croatia"), "192": ("CU", "CUB", "Cuba"),
    "196": ("CY", "CYP", "Cyprus"), "203": ("CZ", "CZE", "Czechia"), "204": ("BJ", "BEN", "Benin"),
    "208": ("DK", "DNK", "Denmark"), "212": ("DM", "DMA", "Dominica"), "214": ("DO", "DOM", "Dominican Republic"),
    "218": ("EC", "ECU", "Ecuador"), "222": ("SV", "SLV", "El Salvador"), "226": ("GQ", "GNQ", "Equatorial Guinea"),
    "231": ("ET", "ETH", "Ethiopia"), "232": ("ER", "ERI", "Eritrea"), "233": ("EE", "EST", "Estonia"),
    "234": ("FO", "FRO", "Faroe Islands"), "238": ("FK", "FLK", "Falkland Islands"),
    "239": ("GS", "SGS", "South Georgia and the South Sandwich Islands"), "242": ("FJ", "FJI", "Fiji"),
    "246": ("FI", "FIN", "Finland"), "248": ("AX", "ALA", "Aland Islands"), "250": ("FR", "FRA", "France"),
    "258": ("PF", "PYF", "French Polynesia"), "260": ("TF", "ATF", "French Southern Territories"),
    "262": ("DJ", "DJI", "Djibouti"), "266": ("GA", "GAB", "Gabon"), "268": ("GE", "GEO", "Georgia"),
    "270": ("GM", "GMB", "Gambia"), "275": ("PS", "PSE", "Palestine, State of"), "276": ("DE", "DEU", "Germany"),
    "288": ("GH", "GHA", "Ghana"), "296": ("KI", "KIR", "Kiribati"), "300": ("GR", "GRC", "Greece"),
    "304": ("GL", "GRL", "Greenland"), "308": ("GD", "GRD", "Grenada"), "316": ("GU", "GUM", "Guam"),
    "320": ("GT", "GTM", "Guatemala"), "324": ("GN", "GIN", "Guinea"), "328": ("GY", "GUY", "Guyana"),
    "332": ("HT", "HTI", "Haiti"), "334": ("HM", "HMD", "Heard Island and McDonald Islands"),
    "336": ("VA", "VAT", "Holy See"), "340": ("HN", "HND", "Honduras"), "344": ("HK", "HKG", "Hong Kong"),
    "348": ("HU", "HUN", "Hungary"), "352": ("IS", "ISL", "Iceland"), "356": ("IN", "IND", "India"),
    "360": ("ID", "IDN", "Indonesia"), "364": ("IR", "IRN", "Iran"), "368": ("IQ", "IRQ", "Iraq"),
    "372": ("IE", "IRL", "Ireland"), "376": ("IL", "ISR", "Israel"), "380": ("IT", "ITA", "Italy"),
    "384": ("CI", "CIV", "Cote d'Ivoire"), "388": ("JM", "JAM", "Jamaica"), "392": ("JP", "JPN", "Japan"),
    "398": ("KZ", "KAZ", "Kazakhstan"), "400": ("JO", "JOR", "Jordan"), "404": ("KE", "KEN", "Kenya"),
    "408": ("KP", "PRK", "North Korea"), "410": ("KR", "KOR", "South Korea"), "414": ("KW", "KWT", "Kuwait"),
    "417": ("KG", "KGZ", "Kyrgyzstan"), "418": ("LA", "LAO", "Lao People's Democratic Republic"),
    "422": ("LB", "LBN", "Lebanon"), "426": ("LS", "LSO", "Lesotho"), "428": ("LV", "LVA", "Latvia"),
    "430": ("LR", "LBR", "Liberia"), "434": ("LY", "LBY", "Libya"), "438": ("LI", "LIE", "Liechtenstein"),
    "440": ("LT", "LTU", "Lithuania"), "442": ("LU", "LUX", "Luxembourg"), "446": ("MO", "MAC", "Macao"),
    "450": ("MG", "MDG", "Madagascar"), "454": ("MW", "MWI", "Malawi"), "458": ("MY", "MYS", "Malaysia"),
    "462": ("MV", "MDV", "Maldives"), "466": ("ML", "MLI", "Mali"), "470": ("MT", "MLT", "Malta"),
    "478": ("MR", "MRT", "Mauritania"), "480": ("MU", "MUS", "Mauritius"), "484": ("MX", "MEX", "Mexico"),
    "492": ("MC", "MCO", "Monaco"), "496": ("MN", "MNG", "Mongolia"), "498": ("MD", "MDA", "Moldova"),
    "499": ("ME", "MNE", "Montenegro"), "500": ("MS", "MSR", "Montserrat"), "504": ("MA", "MAR", "Morocco"),
    "508": ("MZ", "MOZ", "Mozambique"), "512": ("OM", "OMN", "Oman"), "516": ("NA", "NAM", "Namibia"),
    "520": ("NR", "NRU", "Nauru"), "524": ("NP", "NPL", "Nepal"), "528": ("NL", "NLD", "Netherlands"),
    "531": ("CW", "CUW", "Curacao"), "533": ("AW", "ABW", "Aruba"), "534": ("SX", "SXM", "Sint Maarten"),
    "540": ("NC", "NCL", "New Caledonia"), "548": ("VU", "VUT", "Vanuatu"), "554": ("NZ", "NZL", "New Zealand"),
    "558": ("NI", "NIC", "Nicaragua"), "562": ("NE", "NER", "Niger"), "566": ("NG", "NGA", "Nigeria"),
    "570": ("NU", "NIU", "Niue"), "574": ("NF", "NFK", "Norfolk Island"), "578": ("NO", "NOR", "Norway"),
    "580": ("MP", "MNP", "Northern Mariana Islands"), "583": ("FM", "FSM", "Micronesia"),
    "584": ("MH", "MHL", "Marshall Islands"), "585": ("PW", "PLW", "Palau"), "586": ("PK", "PAK", "Pakistan"),
    "591": ("PA", "PAN", "Panama"), "598": ("PG", "PNG", "Papua New Guinea"), "600": ("PY", "PRY", "Paraguay"),
    "604": ("PE", "PER", "Peru"), "608": ("PH", "PHL", "Philippines"), "612": ("PN", "PCN", "Pitcairn"),
    "616": ("PL", "POL", "Poland"), "620": ("PT", "PRT", "Portugal"), "624": ("GW", "GNB", "Guinea-Bissau"),
    "626": ("TL", "TLS", "Timor-Leste"), "630": ("PR", "PRI", "Puerto Rico"), "634": ("QA", "QAT", "Qatar"),
    "642": ("RO", "ROU", "Romania"), "643": ("RU", "RUS", "Russian Federation"), "646": ("RW", "RWA", "Rwanda"),
    "652": ("BL", "BLM", "Saint Barthelemy"), "654": ("SH", "SHN", "Saint Helena"),
    "659": ("KN", "KNA", "Saint Kitts and Nevis"), "660": ("AI", "AIA", "Anguilla"),
    "662": ("LC", "LCA", "Saint Lucia"), "663": ("MF", "MAF", "Saint Martin"),
    "666": ("PM", "SPM", "Saint Pierre and Miquelon"), "670": ("VC", "VCT", "Saint Vincent and the Grenadines"),
    "674": ("SM", "SMR", "San Marino"), "678": ("ST", "STP", "Sao Tome and Principe"),
    "682": ("SA", "SAU", "Saudi Arabia"), "686": ("SN", "SEN", "Senegal"), "688": ("RS", "SRB", "Serbia"),
    "690": ("SC", "SYC", "Seychelles"), "694": ("SL", "SLE", "Sierra Leone"), "702": ("SG", "SGP", "Singapore"),
    "703": ("SK", "SVK", "Slovakia"), "704": ("VN", "VNM", "Viet Nam"), "705": ("SI", "SVN", "Slovenia"),
    "706": ("SO", "SOM", "Somalia"), "710": ("ZA", "ZAF", "South Africa"), "716": ("ZW", "ZWE", "Zimbabwe"),
    "724": ("ES", "ESP", "Spain"), "728": ("SS", "SSD", "South Sudan"), "729": ("SD", "SDN", "Sudan"),
    "732": ("EH", "ESH", "Western Sahara"), "740": ("SR", "SUR", "Suriname"), "748": ("SZ", "SWZ", "Eswatini"),
    "752": ("SE", "SWE", "Sweden"), "756": ("CH", "CHE", "Switzerland"), "760": ("SY", "SYR", "Syrian Arab Republic"),
    "762": ("TJ", "TJK", "Tajikistan"), "764": ("TH", "THA", "Thailand"), "768": ("TG", "TGO", "Togo"),
    "776": ("TO", "TON", "Tonga"), "780": ("TT", "TTO", "Trinidad and Tobago"),
    "784": ("AE", "ARE", "United Arab Emirates"), "788": ("TN", "TUN", "Tunisia"), "792": ("TR", "TUR", "Turkey"),
    "795": ("TM", "TKM", "Turkmenistan"), "796": ("TC", "TCA", "Turks and Caicos Islands"),
    "800": ("UG", "UGA", "Uganda"), "804": ("UA", "UKR", "Ukraine"), "807": ("MK", "MKD", "North Macedonia"),
    "818": ("EG", "EGY", "Egypt"), "826": ("GB", "GBR", "United Kingdom"), "831": ("GG", "GGY", "Guernsey"),
    "832": ("JE", "JEY", "Jersey"), "833": ("IM", "IMN", "Isle of Man"),
    "834": ("TZ", "TZA", "Tanzania, United Republic of"), "840": ("US", "USA", "United States of America"),
    "850": ("VI", "VIR", "Virgin Islands (U.S.)"), "854": ("BF", "BFA", "Burkina Faso"),
    "858": ("UY", "URY", "Uruguay"), "860": ("UZ", "UZB", "Uzbekistan"), "862": ("VE", "VEN", "Venezuela"),
    "876": ("WF", "WLF", "Wallis and Futuna"), "882": ("WS", "WSM", "Samoa"), "887": ("YE", "YEM", "Yemen"),
    "894": ("ZM", "ZMB", "Zambia"),
}


def max_consecutive_distance(points):
    max_d = 0.0
    for i in range(1, len(points)):
        x1, y1 = points[i - 1]
        x2, y2 = points[i]
        d = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        if d > max_d:
            max_d = d
    return max_d


# Safety net, not a primary fix: on rare complex rings (confirmed on
# Canada's mainland, a real jump the RDP output introduced that does not
# exist anywhere in the raw projected data), simplification can still
# produce a spurious long straight segment. Rather than keep chasing the
# exact algorithmic edge case, any simplified ring whose worst jump
# exceeds what the RAW data itself ever has (plus margin) is rejected in
# favour of the unsimplified ring - guarantees visual correctness at the
# cost of file size on the handful of rings this affects.
JUMP_SAFETY_MARGIN = 10.0


def build_svg_path(polygons):
    subpaths = []
    for polygon in polygons:
        for ring in polygon:
            projected = [tuple(project(lng, lat)) for lng, lat in ring]
            if len(projected) >= SIMPLIFY_MIN_RING_POINTS:
                simplified = simplify_rdp(projected, SIMPLIFY_TOLERANCE_PX)
                raw_max_jump = max_consecutive_distance(projected)
                simplified_max_jump = max_consecutive_distance(simplified)
                if simplified_max_jump <= raw_max_jump + JUMP_SAFETY_MARGIN:
                    projected = simplified
            if len(projected) < 3:
                continue
            parts = [f"M {projected[0][0]:.1f} {projected[0][1]:.1f}"]
            parts += [f"L {x:.1f} {y:.1f}" for x, y in projected[1:]]
            parts.append("Z")
            subpaths.append(" ".join(parts))
    return " ".join(subpaths)


def bounding_box(polygons):
    xs, ys = [], []
    for polygon in polygons:
        for ring in polygon:
            for lng, lat in ring:
                x, y = project(lng, lat)
                xs.append(x)
                ys.append(y)
    return {"minX": round(min(xs), 1), "minY": round(min(ys), 1), "maxX": round(max(xs), 1), "maxY": round(max(ys), 1)}


def geometry_point_count(geometry):
    gtype = geometry["type"]
    polys = geometry["coordinates"] if gtype == "MultiPolygon" else [geometry["coordinates"]]
    return sum(len(ring) for poly in polys for ring in poly)


def main():
    with open(BORDERS_PATH) as f:
        data = json.load(f)

    # A handful of ids appear more than once in the source data (e.g. "036"
    # has both the real 1799-point Australia MultiPolygon and an unrelated
    # 5-point degenerate stub sharing the same id) - keep only the feature
    # with the most total points per id, since that's reliably the real,
    # complete geometry rather than a data artifact.
    features_by_id = {}
    duplicate_ids_dropped = []
    for feature in data["features"]:
        fid = feature.get("id")
        if fid is None:
            continue
        existing = features_by_id.get(fid)
        if existing is None or geometry_point_count(feature["geometry"]) > geometry_point_count(existing["geometry"]):
            if existing is not None:
                duplicate_ids_dropped.append(fid)
            features_by_id[fid] = feature
        else:
            duplicate_ids_dropped.append(fid)

    no_id_count = sum(1 for f in data["features"] if f.get("id") is None)

    registry = []
    manual_adjustment = []
    total = len(data["features"])

    for fid, feature in features_by_id.items():
        meta = ISO_NUMERIC.get(fid)
        if meta is None:
            manual_adjustment.append(fid)
            continue
        iso2, iso3, name = meta
        polygons = unwrap_geometry(feature["geometry"])
        if not polygons:
            manual_adjustment.append(f"{fid} {name}")
            continue
        svg_path = build_svg_path(polygons)
        if not svg_path:
            manual_adjustment.append(f"{fid} {name}")
            continue
        registry.append(
            {
                "id": fid,
                "iso2": iso2,
                "iso3": iso3,
                "name": name,
                "svgPath": svg_path,
                "boundingBox": bounding_box(polygons),
            }
        )

    registry.sort(key=lambda c: c["name"])

    ts_lines = [
        "// GENERATED FILE - do not edit by hand. Regenerate via",
        "// public/data/generate-country-registry.py.",
        "//",
        "// VenueGuard's own internal Country Registry (Index 2.1, reprojected",
        "// Index 2.2B) - converted offline from the real Natural Earth-derived",
        "// operational-country-borders.json, pre-projected into the full square",
        "// 1000x1000 source-image space (matching world-map-v17.png's own",
        "// 2048x2048 square 1:1, no crop assumption baked in) and pre-",
        "// simplified. No GeoJSON, no projection math, ships to the browser -",
        "// these paths are NOT for display, only for country selection/",
        "// masking/isolation/intelligence-layer use. Consuming SVG overlays",
        "// must use viewBox=\"0 0 1000 1000\" preserveAspectRatio=\"xMidYMid",
        "// slice\" to stay aligned with the base image's object-fit:cover.",
        "export interface CountryDefinition {",
        "  id: string;",
        "  iso2: string;",
        "  iso3: string;",
        "  name: string;",
        "  svgPath: string;",
        "  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };",
        "}",
        "",
        "export const COUNTRY_REGISTRY: CountryDefinition[] = [",
    ]
    for c in registry:
        bb = c["boundingBox"]
        ts_lines.append(
            "  { id: "
            + json.dumps(c["id"])
            + ", iso2: "
            + json.dumps(c["iso2"])
            + ", iso3: "
            + json.dumps(c["iso3"])
            + ", name: "
            + json.dumps(c["name"])
            + ", svgPath: "
            + json.dumps(c["svgPath"])
            + ", boundingBox: { minX: "
            + f"{bb['minX']}, minY: {bb['minY']}, maxX: {bb['maxX']}, maxY: {bb['maxY']}"
            + " } },"
        )
    ts_lines.append("];")
    ts_lines.append("")

    ts_content = "\n".join(ts_lines)
    with open(OUT_TS_PATH, "w") as f:
        f.write(ts_content)

    output_size_bytes = len(ts_content.encode("utf-8"))

    report_lines = [
        "Country Boundary Accuracy Pipeline - validation report (Index 2.1)",
        "",
        f"Source dataset: operational-country-borders.json (Natural Earth-derived, already in-repo)",
        f"Projection: Web Mercator, custom seam at {SEAM}deg (={LEFT_EDGE}deg), clamped to +-{MERCATOR_LAT_LIMIT}deg lat,",
        f"            projected into the full square source-image space (1000x1000, matching the",
        f"            2048x2048 world-map-v17.png 1:1, no crop baked in - Index 2.2B). Consuming SVG",
        f"            overlays use viewBox=\"0 0 1000 1000\" preserveAspectRatio=\"xMidYMid slice\", the",
        f"            SVG-native equivalent of the image's object-fit:cover, so both stay aligned at",
        f"            any live viewport aspect ratio.",
        f"Simplification: Douglas-Peucker, tolerance {SIMPLIFY_TOLERANCE_PX}px in the projected 1000x1000 space",
        f"                (rings under {SIMPLIFY_MIN_RING_POINTS} points kept exactly as sourced, unsimplified,",
        f"                 to avoid collapsing small nations below a valid ring)",
        "",
        f"Total features in source: {total}",
        f"Features with no id at all (excluded, not counted as errors): {no_id_count}",
        f"Duplicate-id features dropped (kept the larger geometry per id): {len(duplicate_ids_dropped)}",
        f"Successfully converted: {len(registry)}",
        f"Requiring manual adjustment/skipped: {len(manual_adjustment)}",
    ]
    if duplicate_ids_dropped:
        report_lines.append("Duplicate ids (smaller/degenerate copy dropped): " + ", ".join(duplicate_ids_dropped))
    if manual_adjustment:
        report_lines.append("Skipped ids (no ISO metadata or empty geometry): " + ", ".join(manual_adjustment))
    report_lines.append(f"Output file: {OUT_TS_PATH} ({output_size_bytes} bytes, {output_size_bytes/1024:.1f} KB)")

    report = "\n".join(report_lines)
    with open(OUT_REPORT_PATH, "w") as f:
        f.write(report + "\n")

    print(report)


if __name__ == "__main__":
    main()
