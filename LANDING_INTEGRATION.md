# KirayaKhata — landing page & integration notes

The landing page was redesigned into a dark editorial style (adapted from the supplied Finora-style reference video) while **preserving the existing app**: the deterministic rules engine, the `/api` backend contract, Supabase logging, Gemini explanation, and full English/Hindi.

## What works right now (in this repo / demo)
- **Landing page**: dark hero, numbered storytelling sections, feature service-rows (click/keyboard/touch), pale FAQ, oversized footer wordmark. Original SVG/CSS visuals.
- **Invoice Studio** (`#invoices`): 3 real templates (Classic Ledger / Modern Minimal / Professional Letterhead), live HTML preview + working draft PDF (jsPDF, “Rs.”, DRAFT/DEMO watermark, draft numbering, “Prepared — verify before filing.”). GST shown as an *addition* under forward charge; under reverse charge no GST is added and a note says the tenant pays it; document type follows the chosen treatment. Names/GSTINs stay in the browser. “Open email draft” = `mailto` only (attach the PDF yourself; never shows “sent”).
- **Check this month** (`#demo`): the existing 3-step feature, unchanged. Calls `/api/close-month` when deployed; uses the deterministic rules + Gemini explanation + 5/day cap.
- **Tax calendar** (`#calendar`): sample tasks from `shared/calendar.js` (monthly filer, Maharashtra) with form, period, due date, status, “Open GST portal” (new tab) + “What to do there” steps, and a working `.ics` export (5-day & 1-day reminders; a snapshot, not a live subscription).
- **Usage strip**: reads `/api/stats` when deployed; honest “Demo activity” label; “caught” defined transparently.

## Integration contract (preserved hooks)
IDs: `#demo #btn-example #btn-own #close-form #result #lang-toggle #u-rent #u-months #u-caught #u-common`. Events/attrs: `data-i18n`, `data-i18n-aria`, `kk:lang`. Header/hero `href="#demo"` loads the example; **“Enter my own details”** is a separate control (`#hero-own` / `#close-own`) that opens the own-details flow without loading the example. No handlers are double-bound (demo.js owns `#btn-example`/`#btn-own`; landing.js only forwards to them).

Files added/changed: `public/index.html` (redesigned, demo block preserved verbatim), `public/styles.css` (dark theme appended; paper surfaces kept for forms/results), `public/landing.js` (new glue; no tax logic), `public/pdf.js` (+3 invoice templates), `public/i18n-landing.js` (new strings), `public/i18n.js` (merge). Unchanged: `demo.js`, `app.js`, `shared/*` rules/calendar/config, `/api/*`.

## Needs production services (not built here)
- **Automatic invoice email / scheduled recurring billing**: needs a backend job, an email provider, authenticated tenant contacts with consent, delivery/failure status, duplicate-send prevention, unique property/period keys and versioned agreement terms. A browser demo cannot do unattended sending — it is marked “Planned for the full app”.
- **Year-end export pack** (Excel/PDF/ZIP): preview only; generated in the full app.
- **Government filing**: never. Mock adapters only (`lib/integrations/*`). The app prepares records and says “Marked as done by you”, never “filed/paid/verified”.
- **Tax rule verification**: all rules are `REQUIRES_CA_VERIFICATION`; see `docs/gst-tds-coverage-matrix.md`. The matrix classifies each scenario family as SUPPORTED / NEEDS_MORE_INFORMATION / NEEDS_SPECIALIST_REVIEW.

## Known honest limitations
- Official sources were not fetched/verified in this build (restricted network); they are starting points.
- No external images were sourced (restricted network + no image tool); visuals are original SVG/CSS; `docs/asset-register.md` has prompts for optional future assets.
- The Invoice Studio GST treatment is chosen by the user (a thin presentation mapping), not the full scenario engine; the `#demo` feature is where the deterministic scenario decision runs.
