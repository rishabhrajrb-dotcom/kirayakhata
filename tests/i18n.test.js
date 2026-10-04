import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRINGS } from "../public/i18n.js";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("English and Hindi have exactly the same keys", () => {
  const en = Object.keys(STRINGS.en).sort();
  const hi = Object.keys(STRINGS.hi).sort();
  assert.deepEqual(hi, en);
});

test("no translation is empty", () => {
  for (const [lang, dict] of Object.entries(STRINGS)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.ok(value.trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test("every data-i18n key used in the page exists in the dictionary", () => {
  const used = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 50, "expected the page to be translated");
  for (const key of new Set(used)) {
    assert.ok(key in STRINGS.en, `missing key: ${key}`);
  }
});

test("page never claims filing, payment or government verification", () => {
  const all = [html, ...Object.values(STRINGS.en)].join("\n").toLowerCase();
  for (const phrase of ["has been filed", "return filed", "verified by gstn", "tax paid", "fully compliant"]) {
    assert.ok(!all.includes(phrase), `forbidden claim found: "${phrase}"`);
  }
});

test("no secrets or direct third-party API calls in frontend", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  for (const src of [html, app]) {
    assert.ok(!/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|generativelanguage\.googleapis|supabase\.co/i.test(src));
  }
});
