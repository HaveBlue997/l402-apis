/**
 * Marine weather service using the NOAA Weather API (api.weather.gov).
 *
 * NOAA's API is free, requires no key, but needs a User-Agent header.
 * For marine forecasts, we:
 * 1. Get the grid point for lat/lon via /points
 * 2. Fetch the forecast from the returned forecast URL
 * 3. Parse and return marine-relevant data
 */

const NOAA_BASE = "https://api.weather.gov";
const USER_AGENT = "(openclaw-l402-api, support@openclaw.com)";

async function noaaFetch(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`NOAA API error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`);
  }

  return response.json();
}

export async function getMarineWeather(lat, lon) {
  // Step 1: Get grid point metadata
  const pointsUrl = `${NOAA_BASE}/points/${lat},${lon}`;
  let pointData;

  try {
    pointData = await noaaFetch(pointsUrl);
  } catch (err) {
    // NOAA returns 404 for points over open ocean — provide a helpful message
    if (err.message.includes("404")) {
      throw new Error(
        `No NOAA forecast data for coordinates (${lat}, ${lon}). ` +
          "NOAA coverage is limited to US land and near-shore waters. " +
          "For open ocean forecasts, a different data source is needed."
      );
    }
    throw err;
  }

  const props = pointData.properties;
  const forecastUrl = props.forecast;
  const forecastHourlyUrl = props.forecastHourly;
  const gridId = props.gridId;
  const gridX = props.gridX;
  const gridY = props.gridY;

  // Step 2: Fetch detailed forecast
  const [forecast, hourly] = await Promise.all([
    noaaFetch(forecastUrl),
    noaaFetch(forecastHourlyUrl),
  ]);

  // Step 3: Extract marine-relevant info
  const currentPeriod = forecast.properties.periods[0];
  const hourlyPeriods = hourly.properties.periods.slice(0, 24);

  // Extract wind data from hourly periods
  const windData = hourlyPeriods.map((p) => ({
    time: p.startTime,
    wind_speed: p.windSpeed,
    wind_direction: p.windDirection,
    temperature: `${p.temperature}°${p.temperatureUnit}`,
    short_forecast: p.shortForecast,
  }));

  return {
    location: {
      latitude: lat,
      longitude: lon,
      grid_id: gridId,
      grid_x: gridX,
      grid_y: gridY,
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
    hourly_wind: windData,
    fetched_at: new Date().toISOString(),
    source: "NOAA National Weather Service API",
    source_url: pointsUrl,
    note: "Wave height and current data require NOAA NDBC buoy data (not yet integrated). Wind and forecast data are from NWS grid forecasts.",
  };
}
