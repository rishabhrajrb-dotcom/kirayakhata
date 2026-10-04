# KirayaKhata · किरायाखाता

A simple rent and tax compliance assistant for small Indian landlords. It answers two questions before anything else: **Am I okay?** and **What do I need to do next?**

> Status: **Phase 1, landing page.** The working "Close this month's rent" feature (Vercel `/api`, deterministic rules, Gemini explanation, Supabase logging) is Phase 2. The full README (architecture, setup, guardrails, rules governance) comes with Phase 2.

## Run locally

```bash
npm run dev     # serves ./public on http://localhost:3000
npm test        # node --test
```

## Layout (so far)

```
public/        static site (index.html, styles.css, app.js, i18n.js)
tests/         node --test suites
vercel.json    static output from ./public; /api functions arrive in Phase 2
.env.example   server-side variable names only, values blank
```

Prepared for review. Tax treatment may depend on individual facts.
