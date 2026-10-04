// Gemini explainer: calls the model with approved facts only, then validates
// the answer. Anything invalid (bad JSON, too long, invented numbers, false
// filing/payment claims) is rejected and the deterministic fallback is used.

import { GoogleGenAI } from "@google/genai";
import { ExplanationOutput } from "../shared/schemas.js";
import { SYSTEM_PROMPT, RESPONSE_SCHEMA } from "./prompt.js";

export const DEFAULT_MODEL = "gemini-2.5-flash-lite";
export const MAX_OUTPUT_TOKENS = 400;
export const TEMPERATURE = 0.2;
const TIMEOUT_MS = 8000; // keeps the whole request under ~10 s

export function modelName() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/** Calls Gemini. Returns { raw, usage, latencyMs, errorCode } — never throws. */
export async function callGemini(userMessage, { apiKey = process.env.GEMINI_API_KEY, client } = {}) {
  const started = Date.now();
  if (!apiKey && !client) return { raw: null, usage: null, latencyMs: 0, errorCode: "NO_API_KEY" };
  const ai = client || new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await ai.models.generateContent({
      model: modelName(),
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: controller.signal,
      },
    });
    return {
      raw: res.text ?? null,
      usage: {
        input: res.usageMetadata?.promptTokenCount ?? null,
        output: res.usageMetadata?.candidatesTokenCount ?? null,
      },
      latencyMs: Date.now() - started,
      errorCode: null,
    };
  } catch (err) {
    const code = controller.signal.aborted ? "TIMEOUT" : err?.status ? `HTTP_${err.status}` : "CALL_FAILED";
    return { raw: null, usage: null, latencyMs: Date.now() - started, errorCode: code };
  } finally {
    clearTimeout(timer);
  }
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const toAsciiDigits = (s) => s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

const FORBIDDEN = [
  /\b(has|have|was|were|been)\s+(been\s+)?(filed|submitted|paid|accepted|verified)\b/i,
  /\bfully compliant\b/i,
  /\bverified by (gstn|the government|income tax)\b/i,
  /\b(arn|acknowledgement number)\b/i,
  /(फ़ाइल|फाइल) (हो गया|कर दिया|हो चुका)/,
  /(भुगतान|जमा) (हो गया|कर दिया|हो चुका)/,
];

/**
 * Validates parsed model output against the schema and the facts.
 * Returns { ok, value, reason }.
 */
export function validateExplanation(raw, { amounts, percents }) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, reason: "BAD_JSON" };
  }
  const v = ExplanationOutput.safeParse(parsed);
  if (!v.success) return { ok: false, reason: "SCHEMA" };
  const out = v.data;
  const text = toAsciiDigits([out.what_this_means, ...out.do_next, out.refusal_reason || ""].join(" \n "));

  const words = out.what_this_means.trim().split(/\s+/).length;
  if (words > 130) return { ok: false, reason: "TOO_LONG" };
  if (FORBIDDEN.some((re) => re.test(text))) return { ok: false, reason: "FORBIDDEN_CLAIM" };

  // Every rupee amount mentioned must be one the rules engine produced.
  for (const m of text.matchAll(/(?:₹|rs\.?|inr|रु\.?)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)) {
    const n = Math.round(Number(m[1].replace(/,/g, "")) * 100) / 100;
    if (!amounts.has(n)) return { ok: false, reason: "UNAPPROVED_AMOUNT" };
  }
  // Every percentage mentioned must be an approved rate.
  for (const m of text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(%|percent|प्रतिशत)/gi)) {
    if (!percents.has(Number(m[1]))) return { ok: false, reason: "UNAPPROVED_RATE" };
  }
  return { ok: true, value: out };
}
