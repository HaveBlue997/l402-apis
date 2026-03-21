/**
 * Marine weather service using NOAA data sources.
 *
 * Strategy:
 * 1. Try NWS grid forecast via api.weather.gov/points (works for US land + coastal)
 * 2. If that fails (ocean coordinates), find nearest NDBC buoy for marine observations
 * 3. Also look up the marine forecast zone for the area
 *
 * All NOAA APIs are free, require no key, but need a User-Agent header.
 */

const NOAA_BASE = "https://api.weather.gov";
const NDBC_BASE = "https://www.ndbc.noaa.gov/data/realtime2";
const USER_AGENT = "(openclaw-l402-api, support@openclaw.com)";

// Well-known NDBC buoy stations by region for fallback
const REGIONAL_BUOYS = [
  { id: "41047", name: "N. Caribbean", lat: 27.514, lon: -71.494 },
  { id: "41049", name: "S. Caribbean", lat: 27.49, lon: -63.0 },
  { id: "42036", name: "W. Gulf of Mexico", lat: 28.5, lon: -84.517 },
  { id: "44025", name: "NY/NJ Coast", lat: 40.25, lon: -73.164 },
  { id: "46025", name: "S. California", lat: 33.749, lon: -119.053 },
  { id: "51001", name: "Hawaii NW", lat: 23.445, lon: -162.279 },
  { id: "46029", name: "Columbia River Bar", lat: 46.144, lon: -124.51 },
  { id: "41002", name: "S. Atlantic Bight", lat: 31.759, lon: -74.936 },
  { id: "44013", name: "Boston Harbor", lat: 42.346, lon: -70.651 },
  { id: "42019", name: "Freeport TX", lat: 27.907, lon: -95.352 },
];

async function noaaFetch(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`NOAA API error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`);
  }

  return response.json();
}

// Find nearest buoy to given coordinates
function findNearestBuoy(lat, lon) {
  let nearest = null;
  let minDist = Infinity;
  for (const buoy of REGIONAL_BUOYS) {
    const dlat = buoy.lat - lat;
    const dlon = buoy.lon - lon;
    const dist = Math.sqrt(dlat * dlat + dlon * dlon);
    if (dist < minDist) {
      minDist = dist;
      nearest = buoy;
    }
  }
  return { buoy: nearest, distance_deg: Math.round(minDist * 100) / 100 };
}

// Fetch latest observation from NDBC buoy
async function fetchBuoyData(stationId) {
  const url = `${NDBC_BASE}/${stationId}.txt`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`NDBC buoy ${stationId} returned ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 3) throw new Error("No buoy data available");

  // Parse header and first data row
  const headers = lines[0].replace(/^#/, "").trim().split(/\s+/);
  // Skip units line (line 1), get data (line 2)
  const values = lines[2].trim().split(/\s+/);

  const data = {};
  headers.forEach((h, i) => {
    const val = values[i];
    data[h] = val === "MM" ? null : isNaN(val) ? val : parseFloat(val);
  });

  return {
    station_id: stationId,
    observation_time: `${data.YY}-${String(data.MM).padStart(2, "0")}-${String(data.DD).padStart(2, "0")}T${String(data.hh).padStart(2, "0")}:${String(data.mm).padStart(2, "0")}:00Z`,
    wind: {
      direction_deg: data.WDIR,
      speed_mps: data.WSPD,
      gust_mps: data.GST,
    },
    waves: {
      significant_height_m: data.WVHT,
      dominant_period_s: data.DPD,
      average_period_s: data.APD,
      direction_deg: data.MWD,
    },
    pressure_hpa: data.PRES,
    air_temp_c: data.ATMP,
    water_temp_c: data.WTMP,
    dewpoint_c: data.DEWP,
    visibility_nmi: data.VIS,
  };
}

// Try to find marine forecast zone
async function findMarineZone(lat, lon) {
  try {
    const url = `${NOAA_BASE}/zones?type=marine&point=${lat},${lon}`;
    const data = await noaaFetch(url);
    if (data.features && data.features.length > 0) {
      const zone = data.features[0].properties;
      return {
        zone_id: zone.id,
        zone_name: zone.name,
        state: zone.state,
        note: "Marine zone forecasts are not yet supported by the NOAA API (api.weather.gov). Zone identification is available for reference.",
      };
    }
  } catch (_) {
    // Zone lookup is best-effort
  }
  return null;
}

export async function getMarineWeather(lat, lon) {
  // Strategy 1: Try NWS grid forecast (works for US land + near-coastal)
  const pointsUrl = `${NOAA_BASE}/points/${lat},${lon}`;
  let pointData = null;
  let gridForecast = null;

  try {
    pointData = await noaaFetch(pointsUrl);
    const props = pointData.properties;

    const [forecast, hourly] = await Promise.all([
      noaaFetch(props.forecast),
      noaaFetch(props.forecastHourly),
    ]);

    const currentPeriod = forecast.properties.periods[0];
    const hourlyPeriods = hourly.properties.periods.slice(0, 24);

    gridForecast = {
      location: {
        latitude: lat,
        longitude: lon,
        grid_id: props.gridId,
        grid_x: props.gridX,
        grid_y: props.gridY,
        timezone: props.timeZone,
      },
      current_conditions: {
        period: currentPeriod.name,
        temperature: `${currentPeriod.temperature}°${currentPeriod.temperatureUnit}`,
        wind_speed: currentPeriod.windSpeed,
        wind_direction: currentPeriod.windDirection,
        forecast: currentPeriod.detailedForecast,
        is_daytime: currentPeriod.isDaytime,
      },
      extended_forecast: forecast.properties.periods.slice(0, 7).map((p) => ({
        name: p.name,
        temperature: `${p.temperature}°${p.temperatureUnit}`,
        wind_speed: p.windSpeed,
        wind_direction: p.windDirection,
        forecast: p.shortForecast,
        detailed: p.detailedForecast,
      })),
      hourly_wind: hourlyPeriods.map((p) => ({
        time: p.startTime,
        wind_speed: p.windSpeed,
        wind_direction: p.windDirection,
        temperature: `${p.temperature}°${p.temperatureUnit}`,
        short_forecast: p.shortForecast,
      })),
    };
  } catch (_) {
    // Grid forecast not available for this location — fall through to buoy data
  }

  // Strategy 2: Find nearest NDBC buoy for marine observations
  const { buoy, distance_deg } = findNearestBuoy(lat, lon);
  let buoyData = null;
  if (buoy) {
    try {
      buoyData = await fetchBuoyData(buoy.id);
      buoyData.station_name = buoy.name;
      buoyData.distance_from_request_deg = distance_deg;
    } catch (_) {
      // Buoy data is best-effort
    }
  }

  // Strategy 3: Find marine zone
  const marineZone = await findMarineZone(lat, lon);

  // Build response
  if (!gridForecast && !buoyData) {
    // Nothing available — return helpful error
    return {
      error: "No marine weather data available for this location",
      detail: `Coordinates (${lat}, ${lon}) are outside NOAA NWS grid coverage and no nearby NDBC buoy data was accessible.`,
      nearest_buoy: buoy ? { id: buoy.id, name: buoy.name, distance_deg } : null,
      marine_zone: marineZone,
      suggestion: "Try coordinates closer to the US coast, or use specific NDBC buoy station IDs for offshore data.",
    };
  }

  return {
    ...(gridForecast || { location: { latitude: lat, longitude: lon } }),
    buoy_observations: buoyData,
    marine_zone: marineZone,
    data_sources: [
      gridForecast ? "NOAA NWS Grid Forecast" : null,
      buoyData ? `NDBC Buoy ${buoy.id} (${buoy.name})` : null,
      marineZone ? "NOAA Marine Zone" : null,
    ].filter(Boolean),
    fetched_at: new Date().toISOString(),
    source: "NOAA (NWS + NDBC)",
  };
}
