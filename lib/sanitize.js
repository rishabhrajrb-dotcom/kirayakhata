// Cleans the optional free-text note and detects requests the product must
// refuse. This is a deterministic first line of defence; the Gemini system
// prompt is the second. Either one is enough to refuse.

import { MAX_NOTE } from "../shared/schemas.js";

export function cleanNote(raw) {
  return String(raw || "")
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOTE);
}

const EVASION_PATTERNS = [
  // understate / falsify amounts
  { cat: "understate", re: /\b(make|show|write|issue|put)\b[^.]{0,40}\b(receipt|invoice|bill|rent)\b[^.]{0,40}(\b(less|lower|smaller|only|rs\.?|inr)\b|₹)/i },
  { cat: "understate", re: /\b(understate|under-?report|reduce the (rent|amount) on|lower the (rent|amount) on|fake (receipt|invoice))/i },
  { cat: "understate", re: /(कम\s*(दिखा|लिख|बता)|kam\s*(dikha|likh|bata))/i },
  // hide income / evade
  { cat: "evade", re: /\b(hide|conceal|not (show|declare|report)|keep\b[^.]{0,20}\b(outside|out of)|avoid paying|evade|escape|dodge)\b[^.]{0,30}\b(gst|tax|income|rent|itr)\b/i },
  { cat: "evade", re: /\b(keep|stay|remain|be)\b[^.]{0,25}\b(outside|out of) (the )?(gst|tax)\b/i },
  { cat: "evade", re: /\b(avoid|evade|escape|dodge) (paying )?(gst|tax|income tax)\b/i },
  { cat: "evade", re: /\b(cash)\b[^.]{0,30}\b(no|without|avoid)\b[^.]{0,15}\b(gst|tax|record)/i },
  { cat: "evade", re: /(छुपा|छिपा|chhupa|chupa|chhipa)/i },
  // backdate
  { cat: "backdate", re: /\b(back-?date|ante-?date|earlier date|old date|change the date)\b/i },
  { cat: "backdate", re: /(पुरानी\s*तारीख|purani\s*(date|tareekh|tarikh))/i },
  // artificial splitting
  { cat: "split", re: /\bsplit\b[^.]{0,40}\b(rent|invoice|bill|payment)s?\b/i },
  { cat: "split", re: /\b(split|divide|break)\b[^.]{0,40}\b(below|under|avoid)\b[^.]{0,20}\b(threshold|limit|lakh|50,?000)\b/i },
];

const INJECTION_PATTERNS = [
  /\bignore\b[^.]{0,30}\b(instruction|rule|prompt|above|previous|earlier)s?\b/i,
  /\b(system prompt|developer message|you are now|act as|jailbreak|pretend)\b/i,
  /\bgst\b[^.]{0,20}\b(is|=|should be|at)\b\s*\d{1,2}\s*%/i,
  /\b(output|return|respond with)\b[^.]{0,20}\bjson\b/i,
];

export function inspectNote(note) {
  const categories = new Set();
  for (const p of EVASION_PATTERNS) if (p.re.test(note)) categories.add(p.cat);
  const injection = INJECTION_PATTERNS.some((re) => re.test(note));
  return { refuse: categories.size > 0, categories: [...categories], injection };
}
