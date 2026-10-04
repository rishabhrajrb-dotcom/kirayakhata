// POST /api/compliance-calendar — dated compliance tasks for a landlord's
// situation. Deterministic; no AI, no storage, no personal data.

import { CalendarInput, firstIssue } from "../shared/schemas.js";
import { generateTasks, todayIST } from "../shared/calendar.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const parsed = CalendarInput.safeParse(body || {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_input", message: firstIssue(parsed.error) });
  const p = parsed.data;
  const today = todayIST();
  const tasks = generateTasks({
    today,
    fromPeriod: p.fromPeriod,
    gstRegistered: p.gstRegistered,
    filingFrequency: p.filingFrequency,
    stateCode: p.state,
    seniorCitizen: p.seniorCitizen,
    landlordPaysGst: p.landlordPaysGst,
    tenantDeductsTds: p.tenantDeductsTds,
    agreementEndMonth: p.agreementEndMonth,
    horizonDays: 365,
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ today, tasks });
}
