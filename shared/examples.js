// The one-click "Try a ready example": a GST-registered landlord renting a
// commercial shop at ₹1,00,000 a month to a GST-registered company.
// Expected: GST ₹18,000, TDS ₹10,000, bank receipt ₹1,08,000 — everything matches.

import { addMonths, todayIST } from "./calendar.js";

export function readyExample(today = todayIST()) {
  const period = addMonths(today.slice(0, 7), -1); // last month
  return {
    language: "en",
    example: true,
    landlord: { gstRegistered: "yes", filingFrequency: "monthly", state: "19", seniorCitizen: true },
    property: { type: "commercial", residentialUse: null },
    tenant: { type: "company", gstRegistered: "yes", composition: "no" },
    agreement: { monthlyRent: 100000, startMonth: period, yearlyIncreasePct: 5, endMonth: addMonths(period, 35) },
    month: { period, otherCharges: 0, amountReceived: 108000, tdsReported: 10000, receiptDate: `${period}-05` },
    note: "",
  };
}
