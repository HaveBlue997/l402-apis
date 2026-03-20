/**
 * WHOIS / Domain Intelligence service via RDAP.
 *
 * Data source: RDAP (Registration Data Access Protocol) — free, no API key.
 * - Primary: https://rdap.org/domain/DOMAIN (auto-routes to correct RDAP server)
 * - Fallback for .com/.net: https://rdap.verisign.com/com/v1/domain/DOMAIN
 *
 * Includes 1-hour in-memory cache (WHOIS data changes rarely).
 */

import punycode from "node:punycode";

const RDAP_BASE = "https://rdap.org/domain";
const VERISIGN_BASE = "https://rdap.verisign.com";
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache: key → { data, timestamp }
const cache = new Map();

// EPP status code → human-readable descriptions
const STATUS_DESCRIPTIONS = {
  "client delete prohibited": "Deletion locked by registrar",
  "client hold": "Domain suspended by registrar",
  "client renew prohibited": "Renewal locked by registrar",
  "client transfer prohibited": "Transfer locked by registrar",
  "client update prohibited": "Updates locked by registrar",
  "server delete prohibited": "Deletion locked by registry",
  "server hold": "Domain suspended by registry",
  "server renew prohibited": "Renewal locked by registry",
  "server transfer prohibited": "Transfer locked by registry",
  "server update prohibited": "Updates locked by registry",
  active: "Domain is active",
  inactive: "Domain is inactive",
  "pending create": "Registration pending",
  "pending delete": "Deletion pending",
  "pending renew": "Renewal pending",
  "pending restore": "Restore pending",
  "pending transfer": "Transfer pending",
  "pending update": "Update pending",
  "redemption period": "Domain in redemption period",
  "auto renew period": "Auto-renewal grace period",
  "add period": "Initial registration grace period",
  "renew period": "Renewal grace period",
  "transfer period": "Post-transfer grace period",
};

// Domain validation regex (basic — allows IDN after punycode conversion)
const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

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

function normalizeDomain(domain) {
  let d = domain.trim().toLowerCase();
  // Strip protocol if accidentally included
  d = d.replace(/^https?:\/\//, "");
  // Strip trailing slash/path
  d = d.split("/")[0];
  // Convert IDN to punycode
  try {
    d = punycode.toASCII(d);
  } catch {
    // already ASCII or invalid — validation will catch it
  }
  return d;
}

function validateDomain(domain) {
  if (!domain || typeof domain !== "string") {
    return { valid: false, error: "Domain is required" };
  }
  const normalized = normalizeDomain(domain);
  if (!DOMAIN_RE.test(normalized)) {
    return { valid: false, error: `Invalid domain format: "${domain}"` };
  }
  return { valid: true, domain: normalized };
}

function mapStatus(statusString) {
  // RDAP status values look like "client transfer prohibited" or have URL prefixes
  const normalized = statusString
    .replace(/^https?:\/\/icann\.org\/epp#/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();

  return {
    code: statusString,
    description: STATUS_DESCRIPTIONS[normalized] || normalized,
  };
}

function extractRegistrar(entities) {
  if (!Array.isArray(entities)) return null;
  for (const entity of entities) {
    const roles = entity.roles || [];
    if (roles.includes("registrar")) {
      // Try vcardArray first, then publicIds, then handle
      const vcard = entity.vcardArray;
      if (Array.isArray(vcard) && vcard[1]) {
        const fnEntry = vcard[1].find((e) => e[0] === "fn");
        if (fnEntry) return fnEntry[3];
      }
      if (entity.publicIds?.[0]?.identifier) {
        return `IANA ID: ${entity.publicIds[0].identifier}`;
      }
      return entity.handle || null;
    }
  }
  return null;
}

function extractDates(events) {
  const dates = {};
  if (!Array.isArray(events)) return dates;
  for (const event of events) {
    switch (event.eventAction) {
      case "registration":
        dates.creation_date = event.eventDate;
        break;
      case "expiration":
        dates.expiry_date = event.eventDate;
        break;
      case "last changed":
      case "last update of RDAP database":
        if (!dates.updated_date) dates.updated_date = event.eventDate;
        break;
    }
  }
  return dates;
}

function extractNameservers(nameservers) {
  if (!Array.isArray(nameservers)) return [];
  return nameservers.map((ns) => ns.ldhName || ns.unicodeName || ns.handle).filter(Boolean);
}

function parseRdapResponse(data, domain) {
  const dates = extractDates(data.events);
  const statuses = (data.status || []).map(mapStatus);
  const nameservers = extractNameservers(data.nameservers);
  const registrar = extractRegistrar(data.entities);

  // DNSSEC: check secureDNS object
  let dnssec = "unknown";
  if (data.secureDNS) {
    if (data.secureDNS.delegationSigned) dnssec = "signed";
    else dnssec = "unsigned";
  }

  return {
    domain: data.ldhName || domain,
    unicode_name: data.unicodeName || null,
    registrar,
    creation_date: dates.creation_date || null,
    expiry_date: dates.expiry_date || null,
    updated_date: dates.updated_date || null,
    nameservers,
    status: statuses,
    dnssec,
    rdap_server: data.port43 || null,
    looked_up_at: new Date().toISOString(),
  };
}

async function fetchRdap(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/rdap+json, application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  return response;
}

/**
 * Full RDAP domain lookup. Returns structured WHOIS-like data.
 */
export async function lookupDomain(domain) {
  const validation = validateDomain(domain);
  if (!validation.valid) {
    return { error: validation.error, status: 400 };
  }

  const normalized = validation.domain;
  const cacheKey = `lookup:${normalized}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, _cached: true };
  }

  // Try rdap.org first (auto-routes per TLD)
  let response;
  try {
    response = await fetchRdap(`${RDAP_BASE}/${normalized}`);
  } catch (err) {
    // Timeout or network error — try Verisign fallback for .com/.net
    const tld = normalized.split(".").pop();
    if (tld === "com" || tld === "net") {
      try {
        response = await fetchRdap(`${VERISIGN_BASE}/${tld}/v1/domain/${normalized}`);
      } catch (fallbackErr) {
        return {
          error: "RDAP lookup failed",
          detail: fallbackErr.name === "TimeoutError" ? "Request timed out (10s)" : fallbackErr.message,
          status: 502,
        };
      }
    } else {
      return {
        error: "RDAP lookup failed",
        detail: err.name === "TimeoutError" ? "Request timed out (10s)" : err.message,
        status: 502,
      };
    }
  }

  if (response.status === 404) {
    return {
      error: "Domain not found in RDAP",
      domain: normalized,
      detail: "Domain may not be registered or RDAP data is unavailable for this TLD",
      status: 404,
    };
  }

  if (response.status === 429) {
    return {
      error: "Rate limited by RDAP server",
      detail: "Too many requests. Please try again later.",
      status: 429,
    };
  }

  if (!response.ok) {
    return {
      error: `RDAP server returned ${response.status}`,
      detail: response.statusText || "Unknown error",
      status: 502,
    };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return {
      error: "Failed to parse RDAP response",
      status: 502,
    };
  }

  const result = parseRdapResponse(body, normalized);
  setCache(cacheKey, result);
  return result;
}

/**
 * Quick domain availability check.
 * Returns { available: true/false, domain } or error.
 */
export async function checkAvailability(domain) {
  const validation = validateDomain(domain);
  if (!validation.valid) {
    return { error: validation.error, status: 400 };
  }

  const normalized = validation.domain;
  const cacheKey = `avail:${normalized}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, _cached: true };
  }

  let response;
  try {
    response = await fetchRdap(`${RDAP_BASE}/${normalized}`);
  } catch (err) {
    return {
      error: "RDAP lookup failed",
      detail: err.name === "TimeoutError" ? "Request timed out (10s)" : err.message,
      status: 502,
    };
  }

  let result;
  if (response.status === 404) {
    result = {
      domain: normalized,
      available: true,
      checked_at: new Date().toISOString(),
    };
  } else if (response.ok) {
    result = {
      domain: normalized,
      available: false,
      checked_at: new Date().toISOString(),
    };
  } else if (response.status === 429) {
    return {
      error: "Rate limited by RDAP server",
      detail: "Too many requests. Please try again later.",
      status: 429,
    };
  } else {
    return {
      error: `RDAP server returned ${response.status}`,
      detail: response.statusText || "Unknown error",
      status: 502,
    };
  }

  setCache(cacheKey, result);
  return result;
}
