import { Router } from "express";
import { fetchMETAR, fetchTAF, searchStations, isValidICAO } from "../services/aviation.js";
import { validateLatLon } from "../middleware/validate.js";

const router = Router();

// GET /metar?station=KJFK
router.get("/metar", async (req, res) => {
  const station = (req.query.station || "").trim().toUpperCase();
  if (!station) {
    return res.status(400).json({
      error: "Missing required query parameter: station",
      usage: "station=<ICAO code> (e.g., KJFK, EGLL, RJTT)",
    });
  }
  if (!isValidICAO(station)) {
    return res.status(400).json({
      error: "Invalid ICAO station code",
      detail: "Must be exactly 4 uppercase letters (e.g., KJFK, EGLL, RJTT)",
    });
  }

  const result = await fetchMETAR(station);
  if (result.error) {
    return res.status(result.data_source === "error" ? 502 : 400).json(result);
  }
  res.json(result);
});

// GET /taf?station=KJFK
router.get("/taf", async (req, res) => {
  const station = (req.query.station || "").trim().toUpperCase();
  if (!station) {
    return res.status(400).json({
      error: "Missing required query parameter: station",
      usage: "station=<ICAO code> (e.g., KJFK, EGLL, RJTT)",
    });
  }
  if (!isValidICAO(station)) {
    return res.status(400).json({
      error: "Invalid ICAO station code",
      detail: "Must be exactly 4 uppercase letters (e.g., KJFK, EGLL, RJTT)",
    });
  }

  const result = await fetchTAF(station);
  if (result.error) {
    return res.status(result.data_source === "error" ? 502 : 400).json(result);
  }
  res.json(result);
});

// GET /stations?lat=40.6&lon=-73.8&radius=30
router.get("/stations", validateLatLon, async (req, res) => {
  const radius = Math.min(Math.max(parseFloat(req.query.radius) || 30, 1), 200);

  const result = await searchStations(req.validatedLat, req.validatedLon, radius);
  if (result.error) {
    return res.status(502).json(result);
  }
  res.json(result);
});

export default router;
