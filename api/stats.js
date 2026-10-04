// GET /api/stats — aggregate usage read back from Supabase. Never returns rows.

import { getStore } from "../lib/supabase.js";

export function makeHandler(deps = {}) {
  const getStoreFn = deps.getStore || getStore;
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const store = getStoreFn();
    if (!store) return res.status(503).json({ error: "unavailable" });
    try {
      const stats = await store.stats();
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      // Everyone using this site today is trying the demo; label it honestly.
      return res.status(200).json({ ...stats, label: "demo_activity" });
    } catch (e) {
      console.error("[stats]", e.message);
      return res.status(503).json({ error: "unavailable" });
    }
  };
}

export default makeHandler();
