import { Router } from "express";

const router = Router();

// Cache for price data (refresh every 60 seconds)
let priceCache = null;
let priceCacheTime = 0;
const PRICE_CACHE_TTL = 60_000;

// Cache for fee estimates
let feeCache = null;
let feeCacheTime = 0;
const FEE_CACHE_TTL = 300_000; // 5 minutes

/**
 * GET /api/v1/crypto/price
 * Bitcoin and major crypto price data
 */
router.get("/price", async (req, res) => {
  const { coin = "bitcoin", currency = "usd" } = req.query;

  try {
    const now = Date.now();
    if (!priceCache || now - priceCacheTime > PRICE_CACHE_TTL) {
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`,
        { headers: { Accept: "application/json" } }
      );

      if (!cgRes.ok) {
        throw new Error(`CoinGecko API returned ${cgRes.status}`);
      }

      priceCache = await cgRes.json();
      priceCacheTime = now;
    }

    const coinData = priceCache[coin];
    if (!coinData) {
      return res.status(404).json({
        error: `Coin "${coin}" not found`,
        available: Object.keys(priceCache),
      });
    }

    res.json({
      coin,
      price_usd: coinData.usd,
      change_24h_pct: coinData.usd_24h_change,
      market_cap_usd: coinData.usd_market_cap,
      volume_24h_usd: coinData.usd_24h_vol,
      timestamp: new Date().toISOString(),
      source: "CoinGecko",
      // Useful for agents doing Lightning math
      sats_per_dollar: coinData.usd ? Math.round(100_000_000 / coinData.usd) : null,
    });
  } catch (error) {
    console.error("[crypto/price] Error:", error.message);
    res.status(502).json({ error: "Failed to fetch price data", details: error.message });
  }
});

/**
 * GET /api/v1/crypto/fees
 * Bitcoin network fee estimates (for on-chain transactions)
 */
router.get("/fees", async (req, res) => {
  try {
    const now = Date.now();
    if (!feeCache || now - feeCacheTime > FEE_CACHE_TTL) {
      const feeRes = await fetch("https://mempool.space/api/v1/fees/recommended");

      if (!feeRes.ok) {
        throw new Error(`Mempool API returned ${feeRes.status}`);
      }

      feeCache = await feeRes.json();
      feeCacheTime = now;
    }

    res.json({
      fees_sat_per_vbyte: {
        fastest: feeCache.fastestFee,
        half_hour: feeCache.halfHourFee,
        hour: feeCache.hourFee,
        economy: feeCache.economyFee,
        minimum: feeCache.minimumFee,
      },
      estimated_cost_usd: {
        note: "Based on average 140 vByte transaction",
        fastest: null, // Would need price data cross-reference
        economy: null,
      },
      timestamp: new Date().toISOString(),
      source: "mempool.space",
    });
  } catch (error) {
    console.error("[crypto/fees] Error:", error.message);
    res.status(502).json({ error: "Failed to fetch fee estimates", details: error.message });
  }
});

/**
 * GET /api/v1/crypto/lightning/stats
 * Lightning Network statistics
 */
router.get("/lightning/stats", async (req, res) => {
  try {
    const statsRes = await fetch("https://mempool.space/api/v1/lightning/statistics/latest");

    if (!statsRes.ok) {
      throw new Error(`Mempool Lightning API returned ${statsRes.status}`);
    }

    const stats = await statsRes.json();

    res.json({
      network: {
        node_count: stats.latest?.node_count,
        channel_count: stats.latest?.channel_count,
        total_capacity_btc: stats.latest?.total_capacity ? stats.latest.total_capacity / 100_000_000 : null,
        average_channel_size_sats: stats.latest?.avg_capacity,
        median_channel_size_sats: stats.latest?.med_capacity,
      },
      timestamp: new Date().toISOString(),
      source: "mempool.space",
    });
  } catch (error) {
    console.error("[crypto/lightning] Error:", error.message);
    res.status(502).json({ error: "Failed to fetch Lightning stats", details: error.message });
  }
});

export default router;
