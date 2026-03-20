import { parse } from "csv-parse";
import { XMLParser } from "fast-xml-parser";

// --- Data source URLs ---
const SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
const EU_URL =
  "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw";
const UK_URL =
  "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv";
const UN_URL =
  "https://scsanctions.un.org/resources/xml/en/consolidated.xml";

// --- Per-list state ---
const lists = {
  ofac: { entries: [], lastUpdated: null, loading: false, lastError: null },
  eu: { entries: [], lastUpdated: null, loading: false, lastError: null },
  uk: { entries: [], lastUpdated: null, loading: false, lastError: null },
  un: { entries: [], lastUpdated: null, loading: false, lastError: null },
};

const VALID_LISTS = Object.keys(lists);

// --- Shared helpers ---

function normalizeForSearch(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

// --- OFAC SDN loader ---

export async function loadOFACList() {
  const list = lists.ofac;
  if (list.loading) return;
  list.loading = true;
  list.lastError = null;

  try {
    const response = await fetch(SDN_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    const entries = [];

    const parser = parse(csvText, {
      relax_column_count: true,
      skip_empty_lines: true,
    });

    for await (const record of parser) {
      if (!record[1]) continue;

      const name = record[1].trim();
      entries.push({
        name,
        aliases: [],
        type: (record[2] || "").trim().toLowerCase() || "unknown",
        list_source: "ofac",
        programs: (record[3] || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
        country: "",
        date_listed: null,
        remarks: (record[11] || "").trim(),
        name_normalized: normalizeForSearch(name),
      });
    }

    list.entries = entries;
    list.lastUpdated = new Date().toISOString();
    console.log(`[sanctions:ofac] Loaded ${entries.length} entries`);
  } catch (err) {
    list.lastError = err.message;
    console.error(`[sanctions:ofac] Failed to load: ${err.message}`);
    if (list.entries.length === 0) throw err;
  } finally {
    list.loading = false;
  }
}

// --- EU Consolidated Sanctions loader ---

export async function loadEUList() {
  const list = lists.eu;
  if (list.loading) return;
  list.loading = true;
  list.lastError = null;

  try {
    const response = await fetch(EU_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      processEntities: false,
    });
    const doc = xmlParser.parse(xmlText);

    const entries = [];
    const root = doc.export || doc;
    const sanctionEntities = toArray(root.sanctionEntity || []);

    for (const entity of sanctionEntities) {
      const nameAliases = toArray(entity.nameAlias || []);
      // Primary name: first nameAlias with wholeName
      const primaryAlias = nameAliases.find(
        (n) => n["@_wholeName"] || n.wholeName
      );
      const primaryName =
        primaryAlias?.["@_wholeName"] ||
        primaryAlias?.wholeName ||
        "";
      if (!primaryName) continue;

      const aliases = nameAliases
        .filter((n) => n !== primaryAlias)
        .map((n) => n["@_wholeName"] || n.wholeName || "")
        .filter(Boolean);

      // Subject type from attribute
      const subjectType = (
        entity.subjectType?.["@_code"] ||
        entity.subjectType?.code ||
        entity["@_subjectType"] ||
        ""
      )
        .toString()
        .toLowerCase();
      const type = subjectType.includes("person")
        ? "individual"
        : subjectType.includes("enterprise") || subjectType.includes("entity")
          ? "entity"
          : "unknown";

      // Programmes / regulations
      const regulations = toArray(entity.regulation || []);
      const programs = regulations
        .map((r) => r["@_numberTitle"] || r.numberTitle || "")
        .filter(Boolean)
        .slice(0, 3); // limit to keep size reasonable

      // Citizenship / country
      const citizenships = toArray(entity.citizenship || []);
      const country =
        citizenships[0]?.["@_countryDescription"] ||
        citizenships[0]?.countryDescription ||
        "";

      // Remark
      const remark = entity.remark || "";

      entries.push({
        name: primaryName,
        aliases,
        type,
        list_source: "eu",
        programs,
        country: typeof country === "string" ? country : "",
        date_listed: null,
        remarks: typeof remark === "string" ? remark : "",
        name_normalized: normalizeForSearch(primaryName),
        aliases_normalized: aliases.map(normalizeForSearch),
      });
    }

    list.entries = entries;
    list.lastUpdated = new Date().toISOString();
    console.log(`[sanctions:eu] Loaded ${entries.length} entries`);
  } catch (err) {
    list.lastError = err.message;
    console.error(`[sanctions:eu] Failed to load: ${err.message}`);
    if (list.entries.length === 0) throw err;
  } finally {
    list.loading = false;
  }
}

// --- UK OFSI loader (CSV) ---

export async function loadUKList() {
  const list = lists.uk;
  if (list.loading) return;
  list.loading = true;
  list.lastError = null;

  try {
    const response = await fetch(UK_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    const entries = [];

    // UK CSV has a metadata line ("Last Updated,date") before the real headers — skip it
    const csvBody = csvText.replace(/^Last Updated,[^\n]*\n/, "");

    const parser = parse(csvBody, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    for await (const record of parser) {
      // OFSI CSV columns: Name 6 (full name), Group Type, Listed On, ...
      const fullName =
        record["Name 6"] ||
        [record["Name 1"], record["Name 2"], record["Name 3"]]
          .filter(Boolean)
          .join(" ") ||
        "";
      if (!fullName.trim()) continue;

      const name = fullName.trim();
      const aliases = [];
      // Name 6 variants in alias columns
      for (let i = 1; i <= 6; i++) {
        const aliasKey = `Alias ${i}`;
        if (record[aliasKey]?.trim()) {
          aliases.push(record[aliasKey].trim());
        }
      }

      const groupType = (record["Group Type"] || "").toLowerCase();
      const type = groupType.includes("individual")
        ? "individual"
        : groupType.includes("entity") || groupType.includes("ship")
          ? "entity"
          : "unknown";

      entries.push({
        name,
        aliases,
        type,
        list_source: "uk",
        programs: [record["Regime"] || record["Group ID"] || ""]
          .filter(Boolean),
        country: (record["Country"] || "").trim(),
        date_listed: record["Listed On"] || record["Date Listed"] || null,
        name_normalized: normalizeForSearch(name),
        aliases_normalized: aliases.map(normalizeForSearch),
      });
    }

    list.entries = entries;
    list.lastUpdated = new Date().toISOString();
    console.log(`[sanctions:uk] Loaded ${entries.length} entries`);
  } catch (err) {
    list.lastError = err.message;
    console.error(`[sanctions:uk] Failed to load: ${err.message}`);
    if (list.entries.length === 0) throw err;
  } finally {
    list.loading = false;
  }
}

// --- UN Security Council loader (XML) ---

export async function loadUNList() {
  const list = lists.un;
  if (list.loading) return;
  list.loading = true;
  list.lastError = null;

  try {
    const response = await fetch(UN_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const doc = xmlParser.parse(xmlText);

    const entries = [];

    // UN XML: CONSOLIDATED_LIST > INDIVIDUALS > INDIVIDUAL[] and ENTITIES > ENTITY[]
    const root = doc.CONSOLIDATED_LIST || doc.consolidated_list || doc;

    const individuals = toArray(
      root.INDIVIDUALS?.INDIVIDUAL || root.individuals?.individual || []
    );
    for (const ind of individuals) {
      const firstName = ind.FIRST_NAME || ind.first_name || "";
      const secondName = ind.SECOND_NAME || ind.second_name || "";
      const thirdName = ind.THIRD_NAME || ind.third_name || "";
      const name = [firstName, secondName, thirdName]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!name) continue;

      const aliasEntries = toArray(
        ind.INDIVIDUAL_ALIAS || ind.individual_alias || []
      );
      const aliases = aliasEntries
        .map((a) => a.ALIAS_NAME || a.alias_name || "")
        .filter(Boolean);

      const dateListed =
        ind.LISTED_ON || ind.listed_on || null;
      const comments = ind.COMMENTS1 || ind.comments1 || "";
      const nationality = toArray(
        ind.NATIONALITY?.VALUE || ind.nationality?.value || []
      );

      entries.push({
        name,
        aliases,
        type: "individual",
        list_source: "un",
        programs: [ind.UN_LIST_TYPE || ind.un_list_type || ""].filter(Boolean),
        country: nationality[0] || "",
        date_listed: dateListed,
        remarks: typeof comments === "string" ? comments : "",
        name_normalized: normalizeForSearch(name),
        aliases_normalized: aliases.map(normalizeForSearch),
      });
    }

    const entities = toArray(
      root.ENTITIES?.ENTITY || root.entities?.entity || []
    );
    for (const ent of entities) {
      const name = (ent.FIRST_NAME || ent.first_name || ent.NAME || ent.name || "").trim();
      if (!name) continue;

      const aliasEntries = toArray(
        ent.ENTITY_ALIAS || ent.entity_alias || []
      );
      const aliases = aliasEntries
        .map((a) => a.ALIAS_NAME || a.alias_name || "")
        .filter(Boolean);

      const dateListed =
        ent.LISTED_ON || ent.listed_on || null;

      entries.push({
        name,
        aliases,
        type: "entity",
        list_source: "un",
        programs: [ent.UN_LIST_TYPE || ent.un_list_type || ""].filter(Boolean),
        country: "",
        date_listed: dateListed,
        name_normalized: normalizeForSearch(name),
        aliases_normalized: aliases.map(normalizeForSearch),
      });
    }

    list.entries = entries;
    list.lastUpdated = new Date().toISOString();
    console.log(`[sanctions:un] Loaded ${entries.length} entries`);
  } catch (err) {
    list.lastError = err.message;
    console.error(`[sanctions:un] Failed to load: ${err.message}`);
    if (list.entries.length === 0) throw err;
  } finally {
    list.loading = false;
  }
}

// --- Loader map ---

const loaders = {
  ofac: loadOFACList,
  eu: loadEUList,
  uk: loadUKList,
  un: loadUNList,
};

// --- Combined loader (parallel, graceful degradation) ---

export async function loadAllLists() {
  const results = await Promise.allSettled(
    VALID_LISTS.map((key) => loaders[key]())
  );

  const loaded = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      loaded.push(VALID_LISTS[i]);
    } else {
      failed.push(VALID_LISTS[i]);
    }
  });

  console.log(
    `[sanctions] Lists loaded: ${loaded.join(", ") || "none"}` +
      (failed.length ? ` | Failed: ${failed.join(", ")}` : "")
  );

  return { loaded, failed };
}

// --- Search ---

function searchList(listKey, searchName, searchCountry) {
  const list = lists[listKey];
  if (!list || list.entries.length === 0) return null;

  const matches = list.entries.filter((entry) => {
    // Check primary name
    const nameMatch =
      entry.name_normalized.includes(searchName) ||
      searchName.includes(entry.name_normalized);

    // Check aliases too
    const aliasMatch =
      !nameMatch &&
      entry.aliases_normalized?.some(
        (a) => a.includes(searchName) || searchName.includes(a)
      );

    if (!nameMatch && !aliasMatch) return false;

    // Country filter
    if (searchCountry) {
      const countryNorm = normalizeForSearch(entry.country);
      const remarksNorm = normalizeForSearch(entry.remarks || "");
      return (
        countryNorm.includes(searchCountry) ||
        remarksNorm.includes(searchCountry)
      );
    }

    return true;
  });

  return {
    list: listKey,
    entries: matches.map((e) => ({
      name: e.name,
      aliases: e.aliases,
      type: e.type,
      list_source: e.list_source,
      programs: e.programs,
      country: e.country,
      date_listed: e.date_listed,
    })),
  };
}

export function searchAllLists(name, country, requestedLists) {
  const searchName = normalizeForSearch(name);
  const searchCountry = country ? normalizeForSearch(country) : null;
  const listsToSearch = requestedLists || VALID_LISTS;

  const results = [];
  let anyMatch = false;
  const unavailable = [];

  for (const key of listsToSearch) {
    const result = searchList(key, searchName, searchCountry);
    if (result === null) {
      unavailable.push(key);
      continue;
    }
    if (result.entries.length > 0) anyMatch = true;
    results.push(result);
  }

  return {
    match: anyMatch,
    results,
    unavailable_lists: unavailable.length > 0 ? unavailable : undefined,
    checked_at: new Date().toISOString(),
    lists_searched: listsToSearch,
  };
}

// --- Backward-compatible OFAC-only check ---

export function checkSanctions(name, country) {
  if (lists.ofac.entries.length === 0) {
    throw new Error("SDN list not loaded");
  }

  const searchName = normalizeForSearch(name);
  const searchCountry = country ? normalizeForSearch(country) : null;

  const matches = lists.ofac.entries.filter((entry) => {
    const nameMatch =
      entry.name_normalized.includes(searchName) ||
      searchName.includes(entry.name_normalized);

    if (!nameMatch) return false;

    if (searchCountry) {
      const remarksNorm = normalizeForSearch(entry.remarks || "");
      return remarksNorm.includes(searchCountry);
    }

    return true;
  });

  return {
    match: matches.length > 0,
    entries: matches.map((e) => ({
      name: e.name,
      type: e.type,
      programs: e.programs,
      country: e.country,
      remarks: e.remarks,
    })),
    checked_at: new Date().toISOString(),
    list_version: lists.ofac.lastUpdated,
    total_entries_in_list: lists.ofac.entries.length,
  };
}

// --- Status ---

export function getStatus() {
  const perList = {};
  for (const key of VALID_LISTS) {
    const l = lists[key];
    perList[key] = {
      loaded: l.entries.length > 0,
      entry_count: l.entries.length,
      last_updated: l.lastUpdated,
      loading: l.loading,
      last_error: l.lastError,
    };
  }

  const totalEntries = VALID_LISTS.reduce(
    (sum, k) => sum + lists[k].entries.length,
    0
  );

  return {
    total_entries: totalEntries,
    lists: perList,
    // backward compat
    loaded: lists.ofac.entries.length > 0,
    entry_count: lists.ofac.entries.length,
    list_version: lists.ofac.lastUpdated,
    loading: VALID_LISTS.some((k) => lists[k].loading),
    last_error: lists.ofac.lastError,
  };
}

export function getListsInfo() {
  const result = {};
  for (const key of VALID_LISTS) {
    const l = lists[key];
    result[key] = {
      available: l.entries.length > 0,
      entry_count: l.entries.length,
      last_updated: l.lastUpdated,
      loading: l.loading,
      last_error: l.lastError,
    };
  }
  return result;
}

// --- Refresh timers (staggered) ---

export function startRefreshTimer(intervalHours = 24) {
  const ms = intervalHours * 60 * 60 * 1000;

  // Stagger: OFAC at 0h, EU at +6h, UK at +12h, UN at +18h
  const staggerMs = ms / 4;

  VALID_LISTS.forEach((key, i) => {
    const timer = setTimeout(() => {
      // Initial staggered load, then repeating
      const interval = setInterval(() => {
        console.log(`[sanctions:${key}] Refreshing...`);
        loaders[key]();
      }, ms);
      interval.unref();
    }, i * staggerMs);
    timer.unref();
  });
}

// Re-export for backward compat
export { loadOFACList as loadSDNList };
export { VALID_LISTS };
