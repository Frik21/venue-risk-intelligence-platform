import { Router, type IRouter } from "express";
import { fetchCurrentWeather } from "../lib/weather";

const router: IRouter = Router();

// Exposes the same live weather check the OSINT pipeline uses
// (lib/weather.ts) for an arbitrary lat/lng - not tied to a Venue
// record, so callers like the Operational Brief's "Use my current
// location" can check conditions for wherever the operator actually is.
// Includes the actual temperature alongside the notable-conditions
// finding (which stays null on an unremarkable day).
router.get("/weather", async (req, res): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) { res.status(400).json({ error: "lat and lng query params are required" }); return; }

  try {
    const { temperatureC, conditions, finding } = await fetchCurrentWeather(lat, lng);
    res.json({ temperatureC, conditions, finding });
  } catch (err) {
    console.error("Weather check failed:", err);
    res.status(502).json({ error: "Weather check failed" });
  }
});

export default router;
