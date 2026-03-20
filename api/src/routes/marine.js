import { Router } from "express";
import { getMarineWeather } from "../services/marine.js";
import { validateLatLon } from "../middleware/validate.js";

const router = Router();

router.get("/", validateLatLon, async (req, res) => {
  try {
    const result = await getMarineWeather(req.validatedLat, req.validatedLon);
    res.json(result);
  } catch (err) {
    const status = err.message.includes("No NOAA forecast") ? 404 : 502;
    res.status(status).json({
      error: err.message,
      source: "NOAA National Weather Service API",
    });
  }
});

export default router;
