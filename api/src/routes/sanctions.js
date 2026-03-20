import { Router } from "express";
import {
  checkSanctions,
  searchAllLists,
  getStatus,
  getListsInfo,
  VALID_LISTS,
} from "../services/sanctions.js";
import { requireQuery } from "../middleware/validate.js";

const router = Router();

/**
 * GET /check?name=...&country=...&lists=ofac,eu,uk,un
 * Multi-jurisdiction sanctions screening.
 * lists param is optional — defaults to all.
 */
router.get("/check", requireQuery("name"), (req, res) => {
  const { name, country, lists: listsParam } = req.query;

  // Parse requested lists
  let requestedLists = null;
  if (listsParam) {
    requestedLists = listsParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const invalid = requestedLists.filter((l) => !VALID_LISTS.includes(l));
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Invalid list(s): ${invalid.join(", ")}`,
        valid_lists: VALID_LISTS,
      });
    }
  }

  // Check if any requested list is loaded
  const status = getStatus();
  const listsToCheck = requestedLists || VALID_LISTS;
  const anyLoaded = listsToCheck.some(
    (l) => status.lists[l]?.loaded
  );

  if (!anyLoaded) {
    return res.status(503).json({
      error: "No sanctions lists are loaded yet",
      loading: status.loading,
      lists: Object.fromEntries(
        listsToCheck.map((l) => [
          l,
          {
            loading: status.lists[l]?.loading || false,
            last_error: status.lists[l]?.last_error || null,
          },
        ])
      ),
    });
  }

  try {
    const result = searchAllLists(
      name.trim(),
      country?.trim(),
      requestedLists
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /lists — available lists with entry counts and last update times
 */
router.get("/lists", (_req, res) => {
  res.json({
    lists: getListsInfo(),
    valid_list_codes: VALID_LISTS,
  });
});

/**
 * GET /status — full status of all lists
 */
router.get("/status", (_req, res) => {
  res.json(getStatus());
});

export default router;
