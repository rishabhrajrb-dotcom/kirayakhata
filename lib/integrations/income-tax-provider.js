// Income-tax provider adapter — INTERFACE + MOCK ONLY.
//
// Future architecture:  KirayaKhata → registered e-Return Intermediary (ERI) / API → Income Tax Department
// No live ITD access is implemented. No portal credentials are ever stored.

const NOT_LIVE = { live: false, message: "Mock adapter: no government system was contacted." };

export function createMockIncomeTaxProvider() {
  return {
    name: "mock-income-tax",
    async authenticateTaxpayer(/* { pan } */) {
      return { ...NOT_LIVE, authenticated: false };
    },
    async getPrefill(/* { pan, taxYear } */) {
      return { ...NOT_LIVE, prefill: null };
    },
    prepareReturn(/* annualPack */) {
      return { ...NOT_LIVE, draft: null };
    },
    async validateReturn() {
      return { ...NOT_LIVE, valid: false, errors: ["Not implemented"] };
    },
    async submitReturn() {
      return { ...NOT_LIVE, submitted: false };
    },
    async verifyReturn() {
      return { ...NOT_LIVE, verified: false };
    },
    async getAcknowledgement() {
      return { ...NOT_LIVE, acknowledgementNumber: null };
    },
  };
}
