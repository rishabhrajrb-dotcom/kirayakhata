import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTasks, taxYearFor, addMonths, dueInMonthAfter, quarterOf, toICS, todayIST } from "../shared/calendar.js";

const gen = (o) => generateTasks({ gstRegistered: "yes", filingFrequency: "monthly", stateCode: "27", seniorCitizen: false, landlordPaysGst: true, tenantDeductsTds: true, ...o });

test("month arithmetic across year end", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2027-01", -1), "2026-12");
  assert.equal(addMonths("2027-03", 1), "2027-04");
});

test("December period: GSTR-1 due 11 January next year", () => {
  const t = gen({ today: "2026-12-28", fromPeriod: "2026-12" });
  const g1 = t.find((x) => x.id === "gstr1-2026-12");
  assert.equal(g1.due_date, "2027-01-11");
  assert.equal(t.find((x) => x.id === "gstr3b-2026-12").due_date, "2027-01-20");
});

test("March → April transition and tax-year labels", () => {
  const t = gen({ today: "2027-03-30", fromPeriod: "2027-03" });
  assert.equal(t.find((x) => x.id === "gstr1-2027-03").due_date, "2027-04-11");
  assert.equal(taxYearFor("2027-03").plainLabel, "Rent earned Apr 2026–Mar 2027");
  assert.equal(taxYearFor("2027-04").plainLabel, "Rent earned Apr 2027–Mar 2028");
  assert.equal(taxYearFor("2026-10-04").label, "Tax Year 2026-27");
  assert.equal(taxYearFor("2025-10").label, "FY 2025-26 / AY 2026-27");
});

test("leap year clamping", () => {
  assert.equal(dueInMonthAfter("2028-01", 1, 30), "2028-02-29");
  assert.equal(dueInMonthAfter("2027-01", 1, 30), "2027-02-28");
});

test("statuses relative to today", () => {
  const t = gen({ today: "2026-10-11", fromPeriod: "2026-08" });
  assert.equal(t.find((x) => x.id === "gstr1-2026-08").status, "OVERDUE");
  assert.equal(t.find((x) => x.id === "gstr1-2026-09").status, "DUE_TODAY");
  assert.equal(t.find((x) => x.id === "gstr3b-2026-09").status, "UPCOMING");
  const soon = gen({ today: "2026-10-15", fromPeriod: "2026-09" });
  assert.equal(soon.find((x) => x.id === "gstr3b-2026-09").status, "DUE_SOON");
});

test("user-reported completion marks DONE, never verified", () => {
  const t = gen({ today: "2026-10-12", fromPeriod: "2026-09", done: { "gstr1-2026-09": { date: "2026-10-10" } } });
  const g = t.find((x) => x.id === "gstr1-2026-09");
  assert.equal(g.status, "DONE");
  assert.deepEqual(g.user_marked_done, { date: "2026-10-10" });
});

test("QRMP: quarterly dates depend on state category", () => {
  const mh = gen({ today: "2026-10-04", fromPeriod: "2026-09", filingFrequency: "quarterly", stateCode: "27" });
  const dl = gen({ today: "2026-10-04", fromPeriod: "2026-09", filingFrequency: "quarterly", stateCode: "07" });
  assert.equal(mh.find((x) => x.id === "gstr1q-2026-09").due_date, "2026-10-13");
  assert.equal(mh.find((x) => x.id === "gstr3bq-2026-09").due_date, "2026-10-22");
  assert.equal(dl.find((x) => x.id === "gstr3bq-2026-09").due_date, "2026-10-24");
  assert.ok(mh.some((x) => x.id === "pmt06-2026-10" && x.due_date === "2026-11-25"));
  assert.ok(!mh.some((x) => x.id === "pmt06-2026-09")); // month 3 of quarter: no PMT-06
});

test("QRMP quarter spanning year end (Jan–Mar) due in April", () => {
  const t = gen({ today: "2027-03-20", fromPeriod: "2027-03", filingFrequency: "quarterly" });
  assert.equal(quarterOf("2027-02").startYm, "2027-01");
  assert.equal(t.find((x) => x.id === "gstr1q-2027-03").due_date, "2027-04-13");
});

test("unregistered landlord gets no GST return tasks", () => {
  const t = gen({ today: "2026-10-04", fromPeriod: "2026-09", gstRegistered: "no", filingFrequency: null });
  assert.ok(!t.some((x) => x.form_name.startsWith("GSTR")));
});

test("unsure landlord gets a CA-review task", () => {
  const t = gen({ today: "2026-10-04", fromPeriod: "2026-09", gstRegistered: "unsure" });
  assert.ok(t.some((x) => x.id === "gst-status" && x.needs_ca_review));
});

test("advance tax: next instalment, senior wording differs", () => {
  const t = gen({ today: "2026-10-04", fromPeriod: "2026-09" });
  assert.ok(t.some((x) => x.id === "advtax-2026-12-15" && x.key === "advance_tax"));
  const s = gen({ today: "2026-10-04", fromPeriod: "2026-09", seniorCitizen: true });
  assert.ok(s.some((x) => x.id === "advtax-2026-12-15" && x.key === "advance_tax_senior"));
});

test("income-tax return is always shown, for the right rent period", () => {
  const t = gen({ today: "2026-10-04", fromPeriod: "2026-09" });
  const itr = t.find((x) => x.id === "itr-2026");
  assert.equal(itr.due_date, "2027-07-31");
  assert.equal(itr.later, true);
  assert.match(itr.title_plain, /Apr 2026–Mar 2027/);
  // In May 2027 last year's return is live, not "later"
  const may = gen({ today: "2027-05-10", fromPeriod: "2027-04" });
  assert.ok(may.some((x) => x.id === "itr-2026" && !x.later));
});

test("year-end checklist appears when 31 March is near", () => {
  const t = gen({ today: "2027-02-01", fromPeriod: "2027-01" });
  assert.ok(t.some((x) => x.id === "yearend-2026" && x.due_date === "2027-03-31"));
});

test("TDS certificate follow-up dates", () => {
  const t = gen({ today: "2026-10-04", fromPeriod: "2026-09" });
  assert.ok(t.some((x) => x.id === "tdscert-2026-09" && x.due_date === "2026-11-15"));
  const feb = gen({ today: "2027-01-20", fromPeriod: "2026-12" });
  assert.ok(feb.some((x) => x.id === "tdscert-2026-12" && x.due_date === "2027-02-15"));
});

test("agreement ending within 90 days creates a reminder", () => {
  const t = gen({ today: "2026-10-04", fromPeriod: "2026-09", agreementEndMonth: "2026-12" });
  assert.ok(t.some((x) => x.id === "agreement-2026-12" && x.due_date === "2026-12-31"));
});

test("every task has the required fields", () => {
  for (const x of gen({ today: "2026-10-04", fromPeriod: "2026-09" })) {
    for (const k of ["id", "title_plain", "form_name", "period_label", "due_date", "status", "priority", "action", "technical_note", "needs_ca_review"]) {
      assert.ok(k in x, `${x.id} missing ${k}`);
    }
  }
});

test("ICS export is valid-looking and skips done items", () => {
  const t = gen({ today: "2026-10-04", fromPeriod: "2026-09", done: { "gstr1-2026-09": { date: "2026-10-05" } } });
  const ics = toICS(t);
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR$/);
  assert.ok(!ics.includes("UID:gstr1-2026-09@"));
  assert.ok(ics.includes("UID:gstr3b-2026-09@"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `long line: ${line}`);
});

test("todayIST uses Indian time", () => {
  assert.equal(todayIST(new Date("2026-10-03T19:00:00Z")), "2026-10-04"); // 00:30 IST
});
