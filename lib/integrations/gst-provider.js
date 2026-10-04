// GST provider adapter — INTERFACE + MOCK ONLY.
//
// Future architecture:  KirayaKhata → authorised GST Suvidha Provider (GSP) / API partner → GSTN
// No live GSTN access is implemented. No portal credentials are ever stored.
// Any real implementation must use an authorised partner, taxpayer consent and
// OTP-based authentication performed by the taxpayer.

const NOT_LIVE = { live: false, message: "Mock adapter: no government system was contacted." };

export function createMockGstProvider() {
  return {
    name: "mock-gst",
    async authenticateTaxpayer(/* { gstin } */) {
      return { ...NOT_LIVE, authenticated: false };
    },
    async getReturnStatus(/* { gstin, returnType, period } */) {
      return { ...NOT_LIVE, status: "UNKNOWN" };
    },
    prepareGstr1Payload(result) {
      // Shape only; the official schema must be confirmed with the GSP before use.
      return {
        ...NOT_LIVE,
        period: result.period.month,
        documentType: result.scenario.documentType,
        taxableValue: result.amounts.taxableValue,
        cgst: result.amounts.cgst,
        sgst: result.amounts.sgst,
        reverseCharge: result.scenario.code.endsWith("RCM"),
        sac: result.scenario.sac,
      };
    },
    async submitGstr1() {
      return { ...NOT_LIVE, submitted: false };
    },
    prepareGstr3bPayload(result) {
      return { ...NOT_LIVE, period: result.period.month, outwardTaxable: result.amounts.taxableValue, tax: result.amounts.gstOnInvoice };
    },
    async submitGstr3b() {
      return { ...NOT_LIVE, submitted: false };
    },
    async getAcknowledgement() {
      return { ...NOT_LIVE, arn: null };
    },
  };
}
