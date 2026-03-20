/**
 * Input validation middleware factories.
 */

export function requireQuery(...params) {
  return (req, res, next) => {
    const missing = params.filter((p) => !req.query[p]?.trim());
    if (missing.length > 0) {
      return res.status(400).json({
        error: "Missing required query parameters",
        missing,
        usage: params.map((p) => `${p}=<value>`).join("&"),
      });
    }
    next();
  };
}

export function validateLatLon(req, res, next) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({
      error: "Missing required query parameters",
      missing: [!lat && "lat", !lon && "lon"].filter(Boolean),
      usage: "lat=<latitude>&lon=<longitude>",
    });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    return res.status(400).json({
      error: "Invalid latitude. Must be a number between -90 and 90.",
    });
  }

  if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({
      error: "Invalid longitude. Must be a number between -180 and 180.",
    });
  }

  // Round to 4 decimal places (NOAA requirement)
  req.validatedLat = Math.round(latitude * 10000) / 10000;
  req.validatedLon = Math.round(longitude * 10000) / 10000;
  next();
}

export function validateState(req, res, next) {
  const { state } = req.query;
  if (!state?.trim()) {
    return res.status(400).json({
      error: "Missing required query parameter: state",
      usage: "state=<2-letter state code>&name=<company name>",
    });
  }
  if (!/^[A-Za-z]{2}([_][A-Za-z]{2})?$/.test(state.trim())) {
    return res.status(400).json({
      error:
        "Jurisdiction must be a 2-letter code (e.g., CA, NY, GB) or region code (e.g., CA_ON, CA_BC)",
    });
  }
  next();
}

export function validateJurisdiction(req, res, next) {
  // Accept either 'jurisdiction' or 'state' query param
  const value = (req.query.jurisdiction || req.query.state || "").trim();
  if (!value) {
    return res.status(400).json({
      error: "Missing required query parameter: jurisdiction (or state)",
      usage: "jurisdiction=US&name=<company name>",
      supported: ["US", "GB", "UK", "or any 2-letter US state code (e.g., CA, NY, DE)"],
    });
  }
  if (!/^[A-Za-z]{2}$/.test(value)) {
    return res.status(400).json({
      error: "Jurisdiction must be a 2-letter code (e.g., US, GB, UK, CA, NY)",
      supported: ["US", "GB", "UK", "or any 2-letter US state code"],
    });
  }
  next();
}
