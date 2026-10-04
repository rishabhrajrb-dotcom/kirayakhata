import { test } from "node:test";
import assert from "node:assert/strict";
import { CloseMonthInput, ExplanationOutput } from "../shared/schemas.js";
import { readyExample } from "../shared/examples.js";

const ok = (i) => CloseMonthInput.safeParse(i).success;
const ex = () => readyExample("2026-10-04");

test("ready example is valid", () => assert.ok(ok(ex())));

test("unknown fields are rejected at every level", () => {
  assert.ok(!ok({ ...ex(), pan: "ABCDE1234F" }));
  const i = ex(); i.tenant.name = "Mr Sharma"; assert.ok(!ok(i));
  const j = ex(); j.month.gstRate = 5; assert.ok(!ok(j));
});

test("numeric ranges", () => {
  const a = ex(); a.agreement.monthlyRent = -1; assert.ok(!ok(a));
  const b = ex(); b.agreement.monthlyRent = 1e12; assert.ok(!ok(b));
  const c = ex(); c.month.amountReceived = 100.5; assert.ok(!ok(c));
  const d = ex(); d.month.tdsReported = 10_000_000; assert.ok(!ok(d));
  const e = ex(); e.agreement.yearlyIncreasePct = 90; assert.ok(!ok(e));
});

test("dates and months", () => {
  const a = ex(); a.month.period = "2026-13"; assert.ok(!ok(a));
  const b = ex(); b.month.receiptDate = "2026-02-30"; assert.ok(!ok(b));
  const c = ex(); c.agreement.endMonth = "2020-01"; assert.ok(!ok(c));
});

test("conditional fields", () => {
  const a = ex(); a.landlord.filingFrequency = null; assert.ok(!ok(a));
  const b = ex(); b.property = { type: "residential", residentialUse: null }; assert.ok(!ok(b));
  const c = ex(); c.landlord.state = "99"; assert.ok(!ok(c));
});

test("note limited to 200 characters", () => {
  const a = ex(); a.note = "x".repeat(201); assert.ok(!ok(a));
});

test("explanation output schema", () => {
  assert.ok(ExplanationOutput.safeParse({ what_this_means: "x", do_next: [], refused: false, refusal_reason: null }).success);
  assert.ok(!ExplanationOutput.safeParse({ what_this_means: "x", do_next: ["a", "b", "c", "d"], refused: false, refusal_reason: null }).success);
  assert.ok(!ExplanationOutput.safeParse({ what_this_means: "x", do_next: [], refused: false, refusal_reason: null, extra: 1 }).success);
});
