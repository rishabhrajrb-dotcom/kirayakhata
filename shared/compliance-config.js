// KirayaKhata compliance configuration.
//
// THE ONLY PLACE where tax rates, thresholds, due-date rules and statutory
// references live. UI, rules engine, calendar and prompts read from here.
//
// Governance: every rule carries a status. Rules start as
// REQUIRES_CA_VERIFICATION and may only become VERIFIED when a Chartered
// Accountant reviews them by hand and fills in verifiedBy / lastHumanVerifiedAt.
// Nothing in this codebase may set VERIFIED automatically.
//
// Section references use the Income-tax Act, 1961 numbering the market still
// uses colloquially. From 1 April 2026 the Income-tax Act, 2025 applies; the
// equivalent provisions must be mapped by a CA before production use.

export const CONFIG_VERSION = "2026.10.0";
export const CONFIG_REVIEW_BY = "2027-01-31"; // re-review dates/rules before this date

const UNVERIFIED = Object.freeze({
  status: "REQUIRES_CA_VERIFICATION",
  verifiedBy: null,
  lastHumanVerifiedAt: null,
});

export const RULES = Object.freeze({
  GST_RENT_RATE: {
    id: "GST_RENT_RATE",
    value: 18, // percent, renting of immovable property (SAC 9972)
    split: { cgst: 9, sgst: 9 },
    effectiveFrom: "2017-07-01",
    sourceTitle: "Notification 11/2017-Central Tax (Rate), heading 9972",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  GST_COMM_FCM: {
    id: "GST_COMM_FCM",
    summary: "GST-registered landlord renting commercial property charges GST on the invoice (forward charge).",
    effectiveFrom: "2017-07-01",
    sourceTitle: "CGST Act 2017, s.9(1); Notification 11/2017-CT(R)",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  GST_COMM_RCM: {
    id: "GST_COMM_RCM",
    summary: "Unregistered landlord renting commercial property to a registered tenant: tenant pays GST under reverse charge.",
    effectiveFrom: "2024-10-10",
    sourceTitle: "Notification 09/2024-Central Tax (Rate)",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  GST_COMM_COMP_EXCLUDED: {
    id: "GST_COMM_COMP_EXCLUDED",
    summary: "Tenants registered under the composition scheme are excluded from the commercial-rent reverse charge.",
    effectiveFrom: "2025-01-16",
    sourceTitle: "Notification 07/2025-Central Tax (Rate)",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  GST_RES_EXEMPT: {
    id: "GST_RES_EXEMPT",
    summary: "Renting a residential dwelling for use as residence is exempt, except when let to a registered person (proprietor renting in personal capacity for own residence remains exempt).",
    effectiveFrom: "2023-01-01",
    sourceTitle: "Notification 12/2017-CT(R) entry 12, as amended by 04/2022 and 15/2022",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  GST_RES_RCM: {
    id: "GST_RES_RCM",
    summary: "Residential dwelling rented to a registered person: the tenant pays GST under reverse charge.",
    effectiveFrom: "2022-07-18",
    sourceTitle: "Notification 05/2022-Central Tax (Rate)",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  GST_REG_THRESHOLD: {
    id: "GST_REG_THRESHOLD",
    value: 2000000, // ₹20 lakh aggregate turnover (services)
    specialCategoryValue: 1000000, // ₹10 lakh
    specialCategoryStates: ["14", "15", "13", "16"], // Manipur, Mizoram, Nagaland, Tripura
    summary: "Registration is required when aggregate turnover across the PAN crosses the threshold. Exempt rent counts towards aggregate turnover.",
    effectiveFrom: "2017-07-01",
    sourceTitle: "CGST Act 2017, s.22 and s.2(6); Notification 10/2019-CT",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  GST_RCM_ONLY_REG_EXEMPTION: {
    id: "GST_RCM_ONLY_REG_EXEMPTION",
    summary: "A person exclusively making supplies on which the recipient pays tax under reverse charge may be exempt from registration.",
    effectiveFrom: "2017-06-19",
    sourceTitle: "Notification 5/2017-Central Tax",
    sourceUrl: "https://cbic-gst.gov.in/",
    ...UNVERIFIED,
  },
  TDS_RENT_BUSINESS: {
    id: "TDS_RENT_BUSINESS",
    value: 10, // percent on land/building rent
    monthlyThreshold: 50000, // per month or part of month
    legacySection: "194-I(b)",
    summary: "Companies, firms and audited businesses deduct TDS on rent of land or building above the monthly threshold.",
    effectiveFrom: "2025-04-01",
    sourceTitle: "Income-tax Act 1961 s.194-I as amended by Finance Act 2025",
    sourceUrl: "https://incometaxindia.gov.in/",
    ...UNVERIFIED,
  },
  TDS_RENT_INDIVIDUAL: {
    id: "TDS_RENT_INDIVIDUAL",
    value: 2, // percent
    monthlyThreshold: 50000,
    legacySection: "194-IB",
    deductedOnceAYear: true, // in the last month of the tax year or of the tenancy
    summary: "Individuals/HUFs not covered by s.194-I deduct TDS once, in the last month of the year or tenancy, when rent exceeds the monthly threshold.",
    effectiveFrom: "2024-10-01",
    sourceTitle: "Income-tax Act 1961 s.194-IB as amended by Finance (No.2) Act 2024",
    sourceUrl: "https://incometaxindia.gov.in/",
    ...UNVERIFIED,
  },
  TDS_EXCLUDES_GST: {
    id: "TDS_EXCLUDES_GST",
    summary: "TDS is computed on rent excluding GST where GST is shown separately on the invoice.",
    effectiveFrom: "2017-07-19",
    sourceTitle: "CBDT Circular 23/2017",
    sourceUrl: "https://incometaxindia.gov.in/",
    ...UNVERIFIED,
  },
  ADVANCE_TAX_SENIOR: {
    id: "ADVANCE_TAX_SENIOR",
    summary: "A resident senior citizen (60+) with no business or professional income is not liable to pay advance tax.",
    legacySection: "207",
    effectiveFrom: "2012-04-01",
    sourceTitle: "Income-tax Act 1961 s.207",
    sourceUrl: "https://incometaxindia.gov.in/",
    ...UNVERIFIED,
  },
  RENT_ESCALATION: {
    id: "RENT_ESCALATION",
    summary: "Contract rent increases by the agreed percentage on each anniversary of the agreement start month (compounded on the previous rent). Product assumption, not law.",
    effectiveFrom: null,
    sourceTitle: "Landlord's rent agreement (product assumption)",
    sourceUrl: null,
    ...UNVERIFIED,
  },
});

// GST due dates. All are day-of-month in the month after the period end,
// unless noted. Extensions announced by the government go in DUE_DATE_OVERRIDES.
export const GST_DUE_DATES = Object.freeze({
  id: "GST_DUE_DATES",
  gstr1Monthly: 11,
  gstr1Quarterly: 13,
  gstr3bMonthly: 20,
  gstr3bQuarterlyCategoryX: 22,
  gstr3bQuarterlyCategoryY: 24,
  pmt06: 25, // QRMP monthly payment for months 1 and 2 of the quarter
  sourceTitle: "CGST Rules 2017 r.59, r.61; Notifications 82/2020, 83/2020, 85/2020-CT",
  sourceUrl: "https://www.gst.gov.in/",
  ...UNVERIFIED,
});

// Government extensions: { "<task id>": "YYYY-MM-DD" }. Updated by hand.
export const DUE_DATE_OVERRIDES = Object.freeze({});

export const INCOME_TAX_DATES = Object.freeze({
  id: "INCOME_TAX_DATES",
  advanceTaxInstalments: [
    { month: 6, day: 15, cumulativePct: 15 },
    { month: 9, day: 15, cumulativePct: 45 },
    { month: 12, day: 15, cumulativePct: 75 },
    { month: 3, day: 15, cumulativePct: 100 },
  ],
  returnDueNonAudit: { month: 7, day: 31 }, // after the tax year ends
  tdsCertificateDue: [
    // quarter end month -> certificate due (Form 16A), date in following period
    { quarterEndMonth: 6, month: 8, day: 15 },
    { quarterEndMonth: 9, month: 11, day: 15 },
    { quarterEndMonth: 12, month: 2, day: 15 },
    { quarterEndMonth: 3, month: 6, day: 15 },
  ],
  taxYearStartMonth: 4,
  newActFrom: "2026-04-01", // "Tax Year" terminology applies from here
  sourceTitle: "Income-tax Act 1961 ss.211, 139(1); Rule 31; Income-tax Act 2025",
  sourceUrl: "https://incometaxindia.gov.in/",
  ...UNVERIFIED,
});

export const PORTAL_LINKS = Object.freeze({
  gstLogin: { url: "https://services.gst.gov.in/services/login", lastCheckedAt: null },
  incomeTaxLogin: { url: "https://eportal.incometax.gov.in/iec/foservices/#/login", lastCheckedAt: null },
});

// State list with GST state codes and the QRMP GSTR-3B category.
// Category X = 22nd, Category Y = 24th (Notification 85/2020-CT as amended).
export const STATES = Object.freeze([
  { code: "35", name: "Andaman and Nicobar Islands", qrmp: "X" },
  { code: "37", name: "Andhra Pradesh", qrmp: "X" },
  { code: "12", name: "Arunachal Pradesh", qrmp: "Y" },
  { code: "18", name: "Assam", qrmp: "Y" },
  { code: "10", name: "Bihar", qrmp: "Y" },
  { code: "04", name: "Chandigarh", qrmp: "Y" },
  { code: "22", name: "Chhattisgarh", qrmp: "X" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", qrmp: "X" },
  { code: "07", name: "Delhi", qrmp: "Y" },
  { code: "30", name: "Goa", qrmp: "X" },
  { code: "24", name: "Gujarat", qrmp: "X" },
  { code: "06", name: "Haryana", qrmp: "Y" },
  { code: "02", name: "Himachal Pradesh", qrmp: "Y" },
  { code: "01", name: "Jammu and Kashmir", qrmp: "Y" },
  { code: "20", name: "Jharkhand", qrmp: "Y" },
  { code: "29", name: "Karnataka", qrmp: "X" },
  { code: "32", name: "Kerala", qrmp: "X" },
  { code: "38", name: "Ladakh", qrmp: "Y" },
  { code: "31", name: "Lakshadweep", qrmp: "X" },
  { code: "23", name: "Madhya Pradesh", qrmp: "X" },
  { code: "27", name: "Maharashtra", qrmp: "X" },
  { code: "14", name: "Manipur", qrmp: "Y" },
  { code: "17", name: "Meghalaya", qrmp: "Y" },
  { code: "15", name: "Mizoram", qrmp: "Y" },
  { code: "13", name: "Nagaland", qrmp: "Y" },
  { code: "21", name: "Odisha", qrmp: "Y" },
  { code: "34", name: "Puducherry", qrmp: "X" },
  { code: "03", name: "Punjab", qrmp: "Y" },
  { code: "08", name: "Rajasthan", qrmp: "Y" },
  { code: "11", name: "Sikkim", qrmp: "Y" },
  { code: "33", name: "Tamil Nadu", qrmp: "X" },
  { code: "36", name: "Telangana", qrmp: "X" },
  { code: "16", name: "Tripura", qrmp: "Y" },
  { code: "09", name: "Uttar Pradesh", qrmp: "Y" },
  { code: "05", name: "Uttarakhand", qrmp: "Y" },
  { code: "19", name: "West Bengal", qrmp: "Y" },
]);

export const SAC = Object.freeze({ residential: "997211", commercial: "997212" });

// Scenario codes and their plain-language outcome keys (see public/i18n.js).
export const SCENARIOS = Object.freeze({
  COMM_FCM: { payer: "landlord", documentType: "TAX_INVOICE", ruleIds: ["GST_COMM_FCM", "GST_RENT_RATE"] },
  COMM_RCM: { payer: "tenant", documentType: "RCM_INVOICE_OR_RECEIPT", ruleIds: ["GST_COMM_RCM", "GST_RENT_RATE"] },
  COMM_COMP_NIL: { payer: "none", documentType: "RENT_RECEIPT", ruleIds: ["GST_COMM_RCM", "GST_COMM_COMP_EXCLUDED"] },
  COMM_NIL: { payer: "none", documentType: "RENT_RECEIPT", ruleIds: ["GST_COMM_RCM"] },
  RES_EXEMPT: { payer: "none", documentType: "BILL_OF_SUPPLY_OR_RECEIPT", ruleIds: ["GST_RES_EXEMPT"] },
  RES_RCM: { payer: "tenant", documentType: "RCM_INVOICE_OR_RECEIPT", ruleIds: ["GST_RES_RCM", "GST_RENT_RATE"] },
  UNKNOWN: { payer: "unknown", documentType: "DRAFT_RECEIPT", ruleIds: [] },
});

export function ruleSources(ids) {
  return ids.map((id) => RULES[id] || (id === "GST_DUE_DATES" ? GST_DUE_DATES : INCOME_TAX_DATES))
    .map((r) => ({ id: r.id, title: r.sourceTitle, url: r.sourceUrl, status: r.status }));
}
