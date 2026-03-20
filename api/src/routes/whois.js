import { Router } from "express";
import { lookupDomain, checkAvailability } from "../services/whois.js";
import { requireQuery } from "../middleware/validate.js";

const router = Router();

router.get("/lookup", requireQuery("domain"), async (req, res) => {
  const result = await lookupDomain(req.query.domain);

  if (result.error) {
    return res.status(result.status || 500).json({
      error: result.error,
      detail: result.detail,
      domain: result.domain,
    });
  }

  res.json(result);
});

router.get("/available", requireQuery("domain"), async (req, res) => {
  const result = await checkAvailability(req.query.domain);

  if (result.error) {
    return res.status(result.status || 500).json({
      error: result.error,
      detail: result.detail,
    });
  }

  res.json(result);
});

export default router;
