// Deterministic rules engine for "Close this month's rent".
// Every number shown to the user comes from here; Gemini never calculates.
// Rates, thresholds and references come only from compliance-config.js.
// Pure functions: runs in the browser (instant preview) and on the server
// (authoritative result — the server always wins).

import { RULES, SCENARIOS, CONFIG_VERSION, SAC, ruleSources, STATES } from "./compliance-config.js";
import { generateTasks, nextTasks, taxYearFor, monthsBetween, todayIST } from "./calendar.js";

export const RULES_VERSION = "1.0.0";

const TOLERANCE = 1; // rupees, for rounding differences in bank credits

const round2 = (n) => Math.round(n * 100) / 100;
const roundRupee = (n) => Math.round(n);

const REGISTERED_TENANT_TYPES = ["company", "firm", "individual_business"];

/** Contract rent for `period`, applying the agreed yearly increase. */
export function contractRentFor(agreement, period) {
  const elapsed = monthsBetween(agreement.startMonth, period);
  if (elapsed < 0) return { rent: null, increases: 0, beforeStart: true };
  const increases = Math.floor(elapsed / 12);
  const pct = agreement.yearlyIncreasePct || 0;
  const rent = roundRupee(agreement.monthlyRent * Math.pow(1 + pct / 100, increases));
  return { rent, increases, beforeStart: false };
}

/**
 * Decide the GST scenario. Returns { code, reasons[], missing[] }.
 * Unknown or unmodelled facts never produce a guess: they produce UNKNOWN
 * plus a reason that maps to "needs CA review" or "we need one more detail".
 */
export function decideGstScenario({ landlord, property, tenant }) {
  const tenantRegistered =
    tenant.type === "individual_personal" ? "no"
      : tenant.type === "unknown" ? "unknown"
        : tenant.gstRegistered || "unknown";

  if (landlord.gstRegistered === "unsure") {
    return { code: "UNKNOWN", reasons: ["LANDLORD_GST_UNSURE"], missing: ["landlord.gstRegistered"] };
  }

  if (property.type === "residential") {
    if (tenantRegistered === "yes") {
      return { code: "RES_RCM", reasons: ["RES_TO_REGISTERED"], missing: [] };
    }
    if (tenantRegistered === "unknown") {
      return { code: "UNKNOWN", reasons: ["TENANT_GST_UNKNOWN"], missing: ["tenant.gstRegistered"] };
    }
    if (property.residentialUse === "business") {
      // Residential dwelling used commercially by an unregistered tenant is not
      // "for use as residence"; treatment depends on facts.
      return { code: "UNKNOWN", reasons: ["RES_BUSINESS_USE"], missing: [] };
    }
    return { code: "RES_EXEMPT", reasons: ["RES_FOR_RESIDENCE"], missing: [] };
  }

  // commercial
  if (landlord.gstRegistered === "yes") {
    return { code: "COMM_FCM", reasons: ["COMM_LANDLORD_REGISTERED"], missing: [] };
  }
  if (tenantRegistered === "unknown") {
    return { code: "UNKNOWN", reasons: ["TENANT_GST_UNKNOWN"], missing: ["tenant.gstRegistered"] };
  }
  if (tenantRegistered === "yes") {
    if (tenant.composition === "yes") return { code: "COMM_COMP_NIL", reasons: ["COMM_TENANT_COMPOSITION"], missing: [] };
    if (tenant.composition === "no") return { code: "COMM_RCM", reasons: ["COMM_UNREG_LANDLORD_REG_TENANT"], missing: [] };
    return { code: "UNKNOWN", reasons: ["TENANT_COMPOSITION_UNKNOWN"], missing: ["tenant.composition"] };
  }
  return { code: "COMM_NIL", reasons: ["COMM_BOTH_UNREGISTERED"], missing: [] };
}

/**
 * Expected TDS for the month. Returns
 * { expected: number|null, candidates: [{rate, amount, ruleId}], ruleId, reason }
 * expected === null means "cannot be determined with confidence".
 */
export function expectedTds({ tenant, rentForTds, period }) {
  const biz = RULES.TDS_RENT_BUSINESS;
  const ind = RULES.TDS_RENT_INDIVIDUAL;

  if (tenant.type === "unknown") {
    return { expected: null, candidates: [], ruleId: null, reason: "TDS_TENANT_UNKNOWN" };
  }
  if (tenant.type === "company" || tenant.type === "firm") {
    if (rentForTds <= biz.monthlyThreshold) return { expected: 0, candidates: [], ruleId: biz.id, reason: "TDS_BELOW_THRESHOLD" };
    const amount = roundRupee((rentForTds * biz.value) / 100);
    return { expected: amount, candidates: [{ rate: biz.value, amount, ruleId: biz.id }], ruleId: biz.id, reason: "TDS_BUSINESS" };
  }
  if (tenant.type === "individual_personal") {
    if (rentForTds <= ind.monthlyThreshold) return { expected: 0, candidates: [], ruleId: ind.id, reason: "TDS_BELOW_THRESHOLD" };
    // Deducted once a year (last month of the tax year / tenancy), not monthly.
    if (period.slice(5, 7) === "03") {
      return { expected: null, candidates: [], ruleId: ind.id, reason: "TDS_INDIVIDUAL_YEAR_END" };
    }
    return { expected: 0, candidates: [], ruleId: ind.id, reason: "TDS_INDIVIDUAL_NOT_THIS_MONTH" };
  }
  // individual running a business: 10% if their accounts are audited, else 2% once a year
  if (rentForTds <= biz.monthlyThreshold) return { expected: 0, candidates: [], ruleId: biz.id, reason: "TDS_BELOW_THRESHOLD" };
  const a = roundRupee((rentForTds * biz.value) / 100);
  return {
    expected: null,
    candidates: [{ rate: biz.value, amount: a, ruleId: biz.id }, { rate: 0, amount: 0, ruleId: ind.id }],
    ruleId: null,
    reason: "TDS_INDIVIDUAL_BUSINESS",
  };
}

/** Main entry point. `input` is the validated request (see schemas.js). */
export function closeMonth(input, { today = todayIST(), done = {} } = {}) {
  const { landlord, property, tenant, agreement, month } = input;
  const flags = []; // needs CA review / one more detail
  const checks = []; // plain matches / mismatches
  const ruleIds = new Set();

  // --- rent as per agreement ---
  const cr = contractRentFor(agreement, month.period);
  ruleIds.add("RENT_ESCALATION");
  if (cr.beforeStart) {
    flags.push({ code: "PERIOD_BEFORE_AGREEMENT", params: { start: agreement.startMonth } });
  }
  const rent = cr.rent ?? agreement.monthlyRent;
  const otherCharges = month.otherCharges || 0;
  if (agreement.endMonth && month.period > agreement.endMonth) {
    flags.push({ code: "PERIOD_AFTER_AGREEMENT_END", params: { end: agreement.endMonth } });
  }

  // --- GST ---
  const sc = decideGstScenario({ landlord, property, tenant });
  const scenario = SCENARIOS[sc.code];
  scenario.ruleIds.forEach((id) => ruleIds.add(id));
  const rate = RULES.GST_RENT_RATE.value;
  const taxableValue = rent + otherCharges;
  let gstOnInvoice = 0; // collected by landlord
  let gstByTenant = 0; // paid by tenant directly under reverse charge
  if (sc.code === "COMM_FCM") gstOnInvoice = round2((taxableValue * rate) / 100);
  if (sc.code === "COMM_RCM" || sc.code === "RES_RCM") gstByTenant = round2((taxableValue * rate) / 100);
  const cgst = round2((gstOnInvoice * RULES.GST_RENT_RATE.split.cgst) / rate);
  const sgst = round2(gstOnInvoice - cgst);

  for (const reason of sc.reasons) {
    if (["LANDLORD_GST_UNSURE", "RES_BUSINESS_USE"].includes(reason)) flags.push({ code: reason, params: {} });
    if (["TENANT_GST_UNKNOWN", "TENANT_COMPOSITION_UNKNOWN"].includes(reason)) flags.push({ code: reason, params: {} });
  }
  if (otherCharges > 0) {
    checks.push({ code: "CHARGES_INCLUDED", status: "info", params: { amount: otherCharges } });
  }

  // Registration threshold watch for unregistered landlords (this property only).
  if (landlord.gstRegistered === "no") {
    const t = RULES.GST_REG_THRESHOLD;
    const limit = t.specialCategoryStates.includes(landlord.state) ? t.specialCategoryValue : t.value;
    const annual = (rent + otherCharges) * 12;
    ruleIds.add("GST_REG_THRESHOLD");
    if (annual > limit) {
      if (sc.code === "COMM_RCM" || sc.code === "RES_RCM") ruleIds.add("GST_RCM_ONLY_REG_EXEMPTION");
      flags.push({ code: "REG_THRESHOLD_CROSSED", params: { annual, limit } });
    } else if (annual > limit * 0.8) {
      checks.push({ code: "REG_THRESHOLD_NEAR", status: "info", params: { annual, limit } });
    }
  }

  // --- TDS ---
  ruleIds.add("TDS_EXCLUDES_GST");
  const tds = expectedTds({ tenant, rentForTds: rent, period: month.period });
  if (tds.ruleId) ruleIds.add(tds.ruleId);
  if (tds.reason === "TDS_INDIVIDUAL_BUSINESS") { ruleIds.add("TDS_RENT_BUSINESS"); ruleIds.add("TDS_RENT_INDIVIDUAL"); }
  const tdsReported = month.tdsReported || 0;
  let tdsStatus;
  if (tds.expected !== null) {
    tdsStatus = Math.abs(tdsReported - tds.expected) <= TOLERANCE ? "ok" : "mismatch";
  } else if (tds.candidates.length) {
    tdsStatus = tds.candidates.some((c) => Math.abs(c.amount - tdsReported) <= TOLERANCE) ? "ok_one_rule" : "mismatch";
  } else {
    tdsStatus = "unknown";
  }
  if (tdsStatus === "mismatch") {
    checks.push({ code: "TDS_MISMATCH", status: "mismatch", params: { reported: tdsReported, expected: tds.expected ?? tds.candidates[0]?.amount ?? 0 } });
    if (tds.expected === null) flags.push({ code: "TDS_RULE_UNCLEAR", params: {} });
  } else if (tdsStatus === "unknown") {
    flags.push({ code: tds.reason === "TDS_INDIVIDUAL_YEAR_END" ? "TDS_YEAR_END_CHECK" : "TDS_RULE_UNCLEAR", params: {} });
  } else {
    checks.push({ code: tdsStatus === "ok_one_rule" ? "TDS_MATCHES_ONE_RULE" : "TDS_OK", status: "ok", params: { reported: tdsReported } });
  }
  if (otherCharges > 0 && tdsReported > 0) {
    checks.push({ code: "TDS_ON_CHARGES_NOTE", status: "info", params: {} });
  }

  // --- bank receipt ---
  const invoiceTotal = round2(taxableValue + gstOnInvoice);
  const expectedBank = round2(invoiceTotal - tdsReported);
  const received = month.amountReceived;
  const difference = round2(received - expectedBank);
  let shortfall = 0;
  let excess = 0;
  if (Math.abs(difference) <= TOLERANCE) {
    checks.push({ code: "BANK_OK", status: "ok", params: { received } });
  } else if (difference < 0) {
    shortfall = -difference;
    checks.push({ code: "SHORT_PAYMENT", status: "mismatch", params: { amount: shortfall } });
  } else {
    excess = difference;
    checks.push({ code: "EXCESS_PAYMENT", status: "mismatch", params: { amount: excess } });
  }

  const tdsMismatchAmount =
    tdsStatus === "mismatch" ? Math.abs(tdsReported - (tds.expected ?? tds.candidates[0]?.amount ?? 0)) : 0;

  // --- overall status ---
  const needsCa = flags.length > 0;
  const mismatches = checks.filter((c) => c.status === "mismatch").length;
  const status = mismatches === 0 && !needsCa ? "ALL_MATCH" : mismatches > 0 ? "ATTENTION" : "CA_REVIEW";

  // --- document ---
  let documentType;
  if (sc.code === "COMM_FCM") documentType = "TAX_INVOICE";
  else if ((sc.code === "RES_RCM" || sc.code === "COMM_RCM") && landlord.gstRegistered === "yes") documentType = "TAX_INVOICE_RCM";
  else if (landlord.gstRegistered === "yes" && sc.code === "RES_EXEMPT") documentType = "BILL_OF_SUPPLY";
  else documentType = "RENT_RECEIPT";

  // --- calendar ---
  const tasks = generateTasks({
    today,
    fromPeriod: month.period,
    gstRegistered: landlord.gstRegistered,
    filingFrequency: landlord.filingFrequency,
    stateCode: landlord.state,
    seniorCitizen: landlord.seniorCitizen,
    landlordPaysGst: sc.code === "COMM_FCM",
    tenantDeductsTds: (tds.expected ?? 0) > 0 || tdsReported > 0,
    agreementEndMonth: agreement.endMonth || null,
    done,
  });

  const ty = taxYearFor(month.period);
  const state = STATES.find((s) => s.code === landlord.state);

  return {
    rules_version: RULES_VERSION,
    config_version: CONFIG_VERSION,
    calculated_at: new Date().toISOString(),
    today,
    period: { month: month.period, taxYear: ty },
    scenario: {
      code: sc.code,
      payer: scenario.payer,
      reasons: sc.reasons,
      missing: sc.missing,
      gstRate: sc.code === "COMM_FCM" || sc.code.endsWith("RCM") ? rate : 0,
      sac: property.type === "residential" ? SAC.residential : SAC.commercial,
      documentType,
      placeOfSupply: state ? state.name : null,
    },
    amounts: {
      contractRent: rent,
      rentIncreases: cr.increases,
      yearlyIncreasePct: agreement.yearlyIncreasePct || 0,
      otherCharges,
      taxableValue,
      gstOnInvoice,
      cgst,
      sgst,
      gstByTenant,
      invoiceTotal,
      tdsExpected: tds.expected,
      tdsCandidates: tds.candidates,
      tdsReason: tds.reason,
      tdsReported,
      expectedBankReceipt: expectedBank,
      amountReceived: received,
      difference,
      shortfall,
      excess,
      tdsMismatchAmount,
    },
    checks,
    flags,
    needs_ca_review: needsCa,
    status,
    tasks,
    next_tasks: nextTasks(tasks),
    sources: ruleSources([...ruleIds]),
  };
}

// ---------- GSTIN check digit (used client-side only; GSTINs never leave the browser) ----------

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function isValidGstin(raw) {
  const g = String(raw || "").trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let factor = 2;
  let sum = 0;
  for (let i = g.length - 2; i >= 0; i--) {
    const v = GSTIN_CHARS.indexOf(g[i]) * factor;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(v / 36) + (v % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === g[14];
}
