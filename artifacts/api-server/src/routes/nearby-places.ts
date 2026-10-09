import { Router, type IRouter } from "express";
import { fetchNearbyPlace, type NearbyPlaceCategory } from "../lib/nearby-services";

const router: IRouter = Router();

const VALID_CATEGORIES: NearbyPlaceCategory[] = ["hospital", "police", "cafe", "fuel"];

// Backs Operators Note's "Ask" chatbot (keyword-matched, not an LLM -
// per direct product direction, no API keys) - one category per
// question, same "not tied to a Venue record" shape as GET /weather/
// GET /emergency-info, for wherever resolveCurrentLocation() says the
// CPO actually is right now.
router.get("/nearby-places", async (req, res): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const category = String(req.query.category ?? "");
  if (isNaN(lat) || isNaN(lng)) { res.status(400).json({ error: "lat and lng query params are required" }); return; }
  if (!VALID_CATEGORIES.includes(category as NearbyPlaceCategory)) {
    res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }

  try {
    const results = await fetchNearbyPlace(lat, lng, category as NearbyPlaceCategory);
    res.json({ category, results });
  } catch (err) {
    console.error("Nearby places lookup failed:", err);
    res.status(502).json({ error: "Nearby places lookup failed" });
  }
});

export default router;
