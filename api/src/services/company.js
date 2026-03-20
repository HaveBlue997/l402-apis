/**
 * Company/business entity search service.
 *
 * Data sources:
 * - SEC EDGAR (US public companies) — free, no API key needed
 * - UK Companies House — free with API key (COMPANIES_HOUSE_API_KEY env var)
 *
 * Includes 10-minute in-memory cache to reduce API calls for repeated searches.
 */

const SEC_EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const SEC_EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions";
const COMPANIES_HOUSE_BASE = "https://api.company-information.service.gov.uk";

const SEC_USER_AGENT = "Velocibot/1.0 (velocitybotholemu@gmail.com)";
const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY || "";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory cache: key → { data, timestamp }
const cache = new Map();

// US state codes for jurisdiction routing
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
]);

function getCacheKey(jurisdiction, name) {
  return `${jurisdiction}:${name.toLowerCase().trim()}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function isUSJurisdiction(code) {
  return code === "US" || US_STATE_CODES.has(code);
}

function isUKJurisdiction(code) {
  return code === "GB" || code === "UK";
}

// --- SEC EDGAR (US) ---

async function searchSECEdgar(name, jurisdiction) {
  const url = `${SEC_EDGAR_SEARCH}?q=${encodeURIComponent(name)}&forms=10-K`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return {
      error: "SEC EDGAR API is unreachable",
      detail: err.message,
      results: [],
      jurisdiction,
      source: SEC_EDGAR_SEARCH,
      source_name: "SEC EDGAR",
      searched_at: new Date().toISOString(),
      data_source: "error",
    };
  }

  if (!response.ok) {
    const statusText = response.statusText || "Unknown error";
    return {
      error: `SEC EDGAR returned ${response.status}: ${statusText}`,
      detail: response.status === 429
        ? "Rate limit exceeded. SEC EDGAR allows 10 requests/second."
        : statusText,
      results: [],
      jurisdiction,
      source: SEC_EDGAR_SEARCH,
      source_name: "SEC EDGAR",
      searched_at: new Date().toISOString(),
      data_source: "error",
    };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return {
      error: "Failed to parse SEC EDGAR response",
      results: [],
      jurisdiction,
      source: SEC_EDGAR_SEARCH,
      source_name: "SEC EDGAR",
      searched_at: new Date().toISOString(),
      data_source: "error",
    };
  }

  const hits = body?.hits?.hits || [];

  // Deduplicate by CIK — EDGAR returns filing hits, not unique companies
  const seen = new Map();
  for (const hit of hits) {
    const src = hit._source || {};
    const cik = src.entity_id || src.file_num || null;
    if (cik && seen.has(cik)) continue;
    if (cik) seen.set(cik, src);
    else seen.set(`_no_cik_${seen.size}`, src);
  }

  const results = Array.from(seen.values()).map((src) => ({
    entity_name: src.entity_name || src.display_names?.[0] || "Unknown",
    entity_number: src.entity_id || null,
    status: "Active - Filing",
    formation_date: src.period_of_report || null,
    entity_type: src.form_type || "Public Company",
    jurisdiction,
    _mock: false,
    source: "sec_edgar",
  }));

  return {
    results,
    jurisdiction,
    source: SEC_EDGAR_SEARCH,
    source_name: "SEC EDGAR — US Public Companies",
    searched_at: new Date().toISOString(),
    data_source: "live",
    total_results: body?.hits?.total?.value || results.length,
  };
}

// --- UK Companies House ---

async function searchCompaniesHouse(name, jurisdiction) {
  if (!COMPANIES_HOUSE_API_KEY) {
    return {
      error: "UK company search requires API key (free at https://developer.company-information.service.gov.uk/)",
      detail: "Set the COMPANIES_HOUSE_API_KEY environment variable.",
      results: [],
      jurisdiction,
      source: COMPANIES_HOUSE_BASE,
      source_name: "Companies House",
      searched_at: new Date().toISOString(),
      data_source: "error",
    };
  }

  const url = `${COMPANIES_HOUSE_BASE}/search/companies?q=${encodeURIComponent(name)}`;
  const auth = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString("base64");

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return {
      error: "Companies House API is unreachable",
      detail: err.message,
      results: [],
      jurisdiction,
      source: COMPANIES_HOUSE_BASE,
      source_name: "Companies House",
      searched_at: new Date().toISOString(),
      data_source: "error",
    };
  }

  if (!response.ok) {
    const statusText = response.statusText || "Unknown error";
    return {
      error: `Companies House returned ${response.status}: ${statusText}`,
      detail: response.status === 429
        ? "Rate limit exceeded."
        : statusText,
      results: [],
      jurisdiction,
      source: COMPANIES_HOUSE_BASE,
      source_name: "Companies House",
      searched_at: new Date().toISOString(),
      data_source: "error",
    };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return {
      error: "Failed to parse Companies House response",
      results: [],
      jurisdiction,
      source: COMPANIES_HOUSE_BASE,
      source_name: "Companies House",
      searched_at: new Date().toISOString(),
      data_source: "error",
    };
  }

  const items = body?.items || [];
  const results = items.map((item) => ({
    entity_name: item.title || "Unknown",
    entity_number: item.company_number || null,
    status: item.company_status || "Unknown",
    formation_date: item.date_of_creation || null,
    entity_type: item.company_type || "Unknown",
    jurisdiction: "GB",
    registered_address: item.address_snippet || null,
    _mock: false,
    source: "companies_house",
  }));

  return {
    results,
    jurisdiction: "GB",
    source: COMPANIES_HOUSE_BASE,
    source_name: "Companies House — UK",
    searched_at: new Date().toISOString(),
    data_source: "live",
    total_results: body?.total_results || results.length,
  };
}

// --- Public API ---

export async function searchCompany(jurisdiction, name) {
  const code = jurisdiction.toUpperCase();

  const cacheKey = getCacheKey(code, name);
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, _cached: true };
  }

  let result;

  if (isUSJurisdiction(code)) {
    result = await searchSECEdgar(name, code);
  } else if (isUKJurisdiction(code)) {
    result = await searchCompaniesHouse(name, code);
  } else {
    return {
      error: `Jurisdiction "${jurisdiction}" is not supported`,
      supported_jurisdictions: ["US (SEC EDGAR)", "GB/UK (Companies House)"],
    };
  }

  if (!result.error) {
    setCache(cacheKey, result);
  }
  return result;
}

export function getSupportedJurisdictions() {
  return [
    {
      code: "US",
      name: "United States (all states)",
      source: "SEC EDGAR",
      free: true,
      api_key_required: false,
      note: "Covers US public companies that file with the SEC",
    },
    {
      code: "GB",
      aliases: ["UK"],
      name: "United Kingdom",
      source: "Companies House",
      free: true,
      api_key_required: true,
      api_key_env: "COMPANIES_HOUSE_API_KEY",
      note: "Free API key from https://developer.company-information.service.gov.uk/",
    },
  ];
}
