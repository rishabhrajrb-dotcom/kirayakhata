// Visitor identity (first-party cookie) and the per-visitor daily cap.
// This is demo abuse prevention, not production-grade identity: clearing
// cookies resets it.

import { randomUUID } from "node:crypto";

export const DAILY_CAP = 5;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
const COOKIE = "kk_vid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function isSecure(req) {
  return process.env.VERCEL_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
}

/** Returns the visitor id, issuing a new HttpOnly cookie when missing. */
export function visitorId(req, res) {
  const existing = readCookie(req.headers.cookie, COOKIE);
  if (existing && UUID_RE.test(existing)) return existing;
  const id = randomUUID();
  const attrs = [`${COOKIE}=${id}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${60 * 60 * 24 * 365}`];
  if (isSecure(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
  return id;
}

/** { allowed, used, remaining }. Counts stored requests in the rolling window. */
export async function checkCap(store, id, now = Date.now()) {
  const since = new Date(now - WINDOW_MS).toISOString();
  const used = await store.countRecent(id, since);
  return { allowed: used < DAILY_CAP, used, remaining: Math.max(0, DAILY_CAP - used) };
}
