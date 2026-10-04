// Vercel build: publish shared modules and jsPDF next to the static site.
// shared/ is the single source of truth; public/shared is a generated copy.
import { cpSync, mkdirSync, rmSync, readdirSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
rmSync(`${root}public/shared`, { recursive: true, force: true });
mkdirSync(`${root}public/shared`, { recursive: true });
for (const f of readdirSync(`${root}shared`)) {
  if (f === "schemas.js") continue; // server-only (imports zod)
  cpSync(`${root}shared/${f}`, `${root}public/shared/${f}`);
}
mkdirSync(`${root}public/vendor`, { recursive: true });
cpSync(`${root}node_modules/jspdf/dist/jspdf.umd.min.js`, `${root}public/vendor/jspdf.umd.min.js`);
console.log("build: copied shared/ and jsPDF into public/");
