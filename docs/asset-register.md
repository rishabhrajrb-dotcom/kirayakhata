# KirayaKhata — visual asset register

## What this build uses
All landing-page visuals are **original HTML / CSS / inline SVG**, not sourced photos:

| Placement | Asset | Source / provenance | Licence |
|---|---|---|---|
| Favicon / nav mark | Ledger-key SVG (inline) | Original, drawn in code | Project-owned |
| Hero composition | Invoice card + payment-check card + task chip | Original HTML/CSS from the demo data (readable, consistent with the app) | Project-owned |
| Ambient lighting | Radial rose/violet CSS glows | Original CSS | Project-owned |
| Invoice studio | 3 live invoice previews + draft PDFs | Rendered from the app (jsPDF) with identical demo data | Project-owned |
| Calendar / year-end | App calendar component + CSS cards with emoji icons | Original | Project-owned |
| Footer | Oversized CSS wordmark | Original | Project-owned |

**No external stock or AI-generated images were downloaded or embedded.** The build environment has restricted outbound network access, and no image-generation tool was available in this session. Rather than ship unverified-licence images or broken links, the page is built entirely from original SVG/CSS so it is safe to publish as-is.

## Starter prompts for optional future images
If you later want photographic/illustrative assets (e.g. a human-context image for the “monthly routine” section), generate them yourself and drop them in `public/assets/`. Suggested prompts (4:3 unless noted):

1. **Human context (4:3)** — “Editorial photograph for KirayaKhata, an Indian small-landlord rent-records assistant. An older Indian property owner at a modest, tidy home-office desk, calmly organising a few lease papers beside a laptop and keys. Natural contemporary setting, respectful and realistic, soft warm light, restrained plum and marigold details, uncluttered composition with space at the left for website copy. No readable document text, logos, visible personal identifiers, government seals, or exaggerated luxury.”
2. **Hero supporting illustration (3:2)** — “Elegant editorial illustration for KirayaKhata: a small Indian shopfront and home, a key, blank invoice sheets, and a blank calendar arranged as a balanced still life. Near-black plum background, subtle rose/violet illumination, warm ivory paper, restrained marigold accents. Generous negative space for HTML product cards. No text, numbers, logos, fake interface, or government imagery.”
3. **Year-end organisation (4:3)** — “Editorial still-life illustration of a neatly organised rental ledger, blank invoice sheets, document folders, a property key and a small home/shop motif for KirayaKhata. Warm-paper background, ink/plum forms, small ledger-red and marigold accents, no readable text, financial numbers, logos, seals or identifiable information.”

### If you use the OpenAI image API
Create **your own** key at https://platform.openai.com/api-keys (quickstart: https://developers.openai.com/api/docs/quickstart). Claude cannot provide a shared key. Keep it as a **server-side** env var `OPENAI_API_KEY` only — never in browser code, HTML, the repo, screenshots, logs, or chat. A blank `.env.example` entry is enough. Generate assets once, optimise them, and serve the finished files from `public/assets/`; do not call the API when a visitor opens the page. If you add asset origins, update the CSP `img-src` accordingly (today all images are inline/local).

## Checklist when adding real images
- Record source URL + licence/attribution here for every sourced image; generation prompt + provenance for generated ones.
- Set explicit `width`/`height`, `loading="lazy"` below the fold, meaningful `alt` (empty `alt=""` for decorative).
- Never label a stock/generated person as a real customer.
- Inspect at 390px and 1280px for crop, artefacts and relevance.
