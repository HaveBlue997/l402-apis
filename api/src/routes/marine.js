import { Router } from "express";
import { getMarineWeather } from "../services/marine.js";
import { validateLatLon } from "../middleware/validate.js";

const router = Router();

router.get("/", validateLatLon, async (req, res) => {
  try {
    const result = await getMarineWeather(req.validatedLat, req.validatedLon);
    // If the service returned an error object (no data available), use 200 with error field
    // This is not a server error — it's a valid response indicating limited coverage
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "Marine weather service error",
      detail: err.message,
      source: "NOAA",
    });
  }
});

export default router;
