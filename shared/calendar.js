// Compliance calendar: turns today's date + a landlord's situation into a
// list of dated tasks. Pure functions, no I/O; runs in the browser and on the
// server. All dates are plain "YYYY-MM-DD" strings in Indian Standard Time.

import { GST_DUE_DATES, INCOME_TAX_DATES, DUE_DATE_OVERRIDES, STATES, PORTAL_LINKS } from "./compliance-config.js";

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT_EN = MONTHS_EN.map((m) => m.slice(0, 3));

// ---------- date helpers ----------

export function todayIST(now = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const pad = (n) => String(n).padStart(2, "0");

export function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseYm(ym) {
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}

export function addMonths(ym, n) {
  const { y, m } = parseYm(ym);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthsBetween(fromYm, toYm) {
  const a = parseYm(fromYm);
  const b = parseYm(toYm);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function daysBetween(fromDate, toDate) {
  const a = Date.UTC(...fromDate.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...toDate.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
}

/** Day `day` of the month that is `offset` months after `ym`, clamped to month length. */
export function dueInMonthAfter(ym, offset, day) {
  const { y, m } = parseYm(addMonths(ym, offset));
  return ymd(y, m, Math.min(day, daysInMonth(y, m)));
}

export function monthLabelEn(ym, short = false) {
  const { y, m } = parseYm(ym);
  return `${(short ? MONTHS_SHORT_EN : MONTHS_EN)[m - 1]} ${y}`;
}

export function dateLabelEn(date) {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

// ---------- tax year ----------

/** Tax year containing a "YYYY-MM" or "YYYY-MM-DD". */
export function taxYearFor(dateOrYm) {
  const { y, m } = parseYm(dateOrYm.slice(0, 7));
  const startYear = m >= INCOME_TAX_DATES.taxYearStartMonth ? y : y - 1;
  const short = `${startYear}-${String(startYear + 1).slice(2)}`;
  const start = ymd(startYear, 4, 1);
  const end = ymd(startYear + 1, 3, 31);
  const newAct = start >= INCOME_TAX_DATES.newActFrom;
  return {
    startYear,
    start,
    end,
    startYm: `${startYear}-04`,
    endYm: `${startYear + 1}-03`,
    label: newAct ? `Tax Year ${short}` : `FY ${short} / AY ${startYear + 1}-${String(startYear + 2).slice(2)}`,
    plainLabel: `Rent earned Apr ${startYear}–Mar ${startYear + 1}`,
    newAct,
  };
}

export function quarterOf(ym) {
  // Indian quarters: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar
  const { y, m } = parseYm(ym);
  const qStartMonth = [1, 4, 7, 10][Math.floor((m - 1) / 3)];
  const startYm = `${y}-${pad(qStartMonth)}`;
  return { startYm, endYm: addMonths(startYm, 2), monthIndex: m - qStartMonth };
}

// ---------- task generation ----------

const EN_TITLES = {
  gstr1_month: (p) => `Report ${monthLabelEn(p.period)} rent invoices`,
  gstr1_quarter: (p) => `Report rent invoices for ${monthLabelEn(p.from, true)}–${monthLabelEn(p.to, true)}`,
  gstr3b_month: (p) => `Report and pay ${monthLabelEn(p.period)} GST`,
  gstr3b_quarter: (p) => `Report and pay GST for ${monthLabelEn(p.from, true)}–${monthLabelEn(p.to, true)}`,
  pmt06: (p) => `Pay ${monthLabelEn(p.period)} GST (quarterly filer)`,
  gst_status: () => "Confirm whether you need GST registration",
  advance_tax: (p) => `Advance-tax check for ${p.plainLabel}`,
  advance_tax_senior: (p) => `Advance-tax check for ${p.plainLabel} (may not apply to you)`,
  tds_certificate: (p) => `Collect TDS certificate from tenant for ${monthLabelEn(p.from, true)}–${monthLabelEn(p.to, true)}`,
  year_end: (p) => `Tax year ends: start your year-end checklist for ${p.plainLabel}`,
  itr: (p) => `Prepare your income-tax return for ${p.plainLabel}`,
  agreement_end: (p) => `Rent agreement ends ${monthLabelEn(p.period)}: renew or update it`,
};

function makeTask(base, today, done) {
  const due = DUE_DATE_OVERRIDES[base.id] || base.due_date;
  const diff = daysBetween(today, due);
  let status;
  if (done && done[base.id]) status = "DONE";
  else if (diff < 0) status = "OVERDUE";
  else if (diff === 0) status = "DUE_TODAY";
  else if (diff <= 7) status = "DUE_SOON";
  else status = "UPCOMING";

  let priority = base.priority || "MEDIUM";
  if (status === "OVERDUE" || status === "DUE_TODAY") priority = "HIGH";
  else if (status === "DUE_SOON" && priority === "LOW") priority = "MEDIUM";
  if (status === "DONE") priority = "LOW";

  return {
    id: base.id,
    key: base.key,
    params: base.params || {},
    title_plain: EN_TITLES[base.key](base.params || {}),
    form_name: base.form_name || "",
    period_label: base.period_label || "",
    due_date: due,
    days_left: diff,
    status,
    priority,
    action: base.action || "",
    link: base.link || null,
    technical_note: base.technical_note || "",
    needs_ca_review: Boolean(base.needs_ca_review),
    later: Boolean(base.later),
    user_marked_done: status === "DONE" ? done[base.id] : null,
  };
}

/**
 * @param {object} p
 * @param {string} p.today             "YYYY-MM-DD"
 * @param {string} p.fromPeriod        first "YYYY-MM" to generate returns for (usually the month being closed)
 * @param {"yes"|"no"|"unsure"} p.gstRegistered
 * @param {"monthly"|"quarterly"|null} p.filingFrequency
 * @param {string} p.stateCode         GST state code
 * @param {boolean} p.seniorCitizen
 * @param {boolean} p.landlordPaysGst  true when the scenario has the landlord charging GST
 * @param {boolean} p.tenantDeductsTds
 * @param {string|null} p.agreementEndMonth
 * @param {object} p.done              { taskId: {date, ack} } user-reported completions
 * @param {number} p.horizonDays
 */
export function generateTasks(p) {
  const today = p.today;
  const horizon = p.horizonDays ?? 100;
  const done = p.done || {};
  const fromPeriod = p.fromPeriod || addMonths(today.slice(0, 7), -1);
  const lastDue = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + horizon);
    return d.toISOString().slice(0, 10);
  })();
  const out = [];
  const within = (due) => due <= lastDue;
  const gstLink = { url: PORTAL_LINKS.gstLogin.url, label: "gst" };

  // --- GST ---
  if (p.gstRegistered === "yes") {
    const quarterly = p.filingFrequency === "quarterly";
    const state = STATES.find((s) => s.code === p.stateCode);
    const qrmpDay = state && state.qrmp === "X" ? GST_DUE_DATES.gstr3bQuarterlyCategoryX : GST_DUE_DATES.gstr3bQuarterlyCategoryY;

    if (!quarterly) {
      for (let i = 0; i < 18; i++) {
        const period = addMonths(fromPeriod, i);
        const d1 = dueInMonthAfter(period, 1, GST_DUE_DATES.gstr1Monthly);
        if (!within(d1)) break;
        out.push({
          id: `gstr1-${period}`, key: "gstr1_month", params: { period }, form_name: "GSTR-1",
          period_label: monthLabelEn(period), due_date: d1, priority: "MEDIUM", link: gstLink,
          action: "Report the rent invoice(s) issued this month on the GST portal.",
          technical_note: `GSTR-1 for ${monthLabelEn(period)}; due ${GST_DUE_DATES.gstr1Monthly}th of following month (r.59). File a nil return if no rent was invoiced.`,
        });
        out.push({
          id: `gstr3b-${period}`, key: "gstr3b_month", params: { period }, form_name: "GSTR-3B",
          period_label: monthLabelEn(period), due_date: dueInMonthAfter(period, 1, GST_DUE_DATES.gstr3bMonthly), priority: "MEDIUM", link: gstLink,
          action: "Report the month's summary and pay any GST due.",
          technical_note: `GSTR-3B for ${monthLabelEn(period)}; due ${GST_DUE_DATES.gstr3bMonthly}th of following month (r.61). Table 3.1 auto-populates from GSTR-1.`,
        });
      }
    } else {
      let q = quarterOf(fromPeriod);
      for (let i = 0; i < 6; i++) {
        // QRMP monthly payment for months 1 and 2 of the quarter
        for (const offset of [0, 1]) {
          const period = addMonths(q.startYm, offset);
          const dp = dueInMonthAfter(period, 1, GST_DUE_DATES.pmt06);
          if (p.landlordPaysGst && period >= fromPeriod && within(dp)) {
            out.push({
              id: `pmt06-${period}`, key: "pmt06", params: { period }, form_name: "PMT-06",
              period_label: monthLabelEn(period), due_date: dp, priority: "MEDIUM", link: gstLink,
              action: "Pay this month's GST using a challan (QRMP scheme).",
              technical_note: `PMT-06 for ${monthLabelEn(period)} under QRMP; due ${GST_DUE_DATES.pmt06}th of following month.`,
            });
          }
        }
        const d1 = dueInMonthAfter(q.endYm, 1, GST_DUE_DATES.gstr1Quarterly);
        if (!within(d1)) break;
        const range = `${monthLabelEn(q.startYm, true)}–${monthLabelEn(q.endYm, true)}`;
        out.push({
          id: `gstr1q-${q.endYm}`, key: "gstr1_quarter", params: { from: q.startYm, to: q.endYm }, form_name: "GSTR-1 (quarterly)",
          period_label: range, due_date: d1, priority: "MEDIUM", link: gstLink,
          action: "Report the quarter's rent invoices on the GST portal.",
          technical_note: `Quarterly GSTR-1 under QRMP; due ${GST_DUE_DATES.gstr1Quarterly}th after quarter end. IFF optional for months 1–2.`,
        });
        out.push({
          id: `gstr3bq-${q.endYm}`, key: "gstr3b_quarter", params: { from: q.startYm, to: q.endYm }, form_name: "GSTR-3B (quarterly)",
          period_label: range, due_date: dueInMonthAfter(q.endYm, 1, qrmpDay), priority: "MEDIUM", link: gstLink,
          action: "Report the quarter's summary and pay any balance GST.",
          technical_note: `Quarterly GSTR-3B; due ${qrmpDay}th after quarter end for ${state ? state.name : "your state"} (category ${state ? state.qrmp : "?"}).`,
        });
        q = quarterOf(addMonths(q.endYm, 1));
      }
    }
  } else if (p.gstRegistered === "unsure") {
    out.push({
      id: "gst-status", key: "gst_status", params: {}, form_name: "GST registration",
      period_label: "", due_date: today, priority: "HIGH", needs_ca_review: true,
      action: "Ask your CA whether your total rent requires GST registration.",
      technical_note: "Registration depends on aggregate turnover across the PAN (s.22) and whether all supplies are under reverse charge (Notification 5/2017-CT).",
    });
  }

  // --- Advance tax: next instalment within horizon ---
  for (let yOff = 0; yOff <= 1; yOff++) {
    let added = false;
    for (const inst of INCOME_TAX_DATES.advanceTaxInstalments) {
      const y = Number(today.slice(0, 4)) + yOff;
      const due = ymd(y, inst.month, inst.day);
      if (due < today || !within(due)) continue;
      const ty = taxYearFor(due);
      out.push({
        id: `advtax-${due}`, key: p.seniorCitizen ? "advance_tax_senior" : "advance_tax",
        params: { plainLabel: ty.plainLabel, startYear: ty.startYear }, form_name: "Advance tax",
        period_label: ty.plainLabel, due_date: due, priority: p.seniorCitizen ? "LOW" : "MEDIUM",
        action: p.seniorCitizen
          ? "If you have no business income, advance tax may not apply. Ask your CA to confirm."
          : "Ask your CA to confirm whether an advance-tax instalment is due and how much.",
        technical_note: `Instalment due ${inst.day}/${inst.month}: ${inst.cumulativePct}% cumulative (s.211).${p.seniorCitizen ? " Resident senior citizens without business income are exempt (s.207)." : ""} Amount needs full income data.`,
        needs_ca_review: !p.seniorCitizen,
      });
      added = true;
      break;
    }
    if (added) break;
  }

  // --- TDS certificate follow-up ---
  if (p.tenantDeductsTds) {
    for (let yOff = 0; yOff <= 1; yOff++) {
      for (const c of INCOME_TAX_DATES.tdsCertificateDue) {
        const y = Number(today.slice(0, 4)) + yOff;
        const due = ymd(y, c.month, c.day);
        if (due < today || !within(due)) continue;
        // quarter that ended before this due date
        const qEndYear = c.quarterEndMonth > c.month ? y - 1 : y;
        const qEnd = `${qEndYear}-${pad(c.quarterEndMonth)}`;
        const qStart = addMonths(qEnd, -2);
        if (out.some((t) => t.id === `tdscert-${qEnd}`)) continue;
        out.push({
          id: `tdscert-${qEnd}`, key: "tds_certificate", params: { from: qStart, to: qEnd }, form_name: "Form 16A",
          period_label: `${monthLabelEn(qStart, true)}–${monthLabelEn(qEnd, true)}`, due_date: due, priority: "LOW",
          action: "Ask your tenant for the TDS certificate and check it matches what they told you.",
          technical_note: `Form 16A for quarter ending ${monthLabelEn(qEnd)}; issued within 15 days of the quarterly TDS return due date (Rule 31). Cross-check with Form 26AS/AIS.`,
        });
      }
    }
  }

  // --- Year end + income-tax return ---
  const ty = taxYearFor(today);
  const yearEnd = ty.end;
  if (within(yearEnd)) {
    out.push({
      id: `yearend-${ty.startYear}`, key: "year_end", params: { plainLabel: ty.plainLabel, startYear: ty.startYear },
      form_name: "Year-end checklist", period_label: ty.plainLabel, due_date: yearEnd, priority: "LOW",
      action: "Collect municipal tax receipts, loan interest certificate, TDS certificates and settle pending rent.",
      technical_note: `${ty.label} ends ${dateLabelEn(yearEnd)}.`,
    });
  }
  // ITR: always shown as the "later" item for the current tax year,
  // and as a live task for last year's return if still before its due date.
  const lastTy = taxYearFor(ymd(ty.startYear, 3, 1)); // previous tax year
  const lastItrDue = ymd(lastTy.startYear + 1, INCOME_TAX_DATES.returnDueNonAudit.month, INCOME_TAX_DATES.returnDueNonAudit.day);
  if (lastItrDue >= today && within(lastItrDue)) {
    out.push(itrTask(lastTy, lastItrDue, false));
  }
  const itrDue = ymd(ty.startYear + 1, INCOME_TAX_DATES.returnDueNonAudit.month, INCOME_TAX_DATES.returnDueNonAudit.day);
  out.push(itrTask(ty, itrDue, !within(itrDue)));

  // --- Agreement end ---
  if (p.agreementEndMonth) {
    const { y, m } = parseYm(p.agreementEndMonth);
    const due = ymd(y, m, daysInMonth(y, m));
    if (due >= today && daysBetween(today, due) <= 90) {
      out.push({
        id: `agreement-${p.agreementEndMonth}`, key: "agreement_end", params: { period: p.agreementEndMonth },
        form_name: "Rent agreement", period_label: monthLabelEn(p.agreementEndMonth), due_date: due, priority: "MEDIUM",
        action: "Renew the agreement or update the rent and end date in KirayaKhata.",
        technical_note: "Registration/stamp duty of a renewed agreement depends on state law.",
      });
    }
  }

  return out
    .map((t) => makeTask(t, today, done))
    .sort((a, b) => (a.later - b.later) || a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
}

function itrTask(ty, due, later) {
  return {
    id: `itr-${ty.startYear}`, key: "itr", params: { plainLabel: ty.plainLabel, startYear: ty.startYear },
    form_name: "Income-tax return", period_label: ty.plainLabel, due_date: due, priority: "MEDIUM", later,
    needs_ca_review: true,
    link: { url: PORTAL_LINKS.incomeTaxLogin.url, label: "incomeTax" },
    action: "Share your year-end rent pack with your CA to prepare the return.",
    technical_note: `${ty.label}. Due date shown is for individuals not requiring audit (s.139(1)); confirm against the current notified date.`,
  };
}

/** Next actionable tasks (not done, not "later"), most urgent first. */
export function nextTasks(tasks, limit = 4) {
  return tasks.filter((t) => t.status !== "DONE" && !t.later).slice(0, limit);
}

// ---------- iCalendar export ----------

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** RFC 5545 line folding: max 75 octets per line, continuation lines start with a space. */
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ""; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function toICS(tasks, nowStamp = "20260101T000000Z") {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KirayaKhata//Compliance Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  ];
  for (const t of tasks) {
    if (t.status === "DONE") continue;
    const d = t.due_date.replace(/-/g, "");
    const next = new Date(`${t.due_date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const end = next.toISOString().slice(0, 10).replace(/-/g, "");
    const desc = [t.action, t.form_name && `(${t.form_name})`, t.link && t.link.url, "Prepared by KirayaKhata — verify before filing."].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@kirayakhata`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(t.title_plain)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P5D", `DESCRIPTION:${icsEscape(t.title_plain)}`, "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", `DESCRIPTION:${icsEscape(t.title_plain)}`, "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}
