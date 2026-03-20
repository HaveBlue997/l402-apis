/**
 * Aviation weather service — METAR and TAF data from NOAA Aviation Weather Center.
 *
 * Data source: https://aviationweather.gov — free, no API key needed.
 *
 * - METAR: current observed conditions at an airport/station
 * - TAF: terminal aerodrome forecast (typically 24-30 hours)
 * - Station search: find nearby stations by lat/lon bounding box
 *
 * Caching: 5 minutes for METAR, 30 minutes for TAF.
 */

const AWC_BASE = "https://aviationweather.gov/api/data";
const USER_AGENT = "Velocibot/1.0 (velocitybotholemu@gmail.com)";

const METAR_CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const TAF_CACHE_TTL_MS = 30 * 60 * 1000;     // 30 minutes

// In-memory caches
const metarCache = new Map();
const tafCache = new Map();

const ICAO_RE = /^[A-Z]{4}$/;

// --- Cache helpers ---

function getCached(cache, key, ttl) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(cache, key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// --- Validation ---

export function isValidICAO(code) {
  return typeof code === "string" && ICAO_RE.test(code);
}

// --- Flight category from METAR fields ---

function determineFlightCategory(visibilityMi, ceilingFt) {
  // FAA flight category definitions
  if (ceilingFt !== null && ceilingFt < 500) return "LIFR";
  if (visibilityMi !== null && visibilityMi < 1) return "LIFR";
  if (ceilingFt !== null && ceilingFt < 1000) return "IFR";
  if (visibilityMi !== null && visibilityMi < 3) return "IFR";
  if (ceilingFt !== null && ceilingFt < 3000) return "MVFR";
  if (visibilityMi !== null && visibilityMi < 5) return "MVFR";
  return "VFR";
}

// --- METAR parsing ---

function parseMETAR(raw) {
  if (!raw) return null;

  const parsed = {
    station: raw.icaoId || raw.stationId || null,
    observation_time: raw.reportTime || raw.obsTime || null,
    raw_text: raw.rawOb || raw.rawText || null,
    wind: {
      direction_degrees: raw.wdir ?? null,
      speed_kt: raw.wspd ?? null,
      gust_kt: raw.wgst ?? null,
    },
    visibility_mi: raw.visib ?? null,
    ceiling_ft: null,
    clouds: [],
    temperature_c: raw.temp ?? null,
    dewpoint_c: raw.dewp ?? null,
    altimeter_inhg: raw.altim ?? null,
    flight_category: raw.fltcat || null,
    latitude: raw.lat ?? null,
    longitude: raw.lon ?? null,
    elevation_m: raw.elev ?? null,
    station_name: raw.name || null,
  };

  // Extract cloud layers
  if (raw.clouds && Array.isArray(raw.clouds)) {
    parsed.clouds = raw.clouds.map((c) => ({
      coverage: c.cover || null,
      base_ft: c.base ?? null,
    }));
    // Ceiling = lowest BKN or OVC layer
    for (const c of raw.clouds) {
      if (c.cover === "BKN" || c.cover === "OVC") {
        if (parsed.ceiling_ft === null || (c.base != null && c.base < parsed.ceiling_ft)) {
          parsed.ceiling_ft = c.base;
        }
      }
    }
  }

  // Determine flight category if not provided by API
  if (!parsed.flight_category) {
    parsed.flight_category = determineFlightCategory(parsed.visibility_mi, parsed.ceiling_ft);
  }

  return parsed;
}

// --- TAF parsing ---

function parseTAF(raw) {
  if (!raw) return null;

  const parsed = {
    station: raw.icaoId || raw.stationId || null,
    issued: raw.issueTime || null,
    valid_from: raw.validTimeFrom || null,
    valid_to: raw.validTimeTo || null,
    raw_text: raw.rawTAF || raw.rawText || null,
    latitude: raw.lat ?? null,
    longitude: raw.lon ?? null,
    elevation_m: raw.elev ?? null,
    forecast_periods: [],
  };

  // Parse forecast groups if present
  if (raw.fcsts && Array.isArray(raw.fcsts)) {
    parsed.forecast_periods = raw.fcsts.map((f) => ({
      time_from: f.timeFrom || null,
      time_to: f.timeTo || null,
      change_type: f.fcstChange || null,
      wind: {
        direction_degrees: f.wdir ?? null,
        speed_kt: f.wspd ?? null,
        gust_kt: f.wgst ?? null,
      },
      visibility_mi: f.visib ?? null,
      clouds: (f.clouds || []).map((c) => ({
        coverage: c.cover || null,
        base_ft: c.base ?? null,
      })),
      weather: f.wxString || null,
    }));
  }

  return parsed;
}

// --- API fetchers ---

async function fetchFromAWC(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const statusText = response.statusText || "Unknown error";
    throw new Error(`NOAA AWC returned ${response.status}: ${statusText}`);
  }

  return response.json();
}

export async function fetchMETAR(station) {
  const code = station.toUpperCase();
  if (!isValidICAO(code)) {
    return {
      error: "Invalid ICAO station code",
      detail: "Must be exactly 4 uppercase letters (e.g., KJFK, EGLL, RJTT)",
    };
  }

  const cacheKey = `metar:${code}`;
  const cached = getCached(metarCache, cacheKey, METAR_CACHE_TTL_MS);
  if (cached) return { ...cached, _cached: true };

  let body;
  try {
    body = await fetchFromAWC(`${AWC_BASE}/metar?ids=${code}&format=json`);
  } catch (err) {
    return {
      error: "NOAA Aviation Weather Center is unreachable",
      detail: err.message,
      station: code,
      data_source: "error",
    };
  }

  if (!Array.isArray(body) || body.length === 0) {
    return {
      error: `No METAR data found for station ${code}`,
      detail: "Station may not exist or has no recent observations",
      station: code,
      data_source: "error",
    };
  }

  const result = {
    metar: parseMETAR(body[0]),
    station: code,
    source: "NOAA Aviation Weather Center",
    fetched_at: new Date().toISOString(),
    data_source: "live",
  };

  setCache(metarCache, cacheKey, result);
  return result;
}

export async function fetchTAF(station) {
  const code = station.toUpperCase();
  if (!isValidICAO(code)) {
    return {
      error: "Invalid ICAO station code",
      detail: "Must be exactly 4 uppercase letters (e.g., KJFK, EGLL, RJTT)",
    };
  }

  const cacheKey = `taf:${code}`;
  const cached = getCached(tafCache, cacheKey, TAF_CACHE_TTL_MS);
  if (cached) return { ...cached, _cached: true };

  let body;
  try {
    body = await fetchFromAWC(`${AWC_BASE}/taf?ids=${code}&format=json`);
  } catch (err) {
    return {
      error: "NOAA Aviation Weather Center is unreachable",
      detail: err.message,
      station: code,
      data_source: "error",
    };
  }

  if (!Array.isArray(body) || body.length === 0) {
    return {
      error: `No TAF data found for station ${code}`,
      detail: "Station may not issue TAFs or has no recent forecast",
      station: code,
      data_source: "error",
    };
  }

  const result = {
    taf: parseTAF(body[0]),
    station: code,
    source: "NOAA Aviation Weather Center",
    fetched_at: new Date().toISOString(),
    data_source: "live",
  };

  setCache(tafCache, cacheKey, result);
  return result;
}

export async function searchStations(lat, lon, radiusNm = 30) {
  // Convert radius from nautical miles to approximate degrees
  // 1 degree latitude ≈ 60 NM
  const latDelta = radiusNm / 60;
  const lonDelta = radiusNm / (60 * Math.cos((lat * Math.PI) / 180));

  const lat1 = (lat - latDelta).toFixed(4);
  const lon1 = (lon - lonDelta).toFixed(4);
  const lat2 = (lat + latDelta).toFixed(4);
  const lon2 = (lon + lonDelta).toFixed(4);

  let body;
  try {
    body = await fetchFromAWC(
      `${AWC_BASE}/metar?bbox=${lat1},${lon1},${lat2},${lon2}&format=json`
    );
  } catch (err) {
    return {
      error: "NOAA Aviation Weather Center is unreachable",
      detail: err.message,
      data_source: "error",
    };
  }

  if (!Array.isArray(body) || body.length === 0) {
    return {
      stations: [],
      count: 0,
      search_center: { lat, lon },
      radius_nm: radiusNm,
      source: "NOAA Aviation Weather Center",
      fetched_at: new Date().toISOString(),
      data_source: "live",
    };
  }

  const stations = body.map((raw) => ({
    station: raw.icaoId || raw.stationId || null,
    name: raw.name || null,
    latitude: raw.lat ?? null,
    longitude: raw.lon ?? null,
    elevation_m: raw.elev ?? null,
    flight_category: raw.fltcat || determineFlightCategory(raw.visib ?? null, null),
  }));

  return {
    stations,
    count: stations.length,
    search_center: { lat, lon },
    radius_nm: radiusNm,
    source: "NOAA Aviation Weather Center",
    fetched_at: new Date().toISOString(),
    data_source: "live",
  };
}
