// POST /api/close-month
// validate → cap → deterministic rules → Gemini explains approved facts →
// validate explanation (or fall back) → log to Supabase → respond.

import { createHash } from "node:crypto";
import { CloseMonthInput, firstIssue } from "../shared/schemas.js";
import { closeMonth } from "../shared/rules.js";
import { cleanNote, inspectNote } from "../lib/sanitize.js";
import { buildUserMessage, allowedNumbers, fallbackExplanation } from "../lib/prompt.js";
import { callGemini, validateExplanation, modelName } from "../lib/gemini.js";
import { getStore } from "../lib/supabase.js";
import { visitorId, checkCap } from "../lib/rate-limit.js";

const MAX_BODY = 8 * 1024;

const CAP_MESSAGE = {
  en: "You’ve used today’s 5 free checks. Your saved results are still available.",
  hi: "आज की 5 मुफ़्त जाँच पूरी हो गईं। आपके सहेजे हुए नतीजे अब भी उपलब्ध हैं।",
};

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (req.body.length > MAX_BODY) throw new Error("too_large");
    return JSON.parse(req.body);
  }
  return null;
}

/** What is stored: structured, anonymised input. No free text, no names. */
function anonymisedInput(input, noteInfo) {
  const { note, ...rest } = input;
  return { ...rest, note_meta: noteInfo };
}

/** Compact rules result for storage (tasks trimmed to ids and dates). */
function storedResult(r) {
  return {
    status: r.status,
    period: r.period.month,
    scenario: r.scenario,
    amounts: r.amounts,
    checks: r.checks,
    flags: r.flags,
    next_tasks: r.next_tasks.map((t) => ({ id: t.id, due_date: t.due_date, status: t.status })),
  };
}

export function makeHandler(deps = {}) {
  const getStoreFn = deps.getStore || getStore;
  const gemini = deps.callGemini || callGemini;
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }

    let body;
    try {
      body = parseBody(req);
    } catch {
      return res.status(400).json({ error: "invalid_json", message: "Could not read the details sent." });
    }
    if (!body || JSON.stringify(body).length > MAX_BODY) {
      return res.status(400).json({ error: "invalid_input", message: "Request is empty or too large." });
    }

    const parsed = CloseMonthInput.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", message: firstIssue(parsed.error) });
    }
    const input = parsed.data;
    const lang = input.language;

    const store = getStoreFn();
    if (!store) {
      return res.status(503).json({ error: "unavailable", message: "The checker is temporarily unavailable. Please try again later." });
    }

    const vid = visitorId(req, res);
    let cap;
    try {
      cap = await checkCap(store, vid, now());
    } catch (e) {
      console.error("[close-month] cap check failed", e.message);
      return res.status(503).json({ error: "unavailable", message: "The checker is temporarily unavailable. Please try again later." });
    }
    if (!cap.allowed) {
      return res.status(429).json({ error: "capped", message: CAP_MESSAGE[lang] });
    }

    // Authoritative deterministic result.
    const result = closeMonth(input);

    // Free text: cleaned, inspected, sent to Gemini as data only, never stored.
    const note = cleanNote(input.note);
    const inspection = inspectNote(note);

    const gem = await gemini(buildUserMessage(result, note, lang));
    let explanation;
    let usedFallback = false;
    let validationError = null;
    if (gem.raw) {
      const v = validateExplanation(gem.raw, allowedNumbers(result));
      if (v.ok) explanation = v.value;
      else validationError = v.reason;
    }
    if (!explanation) {
      usedFallback = true;
      explanation = fallbackExplanation(result, lang, inspection.refuse);
    }
    // Deterministic guardrail wins even if the model did not refuse.
    if (inspection.refuse && !explanation.refused) {
      explanation = { ...fallbackExplanation(result, lang, true), what_this_means: explanation.what_this_means };
    }

    const requestHash = createHash("sha256").update(JSON.stringify(anonymisedInput(input, null))).digest("hex");
    const row = {
      visitor_id: vid,
      input: anonymisedInput(input, { present: note.length > 0, length: note.length, flags: inspection.categories, injection: inspection.injection }),
      rules_result: storedResult(result),
      output: explanation,
      scenario_code: result.scenario.code,
      rent_amount: result.amounts.contractRent,
      language: lang,
      model: modelName(),
      input_tokens: gem.usage?.input ?? null,
      output_tokens: gem.usage?.output ?? null,
      latency_ms: gem.latencyMs,
      used_fallback: usedFallback,
      rules_version: result.rules_version,
      config_version: result.config_version,
      request_hash: requestHash,
      gemini_error_code: gem.errorCode || validationError,
      shortfall_amount: result.amounts.shortfall,
      tds_mismatch_amount: result.amounts.tdsMismatchAmount,
      refused: Boolean(explanation.refused),
      is_example: input.example,
      status: result.status,
    };
    let logged = true;
    try {
      await store.insertClosure(row);
    } catch (e) {
      logged = false;
      console.error("[close-month] log failed", e.message);
    }

    return res.status(200).json({
      result,
      explanation,
      meta: {
        used_fallback: usedFallback,
        model: modelName(),
        remaining_today: Math.max(0, cap.remaining - 1),
        logged,
      },
    });
  };
}

export default makeHandler();
