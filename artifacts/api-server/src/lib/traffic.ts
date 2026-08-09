// Live traffic conditions for the Operational Brief. Source: TomTom's
// Traffic Flow Segment Data API (developer.tomtom.com) - free tier, no
// credit card, but does require an API key (unlike weather/geocoding,
// which need none) - set TOMTOM_API_KEY in .env. Same native-fetch +
// AbortSignal.timeout pattern as weather.ts/OSRM.
const TOMTOM_FLOW_BASE = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json";

export type TrafficSeverity = "free_flow" | "light" | "moderate" | "heavy" | "closed";

export interface TrafficCondition {
  severity: TrafficSeverity;
  label: string;
  currentSpeedKph: number | null;
  freeFlowSpeedKph: number | null;
}

// Ratio of current speed to free-flow speed for this road segment -
// how TomTom's own traffic tiles derive congestion level, reused here
// instead of inventing a different threshold scheme.
const LIGHT_TRAFFIC_RATIO = 0.85;
const MODERATE_TRAFFIC_RATIO = 0.65;
const HEAVY_TRAFFIC_RATIO = 0.4;

export class TrafficNotConfiguredError extends Error {
  constructor() {
    super("TOMTOM_API_KEY is not configured");
    this.name = "TrafficNotConfiguredError";
  }
}

// Throws TrafficNotConfiguredError if no key is set (caller should
// treat that distinctly from a genuine fetch failure - see routes/traffic.ts).
// Returns null when TomTom has no road segment data for this exact
// point (e.g. off the road network) - a real "nothing to report"
// result, not a failure.
export async function fetchTrafficCondition(lat: number, lng: number): Promise<TrafficCondition | null> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    throw new TrafficNotConfiguredError();
  }

  const url = `${TOMTOM_FLOW_BASE}?point=${lat},${lng}&key=${apiKey}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`TomTom Traffic API returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  const seg = data.flowSegmentData;
  if (!seg) return null;

  if (seg.roadClosure) {
    return {
      severity: "closed",
      label: "Road closure reported nearby",
      currentSpeedKph: typeof seg.currentSpeed === "number" ? seg.currentSpeed : null,
      freeFlowSpeedKph: typeof seg.freeFlowSpeed === "number" ? seg.freeFlowSpeed : null,
    };
  }

  const current = typeof seg.currentSpeed === "number" ? seg.currentSpeed : null;
  const freeFlow = typeof seg.freeFlowSpeed === "number" ? seg.freeFlowSpeed : null;
  if (current == null || freeFlow == null || freeFlow === 0) return null;

  const ratio = current / freeFlow;
  let severity: TrafficSeverity;
  let label: string;
  if (ratio >= LIGHT_TRAFFIC_RATIO) {
    severity = "free_flow";
    label = "Free-flowing traffic";
  } else if (ratio >= MODERATE_TRAFFIC_RATIO) {
    severity = "light";
    label = "Light traffic";
  } else if (ratio >= HEAVY_TRAFFIC_RATIO) {
    severity = "moderate";
    label = "Moderate traffic congestion";
  } else {
    severity = "heavy";
    label = "Heavy traffic congestion";
  }

  return { severity, label, currentSpeedKph: current, freeFlowSpeedKph: freeFlow };
}
