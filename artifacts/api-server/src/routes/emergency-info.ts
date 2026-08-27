import { Router, type IRouter } from "express";
import { fetchNearbyEmergencyInfo } from "../lib/nearby-services";

const router: IRouter = Router();

// One-tap emergency info for Operators Note (Following Roadmap Tier 1,
// item 5) - nearest hospital/police station/embassy to an arbitrary
// lat/lng, same "not tied to a Venue record" shape as GET /weather, so
// it works for wherever the CPO's own resolveCurrentLocation() says
// they actually are right now.
router.get("/emergency-info", async (req, res): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) { res.status(400).json({ error: "lat and lng query params are required" }); return; }

  try {
    const info = await fetchNearbyEmergencyInfo(lat, lng);
    res.json(info);
  } catch (err) {
    console.error("Emergency info check failed:", err);
    res.status(502).json({ error: "Emergency info check failed" });
  }
});

export default router;
