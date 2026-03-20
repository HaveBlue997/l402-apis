import { Router } from "express";
import { searchCompany, getSupportedJurisdictions } from "../services/company.js";
import { requireQuery, validateJurisdiction } from "../middleware/validate.js";

const router = Router();

router.get("/search", validateJurisdiction, requireQuery("name"), async (req, res) => {
  const jurisdiction = (req.query.jurisdiction || req.query.state || "").trim();
  const name = req.query.name.trim();
  const result = await searchCompany(jurisdiction, name);

  if (result.error) {
    return res.status(400).json(result);
  }

  res.json(result);
});

router.get("/jurisdictions", (_req, res) => {
  res.json({ jurisdictions: getSupportedJurisdictions() });
});

// Keep /states as alias for backwards compat
router.get("/states", (_req, res) => {
  res.json({ jurisdictions: getSupportedJurisdictions() });
});

export default router;
