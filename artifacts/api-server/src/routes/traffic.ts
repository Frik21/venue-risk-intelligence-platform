import { Router, type IRouter } from "express";
import { fetchTrafficCondition, TrafficNotConfiguredError } from "../lib/traffic";

const router: IRouter = Router();

// 503 (not 502) specifically when TOMTOM_API_KEY isn't set - lets the
// frontend tell "not configured yet" apart from "TomTom is down" and
// just skip the Traffic tile quietly in the former case.
router.get("/traffic", async (req, res): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) { res.status(400).json({ error: "lat and lng query params are required" }); return; }

  try {
    const condition = await fetchTrafficCondition(lat, lng);
    res.json({ condition });
  } catch (err) {
    if (err instanceof TrafficNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    console.error("Traffic check failed:", err);
    res.status(502).json({ error: "Traffic check failed" });
  }
});

export default router;
