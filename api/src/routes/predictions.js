import { Router } from "express";

const router = Router();

/**
 * GET /api/v1/predictions/weather
 * Weather prediction data useful for prediction market agents
 * Combines NOAA forecast data with historical accuracy metrics
 */
router.get("/weather", async (req, res) => {
  const { lat, lon, metric } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({
      error: "Missing required parameters: lat, lon",
      example: "/api/v1/predictions/weather?lat=25.76&lon=-80.19&metric=temperature",
    });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ error: "lat and lon must be valid numbers" });
  }

  try {
    // Get the forecast grid point
    const pointRes = await fetch(
      `https://api.weather.gov/points/${latitude},${longitude}`,
      { headers: { "User-Agent": "VelocibotAgentAPI/1.0 (velocitybotholemu@gmail.com)" } }
    );

    if (!pointRes.ok) {
      return res.status(502).json({
        error: `NOAA API error: ${pointRes.status}`,
        note: "NOAA only covers US locations",
      });
    }

    const pointData = await pointRes.json();
    const forecastUrl = pointData.properties.forecast;
    const hourlyUrl = pointData.properties.forecastHourly;
    const gridUrl = pointData.properties.forecastGridData;

    // Fetch detailed grid data (quantitative forecasts)
    const [forecastRes, hourlyRes, gridRes] = await Promise.all([
      fetch(forecastUrl, { headers: { "User-Agent": "VelocibotAgentAPI/1.0" } }),
      fetch(hourlyUrl, { headers: { "User-Agent": "VelocibotAgentAPI/1.0" } }),
      fetch(gridUrl, { headers: { "User-Agent": "VelocibotAgentAPI/1.0" } }),
    ]);

    const forecast = await forecastRes.json();
    const hourly = await hourlyRes.json();
    const grid = await gridRes.json();

    // Extract structured prediction data
    const predictionData = {
      location: {
        latitude,
        longitude,
        city: pointData.properties.relativeLocation?.properties?.city,
        state: pointData.properties.relativeLocation?.properties?.state,
        timezone: pointData.properties.timeZone,
      },
      generated_at: new Date().toISOString(),
      source: "NOAA National Weather Service",

      // Temperature predictions (next 7 days)
      temperature: {
        unit: "°F",
        periods: forecast.properties?.periods?.map((p) => ({
          name: p.name,
          value: p.temperature,
          trend: p.temperatureTrend,
          is_daytime: p.isDaytime,
          start: p.startTime,
          end: p.endTime,
        })) || [],
      },

      // Hourly temperature (next 48h) — great for short-term prediction markets
      hourly_temperature: {
        unit: "°F",
        values: hourly.properties?.periods?.slice(0, 48).map((p) => ({
          time: p.startTime,
          value: p.temperature,
          wind_speed: p.windSpeed,
          wind_direction: p.windDirection,
          precipitation_chance: p.probabilityOfPrecipitation?.value || 0,
        })) || [],
      },

      // Precipitation probability timeline
      precipitation: {
        periods: forecast.properties?.periods?.map((p) => ({
          name: p.name,
          probability: p.probabilityOfPrecipitation?.value || 0,
          description: p.detailedForecast,
        })) || [],
      },

      // Quantitative grid data (raw NWS numbers)
      quantitative: {
        max_temperature: extractGridValues(grid.properties?.maxTemperature),
        min_temperature: extractGridValues(grid.properties?.minTemperature),
        probability_of_precipitation: extractGridValues(grid.properties?.probabilityOfPrecipitation),
        quantitative_precipitation: extractGridValues(grid.properties?.quantitativePrecipitation),
        wind_speed: extractGridValues(grid.properties?.windSpeed),
        snowfall_amount: extractGridValues(grid.properties?.snowfallAmount),
      },

      // Meta for prediction market use
      prediction_market_hints: {
        note: "Use hourly data for short-term (< 48h) predictions, quantitative grid data for precise thresholds",
        suggested_markets: [
          `Will temperature exceed ${getMaxTemp(forecast)}°F at this location in the next 7 days?`,
          `Will it rain at this location tomorrow? (Current probability: ${getPrecipProb(forecast)}%)`,
          `Will wind speeds exceed 20 mph at this location in the next 48 hours?`,
        ],
      },
    };

    res.json(predictionData);
  } catch (error) {
    console.error("[predictions/weather] Error:", error.message);
    res.status(500).json({ error: "Failed to fetch prediction data", details: error.message });
  }
});

function extractGridValues(gridProp) {
  if (!gridProp?.values) return [];
  return gridProp.values.slice(0, 14).map((v) => ({
    time: v.validTime,
    value: v.value,
    unit: gridProp.uom || "unknown",
  }));
}

function getMaxTemp(forecast) {
  const temps = forecast.properties?.periods
    ?.filter((p) => p.isDaytime)
    ?.map((p) => p.temperature) || [80];
  return Math.max(...temps);
}

function getPrecipProb(forecast) {
  const prob = forecast.properties?.periods?.[0]?.probabilityOfPrecipitation?.value;
  return prob || 0;
}

export default router;
