// Request/response schemas. Server-side only (imports zod).
// .strict() everywhere: unknown fields are rejected, never silently accepted.

import { z } from "zod";
import { STATES } from "./compliance-config.js";
import { isValidDate, monthsBetween } from "./calendar.js";

const STATE_CODES = STATES.map((s) => s.code);
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const rupees = (max) => z.number().int("Whole rupees only").min(0).max(max);

export const MAX_NOTE = 200;

export const CloseMonthInput = z
  .object({
    language: z.enum(["en", "hi"]),
    example: z.boolean().default(false),
    landlord: z
      .object({
        gstRegistered: z.enum(["yes", "no", "unsure"]),
        filingFrequency: z.enum(["monthly", "quarterly"]).nullable(),
        state: z.string().refine((c) => STATE_CODES.includes(c), "Unknown state"),
        seniorCitizen: z.boolean(),
      })
      .strict(),
    property: z
      .object({
        type: z.enum(["commercial", "residential"]),
        residentialUse: z.enum(["home", "business"]).nullable(),
      })
      .strict(),
    tenant: z
      .object({
        type: z.enum(["company", "firm", "individual_business", "individual_personal", "unknown"]),
        gstRegistered: z.enum(["yes", "no", "unknown"]).nullable(),
        composition: z.enum(["yes", "no", "unknown"]).nullable(),
      })
      .strict(),
    agreement: z
      .object({
        monthlyRent: rupees(10_000_000).min(500, "Rent looks too small"),
        startMonth: ym,
        yearlyIncreasePct: z.number().min(0).max(25),
        endMonth: ym.nullable(),
      })
      .strict(),
    month: z
      .object({
        period: ym,
        otherCharges: rupees(5_000_000),
        amountReceived: rupees(50_000_000),
        tdsReported: rupees(5_000_000),
        receiptDate: z.string().refine(isValidDate, "Use a real date").nullable(),
      })
      .strict(),
    note: z.string().max(MAX_NOTE).default(""),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.landlord.gstRegistered === "yes" && !v.landlord.filingFrequency) {
      ctx.addIssue({ code: "custom", path: ["landlord", "filingFrequency"], message: "Choose monthly or quarterly" });
    }
    if (v.property.type === "residential" && !v.property.residentialUse) {
      ctx.addIssue({ code: "custom", path: ["property", "residentialUse"], message: "Choose how the house is used" });
    }
    if (v.agreement.endMonth && monthsBetween(v.agreement.startMonth, v.agreement.endMonth) < 0) {
      ctx.addIssue({ code: "custom", path: ["agreement", "endMonth"], message: "End is before start" });
    }
    const span = monthsBetween(v.agreement.startMonth, v.month.period);
    if (span > 12 * 30) {
      ctx.addIssue({ code: "custom", path: ["month", "period"], message: "Month is too far from agreement start" });
    }
    if (v.month.tdsReported > v.agreement.monthlyRent * 3) {
      ctx.addIssue({ code: "custom", path: ["month", "tdsReported"], message: "TDS is larger than the rent" });
    }
  });

export const ExplanationOutput = z
  .object({
    what_this_means: z.string().max(1200),
    do_next: z.array(z.string().max(240)).max(3),
    refused: z.boolean(),
    refusal_reason: z.string().max(300).nullable(),
  })
  .strict();

export const CalendarInput = z
  .object({
    gstRegistered: z.enum(["yes", "no", "unsure"]),
    filingFrequency: z.enum(["monthly", "quarterly"]).nullable(),
    state: z.string().refine((c) => STATE_CODES.includes(c), "Unknown state"),
    seniorCitizen: z.boolean(),
    fromPeriod: ym.optional(),
    tenantDeductsTds: z.boolean().default(false),
    landlordPaysGst: z.boolean().default(false),
    agreementEndMonth: ym.nullable().default(null),
  })
  .strict();

/** Short, user-safe description of the first validation problem. */
export function firstIssue(error) {
  const i = error.issues[0];
  return i ? `${i.path.join(".") || "input"}: ${i.message}` : "Invalid input";
}
