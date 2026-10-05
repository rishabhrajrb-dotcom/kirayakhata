// Landing-page interactions. The core "Close this month" feature lives in
// demo.js (untouched). This module adds: mobile nav, the feature-row
// accordion, the hero/closing "own details" shortcut, the Invoice Studio
// (live preview + draft PDF + email draft), and the sample Tax Calendar.
// It reuses the shared rules/config/calendar — it never re-implements tax logic.

import { t } from "./i18n.js";
import { RULES } from "/shared/compliance-config.js";
import { generateTasks, toICS, todayIST, addMonths } from "/shared/calendar.js";
import { downloadInvoicePdf } from "./pdf.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const lang = () => (document.documentElement.lang === "hi" ? "hi" : "en");
const tr = (k, p) => t(lang(), k, p);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (s) => Number(String(s).replace(/[^\d.]/g, "")) || 0;
const rs = (n) => "Rs. " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (m) => tr(`mon.${Number(m)}`);
const dateLabel = (d) => `${Number(d.slice(8, 10))} ${monthName(d.slice(5, 7))} ${d.slice(0, 4)}`;

// ---------- mobile nav ----------
function initNav() {
  const btn = $("#navToggle"), nav = $("#primaryNav");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
  for (const a of $$("a", nav)) a.addEventListener("click", () => { nav.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); });
}

// ---------- feature rows (single-open accordion) ----------
function initRows() {
  const rows = $$("#featureRows .row-item");
  for (const row of rows) {
    const head = $(".row-head", row), panel = $(".row-preview", row);
    head.addEventListener("click", () => {
      const willOpen = !row.classList.contains("is-open");
      for (const r of rows) {
        r.classList.toggle("is-open", r === row && willOpen);
        $(".row-head", r).setAttribute("aria-expanded", String(r === row && willOpen));
        $(".row-preview", r).hidden = !(r === row && willOpen);
      }
    });
  }
}

// ---------- hero / closing "enter my own details" ----------
function initOwnShortcuts() {
  const go = () => {
    const demo = $("#demo");
    demo?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => $("#btn-own")?.click(), 420);
  };
  $("#hero-own")?.addEventListener("click", go);
  $("#close-own")?.addEventListener("click", go);
}

// ---------- Invoice Studio ----------
const RATE = RULES.GST_RENT_RATE.value; // from shared config, not hard-coded here

function studioData() {
  const f = (k) => ($(`[data-sf="${k}"]`)?.value || "").trim();
  const treatment = $('input[name="sgst"]:checked')?.value || "fcm";
  const template = $('input[name="tpl"]:checked')?.value || "classic";
  const rent = num(f("rent"));
  const charges = num(f("charges"));
  const taxable = rent + charges;
  const gst = treatment === "fcm" ? Math.round((taxable * RATE) / 100) : 0;
  const total = taxable + gst;
  let docType, title;
  if (treatment === "fcm") { docType = "TAX_INVOICE"; title = tr("doc.TAX_INVOICE"); }
  else if (treatment === "rcm") { docType = "RENT_RECEIPT"; title = tr("studio.docRcm"); }
  else { docType = "RENT_RECEIPT"; title = tr("doc.RENT_RECEIPT"); }

  const rows = [{ label: `${tr("studio.rentLine")} (${f("period") || "—"})`, amount: rs(rent) }];
  if (charges) rows.push({ label: tr("studio.chargesLine"), amount: rs(charges) });
  if (treatment === "fcm") {
    rows.push({ label: tr("studio.taxable"), amount: rs(taxable) });
    rows.push({ label: `CGST @ ${RATE / 2}%`, amount: rs(gst / 2) });
    rows.push({ label: `SGST @ ${RATE / 2}%`, amount: rs(gst / 2) });
  }
  rows.push({ label: tr("studio.total"), amount: rs(total), strong: true });

  const notes = [];
  if (treatment === "rcm") notes.push(tr("studio.noteRcm", { gst: rs(Math.round((taxable * RATE) / 100)), rate: RATE }));
  if (treatment === "none") notes.push(tr("studio.noteNone"));
  notes.push(tr("studio.noteReceived", { amt: rs(total) }));

  return {
    template, treatment, docType, title, rent, charges, taxable, gst, total, rows, notes,
    landlordName: f("landlordName"), tenantName: f("tenantName"), propertyLabel: f("propertyLabel"),
    period: f("period") || "—", dateLabel: dateLabel(todayIST()),
    rcm: treatment === "rcm",
    footerMeta: `DRAFT / DEMO · ${docType}`,
  };
}

function renderStudioPreview() {
  const d = studioData();
  const doc = $("#studio-doc");
  if (doc) doc.textContent = tr("studio.docLabel", { doc: d.title });
  const sheet = $("#invoicePreview");
  if (!sheet) return;
  const rowsHtml = d.rows.map((r) => `<div class="hc-line ${r.strong ? "hc-total" : ""}"><span>${esc(r.label)}</span><b>${esc(r.amount)}</b></div>`).join("");
  const notesHtml = d.notes.map((n) => `<p class="inv-note">${esc(n)}</p>`).join("");
  sheet.className = `invoice-sheet tpl-${d.template}`;
  sheet.innerHTML = `
    <div class="inv-wm" aria-hidden="true">DRAFT / DEMO</div>
    <div class="inv-head inv-head-${d.template}">
      ${d.template === "letterhead" ? `<p class="inv-lh-name">${esc(d.landlordName || "Landlord")}</p><p class="inv-lh-sub">${esc(d.propertyLabel || "")}</p>` : ""}
      <div class="inv-title-row">
        <span class="inv-title">${esc(d.title)}</span>
        <span class="inv-draft">DRAFT</span>
      </div>
    </div>
    <div class="inv-meta">
      <span>${esc(tr("studio.period"))}: ${esc(d.period)}</span>
      ${d.rcm ? `<span class="inv-rcm">${esc(tr("studio.rcmFlag"))}</span>` : ""}
    </div>
    <div class="inv-parties">
      <div><b>${esc(tr("studio.from"))}</b><span>${esc(d.landlordName || "—")}</span></div>
      <div><b>${esc(tr("studio.to"))}</b><span>${esc(d.tenantName || "—")}</span></div>
    </div>
    <div class="inv-lines">${rowsHtml}</div>
    ${notesHtml}
    <p class="inv-foot">${esc(tr("r.prepared"))}</p>`;
}

function studioEmail() {
  const d = studioData();
  const lines = [
    `Dear ${d.tenantName || "Sir/Madam"},`, "",
    `Please find attached the ${d.title.toLowerCase()} for rent for ${d.period}${d.propertyLabel ? ` (${d.propertyLabel})` : ""}.`, "",
    `Rent: ${rs(d.rent)}`,
    d.charges ? `Other charges: ${rs(d.charges)}` : null,
    d.treatment === "fcm" ? `GST @ ${RATE}%: ${rs(d.gst)}` : null,
    d.rcm ? `GST is payable by you under reverse charge; it is not charged on this invoice.` : null,
    `Total: ${rs(d.total)}`, "",
    "This is a draft prepared with KirayaKhata — please verify before relying on it.", "",
    "Regards,", d.landlordName || "",
  ].filter((x) => x !== null);
  const href = `mailto:?subject=${encodeURIComponent(`${d.title} — rent for ${d.period}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
  window.location.href = href;
}

function initStudio() {
  if (!$("#invoicePreview")) return;
  const rerender = () => renderStudioPreview();
  for (const el of $$("[data-sf], input[name='tpl'], input[name='sgst']")) {
    el.addEventListener("input", rerender);
    el.addEventListener("change", rerender);
  }
  $("#s-pdf")?.addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await downloadInvoicePdf(studioData().template, studioData()); }
    catch (err) { console.error(err); }
    finally { b.disabled = false; }
  });
  $("#s-email")?.addEventListener("click", studioEmail);
  rerender();
}

// ---------- Tax calendar (sample: monthly filer, Maharashtra, commercial) ----------
function taskTitle(tk) {
  const p = tk.params || {};
  return tr(`task.${tk.key}`, {
    period: p.period ? `${monthName(p.period.slice(5, 7))} ${p.period.slice(0, 4)}` : "",
    from: p.from ? `${monthName(p.from.slice(5, 7))} ${p.from.slice(0, 4)}` : "",
    to: p.to ? `${monthName(p.to.slice(5, 7))} ${p.to.slice(0, 4)}` : "",
    ty: p.startYear ? `${monthName("04")} ${p.startYear}–${monthName("03")} ${p.startYear + 1}` : "",
  });
}

let calTasks = [];
function renderCalendar() {
  const list = $("#calList");
  if (!list) return;
  const today = todayIST();
  calTasks = generateTasks({
    today, fromPeriod: addMonths(today.slice(0, 7), -1),
    gstRegistered: "yes", filingFrequency: "monthly", stateCode: "27",
    seniorCitizen: false, landlordPaysGst: true, tenantDeductsTds: true, horizonDays: 365,
  }).filter((t) => !t.later).slice(0, 6);

  list.innerHTML = calTasks.map((tk) => {
    const d = tk.due_date;
    const chip = tk.status === "OVERDUE" || tk.status === "DUE_TODAY" || tk.status === "DUE_SOON"
      ? `<span class="cal-chip chip-soon">${esc(tr(`ts.${tk.status}`))}</span>`
      : `<span class="cal-chip chip-up">${esc(tr(`ts.${tk.status}`))}</span>`;
    const portal = tk.link
      ? `<a class="cal-portal" href="${esc(tk.link.url)}" target="_blank" rel="noopener noreferrer">${esc(tr(tk.link.label === "gst" ? "r.openGst" : "r.openIt"))} ↗</a>
         <details class="cal-steps"><summary>${esc(tr("cal.whatToDo"))}</summary><p>${esc(tr(tk.link.label === "gst" ? "cal.gstSteps" : "cal.itSteps"))}</p></details>`
      : "";
    return `<li class="cal-row">
      <div class="cal-d"><b>${Number(d.slice(8, 10))}</b><span>${esc(monthName(d.slice(5, 7)).slice(0, 3))}</span></div>
      <div class="cal-b">
        <p class="cal-t">${esc(taskTitle(tk))}${chip}</p>
        <p class="cal-m">${esc(tk.form_name)} · ${esc(dateLabel(d))}</p>
        ${portal}
      </div></li>`;
  }).join("");
}

function downloadCalIcs() {
  const ics = toICS(calTasks, new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "kirayakhata-tax-dates.ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function initCalendar() {
  if (!$("#calList")) return;
  renderCalendar();
  $("#cal-ics")?.addEventListener("click", downloadCalIcs);
}

// ---------- boot ----------
function boot() {
  initNav();
  initRows();
  initOwnShortcuts();
  initStudio();
  initCalendar();
  document.addEventListener("kk:lang", () => { renderStudioPreview(); renderCalendar(); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
