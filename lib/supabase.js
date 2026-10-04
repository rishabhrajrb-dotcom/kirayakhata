// Storage for rent closures. Uses Supabase with the service key (server only).
// Without credentials outside production, an in-memory store is used so the
// app can be run and tested locally. In production, missing credentials are an
// error, never a silent fallback.

import { createClient } from "@supabase/supabase-js";

export const TABLE = "rent_closures";

function isProduction() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export function supabaseStore(client) {
  return {
    kind: "supabase",
    async insertClosure(row) {
      const { error } = await client.from(TABLE).insert(row);
      if (error) throw new Error(`supabase insert: ${error.message}`);
    },
    async countRecent(visitorId, sinceIso) {
      const { count, error } = await client
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("visitor_id", visitorId)
        .gte("created_at", sinceIso);
      if (error) throw new Error(`supabase count: ${error.message}`);
      return count ?? 0;
    },
    async stats() {
      const { data, error } = await client.rpc("kk_stats");
      if (error) throw new Error(`supabase stats: ${error.message}`);
      return normaliseStats(Array.isArray(data) ? data[0] : data);
    },
  };
}

export function memoryStore() {
  const rows = [];
  return {
    kind: "memory",
    rows,
    async insertClosure(row) {
      rows.push({ ...row, created_at: row.created_at || new Date().toISOString() });
    },
    async countRecent(visitorId, sinceIso) {
      return rows.filter((r) => r.visitor_id === visitorId && r.created_at >= sinceIso).length;
    },
    async stats() {
      const closed = rows.filter((r) => !r.refused);
      const freq = {};
      for (const r of closed) freq[r.scenario_code] = (freq[r.scenario_code] || 0) + 1;
      const most = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      return normaliseStats({
        total_rent_checked: closed.reduce((s, r) => s + Number(r.rent_amount || 0), 0),
        months_closed: closed.length,
        caught_amount: closed.reduce((s, r) => s + Number(r.shortfall_amount || 0) + Number(r.tds_mismatch_amount || 0), 0),
        most_common_scenario: most ? most[0] : null,
      });
    },
  };
}

function normaliseStats(d) {
  return {
    total_rent_checked: Number(d?.total_rent_checked || 0),
    months_closed: Number(d?.months_closed || 0),
    caught_amount: Number(d?.caught_amount || 0),
    most_common_scenario: d?.most_common_scenario || null,
  };
}

/** Accepts the URL with or without a trailing "/rest/v1/" (as the dashboard shows it). */
export function normaliseSupabaseUrl(raw) {
  return String(raw || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

let cached;
export function getStore() {
  if (cached !== undefined) return cached;
  const url = normaliseSupabaseUrl(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    cached = supabaseStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else if (!isProduction()) {
    console.warn("[kirayakhata] SUPABASE_URL/SUPABASE_SERVICE_KEY not set: using in-memory store (local only).");
    cached = memoryStore();
  } else {
    console.error("[kirayakhata] Supabase credentials missing in production.");
    cached = null;
  }
  return cached;
}
