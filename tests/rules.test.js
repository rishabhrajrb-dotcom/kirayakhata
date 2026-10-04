import { test } from "node:test";
import assert from "node:assert/strict";
import { closeMonth, decideGstScenario, contractRentFor, expectedTds, isValidGstin } from "../shared/rules.js";
import { RULES } from "../shared/compliance-config.js";
import { readyExample } from "../shared/examples.js";

const TODAY = "2026-10-04";
const base = () => readyExample(TODAY);
const run = (mutate = () => {}) => { const i = base(); mutate(i); return closeMonth(i, { today: TODAY }); };

test("ready example: GST, TDS and bank receipt all match", () => {
  const r = run();
  assert.equal(r.scenario.code, "COMM_FCM");
  assert.equal(r.amounts.contractRent, 100000);
  assert.equal(r.amounts.gstOnInvoice, 18000);
  assert.equal(r.amounts.cgst, 9000);
  assert.equal(r.amounts.sgst, 9000);
  assert.equal(r.amounts.tdsExpected, 10000);
  assert.equal(r.amounts.expectedBankReceipt, 108000);
  assert.equal(r.amounts.difference, 0);
  assert.equal(r.status, "ALL_MATCH");
  assert.equal(r.needs_ca_review, false);
  assert.equal(r.scenario.documentType, "TAX_INVOICE");
  assert.ok(r.rules_version && r.config_version && r.calculated_at);
  assert.ok(r.sources.length > 0);
});

test("rates come from config, not hardcoded", () => {
  const r = run();
  assert.equal(r.scenario.gstRate, RULES.GST_RENT_RATE.value);
});

test("TDS is computed on rent excluding GST", () => {
  const r = run();
  assert.equal(r.amounts.tdsExpected, (100000 * RULES.TDS_RENT_BUSINESS.value) / 100);
});

test("short payment is flagged with the shortfall", () => {
  const r = run((i) => { i.month.amountReceived = 100000; });
  assert.equal(r.status, "ATTENTION");
  assert.equal(r.amounts.shortfall, 8000);
  assert.ok(r.checks.some((c) => c.code === "SHORT_PAYMENT" && c.params.amount === 8000));
});

test("safety test 4: received more than expected is a mismatch", () => {
  const r = run((i) => { i.month.amountReceived = 120000; });
  assert.equal(r.status, "ATTENTION");
  assert.equal(r.amounts.excess, 12000);
  assert.ok(r.checks.some((c) => c.code === "EXCESS_PAYMENT"));
});

test("TDS mismatch is flagged and amount recorded", () => {
  const r = run((i) => { i.month.tdsReported = 12000; i.month.amountReceived = 106000; });
  assert.ok(r.checks.some((c) => c.code === "TDS_MISMATCH"));
  assert.equal(r.amounts.tdsMismatchAmount, 2000);
  assert.equal(r.amounts.difference, 0); // bank matches what tenant actually paid
});

test("safety test 5: unknown tenant GST status changes outcome → needs_ca_review", () => {
  const r = run((i) => { i.landlord.gstRegistered = "no"; i.landlord.filingFrequency = null; i.tenant.gstRegistered = "unknown"; });
  assert.equal(r.scenario.code, "UNKNOWN");
  assert.equal(r.needs_ca_review, true);
  assert.ok(r.flags.some((f) => f.code === "TENANT_GST_UNKNOWN"));
});

test("landlord unsure about GST → needs_ca_review", () => {
  const r = run((i) => { i.landlord.gstRegistered = "unsure"; i.landlord.filingFrequency = null; });
  assert.equal(r.scenario.code, "UNKNOWN");
  assert.ok(r.flags.some((f) => f.code === "LANDLORD_GST_UNSURE"));
});

const S = (landlord, property, tenant) => decideGstScenario({ landlord: { gstRegistered: landlord }, property, tenant }).code;
const COMM = { type: "commercial", residentialUse: null };
const HOME = { type: "residential", residentialUse: "home" };
const BIZ = { type: "residential", residentialUse: "business" };

test("scenario table", () => {
  assert.equal(S("yes", COMM, { type: "company", gstRegistered: "yes", composition: "no" }), "COMM_FCM");
  assert.equal(S("yes", COMM, { type: "individual_personal" }), "COMM_FCM");
  assert.equal(S("no", COMM, { type: "company", gstRegistered: "yes", composition: "no" }), "COMM_RCM");
  assert.equal(S("no", COMM, { type: "firm", gstRegistered: "yes", composition: "yes" }), "COMM_COMP_NIL");
  assert.equal(S("no", COMM, { type: "firm", gstRegistered: "yes", composition: "unknown" }), "UNKNOWN");
  assert.equal(S("no", COMM, { type: "individual_business", gstRegistered: "no" }), "COMM_NIL");
  assert.equal(S("no", COMM, { type: "unknown" }), "UNKNOWN");
  assert.equal(S("no", HOME, { type: "individual_personal" }), "RES_EXEMPT");
  assert.equal(S("yes", HOME, { type: "individual_personal" }), "RES_EXEMPT");
  assert.equal(S("no", HOME, { type: "company", gstRegistered: "yes" }), "RES_RCM");
  assert.equal(S("yes", HOME, { type: "company", gstRegistered: "yes" }), "RES_RCM");
  assert.equal(S("no", HOME, { type: "company", gstRegistered: "no" }), "RES_EXEMPT");
  assert.equal(S("no", HOME, { type: "company", gstRegistered: "unknown" }), "UNKNOWN");
  assert.equal(S("no", BIZ, { type: "individual_business", gstRegistered: "no" }), "UNKNOWN");
  assert.equal(S("no", BIZ, { type: "individual_business", gstRegistered: "yes" }), "RES_RCM");
});

test("RCM: tenant pays GST directly, not added to invoice or bank receipt", () => {
  const r = run((i) => { i.landlord.gstRegistered = "no"; i.landlord.filingFrequency = null; i.month.amountReceived = 90000; });
  assert.equal(r.scenario.code, "COMM_RCM");
  assert.equal(r.amounts.gstOnInvoice, 0);
  assert.equal(r.amounts.gstByTenant, 18000);
  assert.equal(r.amounts.expectedBankReceipt, 90000);
  assert.equal(r.status, "ALL_MATCH");
  assert.equal(r.scenario.documentType, "RENT_RECEIPT");
});

test("residential exempt home: no GST, bill of supply when landlord registered", () => {
  const r = run((i) => {
    i.property = HOME; i.tenant = { type: "individual_personal", gstRegistered: null, composition: null };
    i.agreement.monthlyRent = 30000; i.month.amountReceived = 30000; i.month.tdsReported = 0;
  });
  assert.equal(r.scenario.code, "RES_EXEMPT");
  assert.equal(r.amounts.gstOnInvoice, 0);
  assert.equal(r.scenario.documentType, "BILL_OF_SUPPLY");
  assert.equal(r.status, "ALL_MATCH");
});

test("contract rent escalates on each anniversary, compounding", () => {
  const a = { monthlyRent: 100000, startMonth: "2024-04", yearlyIncreasePct: 5 };
  assert.equal(contractRentFor(a, "2025-03").rent, 100000);
  assert.equal(contractRentFor(a, "2025-04").rent, 105000);
  assert.equal(contractRentFor(a, "2026-04").rent, 110250);
  assert.equal(contractRentFor(a, "2024-03").beforeStart, true);
});

test("TDS thresholds and tenant types", () => {
  const t = (type, rent, period = "2026-09") => expectedTds({ tenant: { type }, rentForTds: rent, period });
  assert.equal(t("company", 50000).expected, 0);
  assert.equal(t("company", 50001).expected, 5000);
  assert.equal(t("individual_personal", 60000).expected, 0); // deducted once a year
  assert.equal(t("individual_personal", 60000, "2027-03").expected, null); // year-end month → check
  assert.equal(t("individual_business", 100000).expected, null);
  assert.equal(t("unknown", 100000).expected, null);
});

test("individual business tenant: matching either rule is accepted", () => {
  const r = run((i) => { i.tenant = { type: "individual_business", gstRegistered: "yes", composition: "no" }; });
  assert.ok(r.checks.some((c) => c.code === "TDS_MATCHES_ONE_RULE"));
});

test("unregistered landlord above registration limit is flagged", () => {
  const r = run((i) => {
    i.landlord.gstRegistered = "no"; i.landlord.filingFrequency = null;
    i.tenant = { type: "individual_business", gstRegistered: "no", composition: null };
    i.agreement.monthlyRent = 200000; i.month.amountReceived = 200000; i.month.tdsReported = 0;
  });
  assert.equal(r.scenario.code, "COMM_NIL");
  assert.ok(r.flags.some((f) => f.code === "REG_THRESHOLD_CROSSED"));
});

test("month before agreement start is flagged", () => {
  const r = run((i) => { i.agreement.startMonth = "2026-12"; });
  assert.ok(r.flags.some((f) => f.code === "PERIOD_BEFORE_AGREEMENT"));
});

test("GSTIN check digit", () => {
  assert.equal(isValidGstin("27AAPFU0939F1ZV"), true);
  assert.equal(isValidGstin("27AAPFU0939F1ZW"), false);
  assert.equal(isValidGstin("not-a-gstin"), false);
});
