# KirayaKhata — GST & TDS coverage matrix

**Status key:** `SUPPORTED` = the engine classifies and calculates this today (subject to CA verification of the underlying rule); `NEEDS_MORE_INFORMATION` = the engine asks for one more input before deciding; `NEEDS_SPECIALIST_REVIEW` = the engine flags it for a CA and never guesses.

**Governance (unchanged from the build brief):** every rule lives only in `shared/compliance-config.js`, each with `effectiveFrom`, `sourceTitle`, `sourceUrl`, `status`, `verifiedBy`, `lastHumanVerifiedAt`. **Every rule currently ships as `REQUIRES_CA_VERIFICATION`.** No code path marks a rule verified. Browser preview, server result, PDFs and calendar all read the same `rules_version` / `config_version`.

> Honesty note: the official sources below were **not** fetched or verified live in this build (the GST/Income-Tax portals are not reachable from the build environment). They are *starting points to verify*. A matrix row describes intended handling, not proven legal correctness. Unmodelled inputs return `UNKNOWN → needs_ca_review`; the engine never silently falls back to zero GST.

| # | Scenario family | Engine status | Required inputs | Calculated vs review | Responsible party | Document treatment |
|---|---|---|---|---|---|---|
| 1 | Commercial / non-residential renting | **SUPPORTED** (FCM, RCM, unregistered, composition) | landlord GST status, tenant type + GST status, composition flag | Calculated | Landlord (FCM) / Tenant (RCM) | Tax invoice / rent invoice (RCM) / receipt |
| 2 | Historical commercial RCM (10 Oct 2024; Jan 2025 composition change) | **NEEDS_SPECIALIST_REVIEW** | period of supply | Review-only (effective-dated) | per period | per period |
| 3 | Residential dwelling (home / business use / registered recipient) | **SUPPORTED** for the common cases; **NEEDS_SPECIALIST_REVIEW** for business-use-by-unregistered | property use, tenant GST status | Calculated / review | Tenant (RCM) or none (exempt) | Bill of supply / receipt / RCM invoice |
| 4 | Proprietor's own residence exemption | **NEEDS_MORE_INFORMATION** | is the registered proprietor renting in a personal capacity for own residence | Review | — | — |
| 5 | Composition recipients | **SUPPORTED** (commercial RCM exclusion); not generalised to residential | tenant composition flag | Calculated | none (excluded) | receipt |
| 6 | Registration (PAN-wide aggregate turnover) | **NEEDS_SPECIALIST_REVIEW** (per-property threshold watch only) | turnover across PAN, exempt supplies, state | Review (watch flag only) | Landlord | — |
| 7 | Place of supply (CGST+SGST vs IGST) | **NEEDS_SPECIALIST_REVIEW** beyond same-state | property & supplier location, recipient facts | Review | — | — |
| 8 | Multiple locations / co-ownership / HUF | **NEEDS_SPECIALIST_REVIEW** | GSTINs, states, ownership shares, entity type | Review | — | — |
| 9 | Special parties (govt, SEZ, overseas, NR, related persons) | **NEEDS_SPECIALIST_REVIEW** | party type, regime | Review | — | — |
| 10 | Accommodation & mixed use (PG, hostel, serviced, holiday, sublet) | **NEEDS_SPECIALIST_REVIEW** | nature of supply | Review | — | — |
| 11 | Land & unusual rights (bare land, agri, long lease, premium, licence) | **NEEDS_SPECIALIST_REVIEW** | nature of right | Review | — | — |
| 12 | Deposits & advances (security vs advance rent, forfeiture) | **NEEDS_MORE_INFORMATION** | deposit vs advance, adjustment | Review (time of supply) | — | — |
| 13 | Additional charges (CAM, electricity, parking, pure agent) | **NEEDS_MORE_INFORMATION** (shown separately; not auto-exempt) | per-charge classification | Review | — | item-level |
| 14 | Changes to rent (escalation, vacancy, arrears, concessions) | **SUPPORTED** for anniversary escalation; else **NEEDS_MORE_INFORMATION** | agreement terms, period | Calculated / review | Landlord | — |
| 15 | Late payment & adjustments (interest, credit/debit notes, bad debts) | **NEEDS_SPECIALIST_REVIEW** | event type | Review (short payment ≠ lower GST) | — | credit/debit note |
| 16 | Changes in legal status (mid-period registration, composition entry/exit) | **NEEDS_SPECIALIST_REVIEW** | effective dates | Review | — | — |
| 17 | Invoice compliance (doc type, particulars, SAC, RCM notation, e-invoice) | **SUPPORTED** (doc type + SAC + RCM note + DRAFT numbering); e-invoice/IRN **NEEDS_SPECIALIST_REVIEW** (not applicable to small landlords) | registration status, treatment | Calculated | Landlord | Tax invoice / bill of supply / receipt |
| 18 | Filing regime (monthly, QRMP, IFF, nil, annual) | **SUPPORTED** (monthly & QRMP calendar incl. state 3B date); no GSTR duties shown for unregistered landlord | GST status, frequency, state | Calculated | Landlord | GSTR-1 / GSTR-3B / PMT-06 |
| 19 | Input tax credit (RCM payment, blocked credits, apportionment) | **NEEDS_SPECIALIST_REVIEW** | expense facts | Review (no universal credit promised) | — | — |
| 20 | GST withholding (GST TDS for specified deductors) | **NEEDS_SPECIALIST_REVIEW** (separate from income-tax TDS) | deductor type | Review | — | — |
| 21 | Income-tax TDS (194-I / 194-IB; GST excluded; annual individual deduction) | **SUPPORTED** for common tenant categories; audited-individual & NR **NEEDS_MORE_INFORMATION** | tenant category, rent ex-GST, month | Calculated / review | Tenant | Form 16A follow-up |
| 22 | Evidence & reconciliation (reported TDS ≠ verified credit; AIS/26AS) | **SUPPORTED** for bank-vs-invoice-vs-reported; certificate/AIS match **NEEDS_SPECIALIST_REVIEW** | reported TDS, bank receipt | Calculated / review | — | — |
| 23 | Income-tax transition (1961 vs 2025 Act, s.393 / Form 141 mapping) | **NEEDS_SPECIALIST_REVIEW** | period / trigger event | Review (section/form shown with verification status) | — | — |
| 24 | Annual income tax (other income, shares, interest, regime, advance tax) | **NEEDS_SPECIALIST_REVIEW** (advance-tax recommends CA; age alone insufficient) | full income picture | Review | — | — |

## Source register (to verify — not verified in this build)

| Rule area | Starting source | Verification status |
|---|---|---|
| Commercial RCM; composition recipient | CBIC Circular 245/02/2025-GST; underlying notifications | `REQUIRES_CA_VERIFICATION` |
| Residential RCM | Notification 05/2022-CT(R) | `REQUIRES_CA_VERIFICATION` |
| Proprietor own-residence exemption | Notification 15/2022-Central Tax (Rate) | `REQUIRES_CA_VERIFICATION` |
| GST rent rate / SAC | Notification 11/2017-CT(R), heading 9972 | `REQUIRES_CA_VERIFICATION` |
| Registration threshold | CGST Act s.22; Notification 10/2019-CT | `REQUIRES_CA_VERIFICATION` |
| GST due dates / QRMP | CGST Rules r.59/r.61; Notifications 82–85/2020-CT; GST Portal manuals (GSTR-1, QRMP, IFF) | `REQUIRES_CA_VERIFICATION` |
| Income-tax TDS 194-I / 194-IB; GST exclusion | IT Act 1961; CBDT Circular 23/2017; Finance Act 2025 | `REQUIRES_CA_VERIFICATION` |
| Income-tax transition (2025 Act) | Income Tax Dept TDS transition FAQs | `REQUIRES_CA_VERIFICATION` |

A CA must open each source, confirm the rule and its effective dates, and set `status: "VERIFIED"`, `verifiedBy`, `lastHumanVerifiedAt` by hand before any calculation is relied upon.
