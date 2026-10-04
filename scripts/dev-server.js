// Local development server that mimics Vercel: serves ./public and routes
// /api/<name> to api/<name>.js with a Vercel-style req/res.
// Usage: npm run dev   (reads .env if present)
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 3000);

if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]] && m[2] !== "") process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" };

function enhance(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json"); res.end(JSON.stringify(b)); return res; };
  return res;
}

// Apply the same security headers Vercel will send (from vercel.json).
const VERCEL_HEADERS = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).headers?.[0]?.headers || [];

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  for (const h of VERCEL_HEADERS) res.setHeader(h.key, h.value);
  try {
    const api = url.pathname.match(/^\/api\/([a-z0-9-]+)$/);
    if (api) {
      const file = join(root, "api", `${api[1]}.js`);
      if (!existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      req.body = raw && (req.headers["content-type"] || "").includes("application/json") ? JSON.parse(raw) : raw || undefined;
      req.query = Object.fromEntries(url.searchParams);
      const mod = await import(`${file}?t=${Date.now()}`);
      return await mod.default(req, enhance(res));
    }
    // static: /shared from repo root (so edits show without a build), rest from public/
    let path = decodeURIComponent(url.pathname);
    let base = join(root, "public");
    if (path.startsWith("/shared/")) { base = root; }
    if (path.startsWith("/vendor/jspdf")) { base = join(root, "node_modules/jspdf/dist"); path = "/jspdf.umd.min.js"; }
    let file = normalize(join(base, path));
    if (!file.startsWith(base)) { res.statusCode = 403; return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end("Server error");
  }
}).listen(PORT, () => console.log(`KirayaKhata dev server on http://localhost:${PORT}`));
