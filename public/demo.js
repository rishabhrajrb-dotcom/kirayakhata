// "Close this month's rent" — the working feature.
// The browser runs the same rules for an instant preview; the server result
// (from /api/close-month) is authoritative and is what gets rendered.

import { t } from "./i18n.js";
import { closeMonth, contractRentFor, isValidGstin } from "/shared/rules.js";
import { STATES, RULES, PORTAL_LINKS } from "/shared/compliance-config.js";
import { readyExample } from "/shared/examples.js";
import { todayIST, addMonths, toICS } from "/shared/calendar.js";
import { downloadPdf, docTitle } from "./pdf.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const lang = () => (document.documentElement.lang === "hi" ? "hi" : "en");
const tr = (key, params) => t(lang(), key, params);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const inr = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
const monthName = (m) => tr(`mon.${Number(m)}`);
const monthLabel = (ym) => (ym ? `${monthName(ym.slice(5, 7))} ${ym.slice(0, 4)}` : "");
const monthShort = (ym) => (lang() === "hi" ? monthLabel(ym) : `${monthName(ym.slice(5, 7)).slice(0, 3)} ${ym.slice(0, 4)}`);
const dateLabel = (d) => `${Number(d.slice(8, 10))} ${monthName(d.slice(5, 7))} ${d.slice(0, 4)}`;
const tyLabel = (startYear) => `${monthShort(`${startYear}-04`)}–${monthShort(`${startYear + 1}-03`)}`;

// ---------- local storage (per-viewer conveniences only) ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: fine */ }
  },
};

// ---------- form helpers ----------
const form = $("#close-form");
let step = 1;
let lastResponse = null;

function radio(name) {
  const el = $(`input[name="${name}"]:checked`, form);
  return el ? el.value : null;
}
function setRadio(name, value) {
  for (const el of $$(`input[name="${name}"]`, form)) el.checked = el.value === value;
}
function money(name) {
  const raw = form.elements[name].value.replace(/[^\d]/g, "");
  return raw === "" ? null : Number(raw);
}
function setMoney(name, n) {
  form.elements[name].value = n === null || n === undefined ? "" : Number(n).toLocaleString("en-IN");
}

function buildMonthPickers() {
  const thisYear = Number(todayIST().slice(0, 4));
  for (const box of $$(".month-pick", form)) {
    const key = box.dataset.month;
    const optional = box.dataset.optional === "1";
    const prev = getMonth(key);
    const years = [];
    for (let y = thisYear + (key === "endMonth" ? 10 : 1); y >= thisYear - 10; y--) years.push(y);
    box.innerHTML =
      `<select class="input" data-part="m" aria-label="${esc(tr("f.monthSel"))}">` +
      (optional ? `<option value="">${esc(tr("f.noEnd"))}</option>` : "") +
      Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, "0")}">${esc(monthName(i + 1))}</option>`).join("") +
      `</select><select class="input" data-part="y" aria-label="${esc(tr("f.yearSel"))}">` +
      (optional ? `<option value=""></option>` : "") +
      years.map((y) => `<option value="${y}">${y}</option>`).join("") +
      `</select>`;
    setMonth(key, prev);
  }
}
function getMonth(key) {
  const box = $(`.month-pick[data-month="${key}"]`, form);
  const m = box?.querySelector('[data-part="m"]')?.value;
  const y = box?.querySelector('[data-part="y"]')?.value;
  return m && y ? `${y}-${m}` : null;
}
function setMonth(key, ym) {
  const box = $(`.month-pick[data-month="${key}"]`, form);
  if (!box) return;
  const ms = box.querySelector('[data-part="m"]');
  const ys = box.querySelector('[data-part="y"]');
  if (!ms) return;
  if (!ym) {
    if (box.dataset.optional === "1") { ms.value = ""; ys.value = ""; }
    return;
  }
  ms.value = ym.slice(5, 7);
  ys.value = ym.slice(0, 4);
}

function buildStates() {
  const sel = $("#f-state");
  const prev = sel.value;
  sel.innerHTML = `<option value="">${esc(tr("f.chooseState"))}</option>` +
    STATES.map((s) => `<option value="${s.code}">${esc(s.name)}</option>`).join("");
  sel.value = prev;
}

function conditionMet(expr) {
  if (!expr) return true;
  const [name, vals] = expr.split("=");
  return vals.split(",").includes(radio(name));
}
function applyConditions() {
  for (const el of $$("[data-show]", form)) {
    const show = conditionMet(el.dataset.show) && conditionMet(el.dataset.show2) && conditionMet(el.dataset.show3);
    el.hidden = !show;
  }
}

function gather() {
  const visible = (field) => { const el = $(`[data-field="${field}"]`, form); return el && !el.hidden; };
  return {
    language: lang(),
    example: form.dataset.example === "1",
    landlord: {
      gstRegistered: radio("gstRegistered"),
      filingFrequency: visible("filingFrequency") ? radio("filingFrequency") : null,
      state: $("#f-state").value,
      seniorCitizen: radio("seniorCitizen") === "yes",
    },
    property: {
      type: radio("propertyType"),
      residentialUse: visible("residentialUse") ? radio("residentialUse") : null,
    },
    tenant: {
      type: radio("tenantType"),
      gstRegistered: visible("tenantGst") ? radio("tenantGst") : null,
      composition: visible("composition") ? radio("composition") : null,
    },
    agreement: {
      monthlyRent: money("monthlyRent"),
      startMonth: getMonth("startMonth"),
      yearlyIncreasePct: Number(String(form.elements.yearlyIncreasePct.value).replace(/[^\d.]/g, "")) || 0,
      endMonth: getMonth("endMonth"),
    },
    month: {
      period: getMonth("period"),
      otherCharges: money("otherCharges") ?? 0,
      amountReceived: money("amountReceived"),
      tdsReported: money("tdsReported") ?? 0,
      receiptDate: form.elements.receiptDate.value || null,
    },
    note: form.elements.note.value.trim(),
  };
}

function fill(input) {
  setRadio("gstRegistered", input.landlord.gstRegistered);
  setRadio("filingFrequency", input.landlord.filingFrequency);
  $("#f-state").value = input.landlord.state;
  setRadio("seniorCitizen", input.landlord.seniorCitizen ? "yes" : "no");
  setRadio("propertyType", input.property.type);
  setRadio("residentialUse", input.property.residentialUse);
  setRadio("tenantType", input.tenant.type);
  setRadio("tenantGst", input.tenant.gstRegistered);
  setRadio("composition", input.tenant.composition);
  setMoney("monthlyRent", input.agreement.monthlyRent);
  form.elements.yearlyIncreasePct.value = input.agreement.yearlyIncreasePct;
  setMonth("startMonth", input.agreement.startMonth);
  setMonth("endMonth", input.agreement.endMonth);
  setMonth("period", input.month.period);
  setMoney("otherCharges", input.month.otherCharges);
  setMoney("amountReceived", input.month.amountReceived);
  setMoney("tdsReported", input.month.tdsReported);
  form.elements.receiptDate.value = input.month.receiptDate || "";
  form.elements.note.value = input.note || "";
  $("#note-count").textContent = String(form.elements.note.value.length);
  applyConditions();
  updatePreview();
}

// ---------- validation & steps ----------
const REQUIRED = {
  1: ["gstRegistered", "filingFrequency", "state", "seniorCitizen"],
  2: ["propertyType", "residentialUse", "tenantType", "tenantGst", "composition", "monthlyRent", "startMonth"],
  3: ["period", "amountReceived"],
};

function fieldValue(field, input) {
  switch (field) {
    case "state": return input.landlord.state;
    case "monthlyRent": return input.agreement.monthlyRent;
    case "startMonth": return input.agreement.startMonth;
    case "period": return input.month.period;
    case "amountReceived": return input.month.amountReceived;
    default: return radio(field);
  }
}

function validateStep(n) {
  const input = gather();
  let first = null;
  for (const field of REQUIRED[n]) {
    const box = $(`[data-field="${field}"]`, form);
    if (!box || box.hidden) continue;
    const v = fieldValue(field, input);
    const bad = v === null || v === "" || (field === "monthlyRent" && v < 500);
    box.classList.toggle("has-error", bad);
    let msg = box.querySelector(".q-error");
    if (bad) {
      if (!msg) { msg = document.createElement("p"); msg.className = "q-error"; box.appendChild(msg); }
      msg.textContent = ["monthlyRent", "amountReceived"].includes(field) ? tr("err.amount") : tr("err.required");
      first = first || box;
    } else if (msg) msg.remove();
  }
  if (first) {
    (first.querySelector("input, select") || first).focus();
    return false;
  }
  return true;
}

function showStep(n) {
  step = n;
  for (const el of $$(".step", form)) el.hidden = Number(el.dataset.step) !== n;
  for (const li of $$("#stepper li")) {
    const s = Number(li.dataset.step);
    li.classList.toggle("is-current", s === n);
    li.classList.toggle("is-done", s < n);
    if (s === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  }
  $("#btn-back").hidden = n === 1;
  $("#btn-next").hidden = n === 3;
  $("#btn-submit").hidden = n !== 3;
  hideError();
  updatePreview();
}

function showError(msg) {
  const el = $("#form-error");
  el.textContent = msg;
  el.hidden = false;
}
function hideError() { $("#form-error").hidden = true; }

// ---------- live preview (client-side rules; server result wins) ----------
function updatePreview() {
  const input = gather();
  const pr = $("#preview-rent");
  const pb = $("#preview-bank");
  pr.textContent = "";
  pb.textContent = "";
  if (!input.agreement.monthlyRent || !input.agreement.startMonth || !input.month.period) return;
  const cr = contractRentFor(input.agreement, input.month.period);
  pr.textContent = cr.beforeStart ? tr("pv.before") : tr("pv.rent", { month: monthLabel(input.month.period), amount: inr(cr.rent) });
  if (!input.landlord.gstRegistered || !input.property.type || !input.tenant.type) return;
  try {
    const r = closeMonth({ ...input, month: { ...input.month, amountReceived: input.month.amountReceived ?? 0 } });
    pb.textContent = tr("pv.bank", { amount: inr(r.amounts.expectedBankReceipt) });
  } catch { /* incomplete input: no preview */ }
}

// ---------- submit ----------
async function submit() {
  if (![1, 2, 3].every((n) => { if (!validateStep(n)) { showStep(n); validateStep(n); return false; } return true; })) return;
  const input = gather();
  const btn = $("#btn-submit");
  btn.disabled = true;
  btn.textContent = tr("d.closing");
  hideError();
  try {
    const res = await fetch("/api/close-month", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) return showCap(body.message);
    if (res.status === 400) return showError(tr("err.invalid", { detail: body.message || "" }));
    if (res.status === 503) return showError(tr("err.unavailable"));
    if (!res.ok || !body.result) return showError(tr("err.generic"));
    lastResponse = { ...body, input };
    saveResult(lastResponse);
    renderResult(lastResponse);
    loadStats();
  } catch {
    showError(tr("err.network"));
  } finally {
    btn.disabled = false;
    btn.textContent = tr("d.close");
  }
}

function showCap(message) {
  const el = $("#cap-notice");
  el.textContent = message || t(lang(), "d.remaining", { n: 0 });
  el.hidden = false;
  renderSaved();
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- saved results ----------
function saveResult(resp) {
  const list = store.get("kk.saved", []).filter((x) => x.period !== resp.result.period.month);
  list.unshift({ period: resp.result.period.month, status: resp.result.status, at: todayIST(), resp });
  store.set("kk.saved", list.slice(0, 5));
  renderSaved();
}
function renderSaved() {
  const list = store.get("kk.saved", []);
  $("#saved").hidden = list.length === 0;
  $("#saved-list").innerHTML = list
    .map((x, i) => `<li><button type="button" class="link-btn" data-saved="${i}">${esc(monthLabel(x.period))} · ${esc(statusTitle(x.resp.result))}</button></li>`)
    .join("");
}

// ---------- result ----------
function statusTitle(r) {
  if (r.status === "ATTENTION") {
    const n = r.checks.filter((c) => c.status === "mismatch").length + r.flags.length;
    return n === 1 ? tr("st.ATTENTION_1") : tr("st.ATTENTION", { n });
  }
  return tr(`st.${r.status}`);
}

function fmtParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (typeof v === "number" && !["n", "pct", "rate"].includes(k)) out[k] = inr(v);
    else if (["start", "end"].includes(k) && /^\d{4}-\d{2}$/.test(v)) out[k] = monthLabel(v);
    else out[k] = v;
  }
  return out;
}

function taskTitle(task) {
  const p = task.params || {};
  return tr(`task.${task.key}`, {
    period: p.period ? monthLabel(p.period) : "",
    from: p.from ? monthShort(p.from) : "",
    to: p.to ? monthShort(p.to) : "",
    ty: p.startYear ? tyLabel(p.startYear) : "",
  });
}

function whyButton(id, text) {
  return `<button type="button" class="why-btn" aria-expanded="false" aria-controls="${id}">${esc(tr("r.why"))}</button>` +
    `<p class="why-text" id="${id}" hidden>${esc(text)}</p>`;
}

function row(label, value, why, cls = "") {
  return `<div class="amt-row ${cls}"><div class="amt-label">${esc(label)}${why || ""}</div><div class="amt-value">${value}</div></div>`;
}

function renderResult(resp) {
  const { result: r, explanation: x, meta } = resp;
  const a = r.amounts;
  const done = store.get("kk.done", {});
  const month = monthLabel(r.period.month);
  const rate = r.scenario.gstRate;

  // amounts
  const rentWhy = a.rentIncreases
    ? tr("why.rent", { base: inr(resp.input.agreement.monthlyRent), start: monthLabel(resp.input.agreement.startMonth), pct: resp.input.agreement.yearlyIncreasePct, month, n: a.rentIncreases })
    : tr("why.rentFlat", { base: inr(resp.input.agreement.monthlyRent) });
  const gstWhy = tr(`why.gst.${r.scenario.code}`, { rate });
  const tdsRule = a.tdsReason === "TDS_INDIVIDUAL_YEAR_END" || a.tdsReason === "TDS_INDIVIDUAL_NOT_THIS_MONTH" ? RULES.TDS_RENT_INDIVIDUAL : RULES.TDS_RENT_BUSINESS;
  const tdsWhy = tr(`why.tds.${a.tdsReason}`, { threshold: inr(tdsRule.monthlyThreshold), rate: tdsRule.value });

  let gstRow;
  if (a.gstOnInvoice) gstRow = row(tr("r.gstOnInvoice"), inr(a.gstOnInvoice), whyButton("why-gst", gstWhy));
  else if (a.gstByTenant) gstRow = row(tr("r.gstTenant"), `<span class="muted">${inr(a.gstByTenant)}</span>`, whyButton("why-gst", gstWhy));
  else gstRow = row(tr("r.gst"), esc(r.scenario.code === "UNKNOWN" ? tr("scn.UNKNOWN") : tr("r.noGst")), whyButton("why-gst", gstWhy));

  const diffCls = Math.abs(a.difference) <= 1 ? "is-ok" : "is-bad";
  const amounts = [
    row(tr("r.rent"), inr(a.contractRent), whyButton("why-rent", rentWhy)),
    a.otherCharges ? row(tr("r.charges"), inr(a.otherCharges)) : "",
    gstRow,
    row(tr("r.invoiceTotal"), inr(a.invoiceTotal), "", "is-sub"),
    row(tr("r.tdsReported"), inr(a.tdsReported), whyButton("why-tds", tdsWhy)),
    row(tr("r.tdsExpected"), a.tdsExpected === null ? esc(tr("r.tdsNotSure")) : inr(a.tdsExpected)),
    row(tr("r.expected"), inr(a.expectedBankReceipt), whyButton("why-exp", tr("why.expected", { total: inr(a.invoiceTotal), tds: inr(a.tdsReported), expected: inr(a.expectedBankReceipt) })), "is-sub"),
    row(tr("r.received"), inr(a.amountReceived)),
    row(tr("r.difference"), (a.difference > 0 ? "+" : a.difference < 0 ? "−" : "") + inr(Math.abs(a.difference)),
      whyButton("why-diff", tr("why.difference", { received: inr(a.amountReceived), expected: inr(a.expectedBankReceipt) })), diffCls),
  ].join("");

  const items = [
    ...r.flags.map((f) => ({ cls: "flag", text: tr(`flag.${f.code}`, fmtParams(f.params)) })),
    ...r.checks.map((c) => ({ cls: c.status, text: tr(`check.${c.code}`, fmtParams(c.params)) })),
  ];
  const checks = items.map((i) => `<li class="chk chk-${esc(i.cls)}">${esc(i.text)}</li>`).join("");

  // explanation
  const refused = x.refused
    ? `<div class="refusal" role="alert"><h4>${esc(tr("r.refusedTitle"))}</h4><p>${esc(x.refusal_reason || "")}</p></div>`
    : "";
  const ai = `<div class="ai-card">
      <h4>${esc(tr("r.aiTitle"))} <span class="badge">${esc(meta.used_fallback ? tr("r.aiFallback") : tr("r.aiBadge"))}</span></h4>
      <p>${esc(x.what_this_means)}</p>
      ${x.do_next.length ? `<ul>${x.do_next.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
    </div>`;

  // next actions
  const live = r.tasks.filter((tk) => !tk.later).slice(0, 5);
  const later = r.tasks.filter((tk) => tk.later);
  const pending = live.filter((tk) => !done[tk.id]);
  const urgent = pending.some((tk) => ["OVERDUE", "DUE_TODAY", "DUE_SOON"].includes(tk.status));
  const nextIntro = !urgent && pending[0]
    ? `<p class="up-to-date"><strong>${esc(tr("r.upToDate"))}</strong> ${esc(tr("r.nextExpected", { title: taskTitle(pending[0]), date: dateLabel(pending[0].due_date) }))}</p>`
    : "";
  const firstGst = [...live, ...later].find((tk) => tk.link?.label === "gst")?.id;
  const tasks = [...live, ...later].map((tk) => taskCard(tk, done[tk.id], tk.id === firstGst)).join("");

  // CA panel
  const caRows = [
    [tr("r.caScenario"), `${r.scenario.code} — ${tr(`scn.${r.scenario.code}`)}`],
    [tr("r.caDoc"), `${tr(`doc.${r.scenario.documentType}`)} · ${r.scenario.documentType}`],
    [tr("r.caSac"), r.scenario.sac],
    [tr("r.caPos"), r.scenario.placeOfSupply || "—"],
    [tr("r.caSplit"), a.gstOnInvoice ? `${inr(a.cgst)} / ${inr(a.sgst)}` : "—"],
    [tr("r.caTds"), `${a.tdsReason}${a.tdsExpected !== null ? ` · ${inr(a.tdsExpected)}` : ""} · ${tdsRule.legacySection} (IT Act 1961 ref.)`],
    [tr("r.caPeriod"), `${r.period.month} · ${r.period.taxYear.label}`],
    [tr("r.caVersions"), `${r.rules_version} / ${r.config_version}`],
    [tr("r.caCalculated"), r.calculated_at],
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const sources = r.sources.map((s) => `<li>${esc(s.title)} <span class="muted">(${esc(s.status === "VERIFIED" ? "verified" : tr("r.caUnverified"))})</span></li>`).join("");
  const notes = live.map((tk) => `<li><strong>${esc(tk.form_name)}</strong>: ${esc(tk.technical_note)}</li>`).join("");

  const local = store.get("kk.local", {});
  const field = (name, label, type = "text", extra = "") =>
    `<div class="q"><label class="q-label" for="loc-${name}">${esc(tr(label))}</label><input class="input" id="loc-${name}" data-local="${name}" type="${type}" value="${esc(local[name] || "")}" ${extra}></div>`;

  const el = $("#result");
  el.innerHTML = `
    <div class="status-banner status-${r.status}">
      <p class="status-title">${esc(statusTitle(r))}</p>
      <p class="status-sub">${esc(month)} · ${esc(tr(`scn.${r.scenario.code}`))}</p>
    </div>

    <div class="result-grid">
      <div class="result-col">
        <h3>${esc(tr("r.whatHappened", { month }))}</h3>
        <div class="amounts">${amounts}</div>
        <h4 class="mini-head">${esc(tr("r.checksTitle"))}</h4>
        <ul class="checks">${checks}</ul>
        ${refused}
        ${ai}
      </div>

      <div class="result-col">
        <h3>${esc(tr("r.nextTitle"))}</h3>
        ${nextIntro}
        <ol class="tasks">${tasks}</ol>
        <button type="button" class="btn btn-quiet btn-block" id="btn-ics">${esc(tr("r.addCalendar"))}</button>

        <details class="doc-box">
          <summary>${esc(tr("r.docTitle"))}: ${esc(tr(`doc.${r.scenario.documentType}`))}</summary>
          <p class="q-hint">${esc(tr("r.localNote"))}</p>
          <div class="grid-2">
            ${field("landlordName", "r.landlordName")}
            ${field("tenantName", "r.tenantName")}
            ${field("propertyLabel", "r.propertyLabel")}
            ${field("tenantEmail", "r.tenantEmail", "email")}
            ${field("landlordGstin", "r.landlordGstin", "text", 'maxlength="15" autocapitalize="characters"')}
            ${field("tenantGstin", "r.tenantGstin", "text", 'maxlength="15" autocapitalize="characters"')}
          </div>
          <p class="q-error" id="gstin-error" hidden>${esc(tr("r.gstinBad"))}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" id="btn-pdf">${esc(tr("r.btnPdf"))}</button>
            <button type="button" class="btn btn-quiet" id="btn-email">${esc(tr("r.btnEmail"))}</button>
          </div>
          <p class="q-hint">${esc(tr("r.emailNote"))} ${esc(tr("r.demoNote"))}</p>
        </details>
      </div>
    </div>

    <details class="ca-panel">
      <summary>${esc(tr("r.caTitle"))}</summary>
      <dl class="ca-list">${caRows}</dl>
      <h4 class="mini-head">${esc(tr("r.caSources"))}</h4>
      <ul class="ca-sources">${sources}</ul>
      <h4 class="mini-head">${esc(tr("r.caNotes"))}</h4>
      <ul class="ca-sources">${notes}</ul>
    </details>

    <p class="prepared-stamp">${esc(tr("r.prepared"))}</p>
    ${meta.remaining_today !== undefined ? `<p class="q-hint center">${esc(tr("d.remaining", { n: meta.remaining_today }))}</p>` : ""}
    <div class="btn-row center">
      <button type="button" class="btn btn-quiet" id="btn-edit">${esc(tr("r.edit"))}</button>
      <button type="button" class="btn btn-primary" id="btn-again">${esc(tr("r.again"))}</button>
    </div>`;

  form.hidden = true;
  $("#demo-start").hidden = true;
  el.hidden = false;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function taskCard(tk, mark, showSteps) {
  const status = mark ? "DONE" : tk.status;
  const d = tk.due_date;
  const link = tk.link
    ? `<a class="btn btn-small" href="${esc(tk.link.url)}" target="_blank" rel="noopener noreferrer">${esc(tr(tk.link.label === "gst" ? "r.openGst" : "r.openIt"))}</a>
       ${showSteps ? `<p class="q-hint">${esc(tr("r.portalSteps"))}</p>` : ""}`
    : "";
  const doneUi = tk.later ? "" : mark
    ? `<p class="done-note">${esc(tr("r.markedDone", { date: dateLabel(mark.date) }))}
         <button type="button" class="link-btn" data-undo="${esc(tk.id)}">${esc(tr("r.undo"))}</button></p>
       <label class="q-hint" for="ack-${esc(tk.id)}">${esc(tr("r.ack"))}</label>
       <input class="input input-small" id="ack-${esc(tk.id)}" data-ack="${esc(tk.id)}" value="${esc(mark.ack || "")}" maxlength="40">`
    : `<button type="button" class="link-btn" data-done="${esc(tk.id)}">${esc(tr(tk.link ? "r.markDone" : "r.markDoneOther"))}</button>`;
  return `<li class="task task-${status} ${tk.later ? "task-later" : ""}">
      <div class="task-date"><span class="task-day">${tk.later ? esc(tr("r.later")) : Number(d.slice(8, 10))}</span>
        <span class="task-mon">${tk.later ? "" : esc(monthName(d.slice(5, 7)).slice(0, lang() === "hi" ? 6 : 3))}</span></div>
      <div class="task-body">
        <p class="task-title">${esc(taskTitle(tk))}</p>
        <p class="task-meta">${esc(tk.form_name)} · ${esc(dateLabel(d))}
          ${tk.later ? "" : `<span class="chip chip-${status}">${esc(tr(`ts.${status}`))}</span>`}</p>
        ${link}
        ${doneUi}
      </div>
    </li>`;
}

// ---------- result actions ----------
function onResultClick(e) {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.classList.contains("why-btn")) {
    const p = document.getElementById(b.getAttribute("aria-controls"));
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    p.hidden = open;
    return;
  }
  if (b.dataset.done || b.dataset.undo) {
    const done = store.get("kk.done", {});
    if (b.dataset.done) done[b.dataset.done] = { date: todayIST(), ack: "" };
    else delete done[b.dataset.undo];
    store.set("kk.done", done);
    renderResult(lastResponse);
    return;
  }
  if (b.id === "btn-ics") return downloadIcs();
  if (b.id === "btn-pdf") return makePdf();
  if (b.id === "btn-email") return openEmail();
  if (b.id === "btn-edit") return reopenForm(1);
  if (b.id === "btn-again") {
    const next = { ...lastResponse.input, month: { ...lastResponse.input.month, period: addMonths(lastResponse.input.month.period, 1), amountReceived: null, receiptDate: null }, note: "" };
    form.dataset.example = "0";
    fill(next);
    return reopenForm(3);
  }
}

function onResultInput(e) {
  const el = e.target;
  if (el.dataset.local) {
    const local = store.get("kk.local", {});
    local[el.dataset.local] = el.value.trim();
    store.set("kk.local", local);
    if (el.dataset.local.endsWith("Gstin")) checkGstins();
  }
  if (el.dataset.ack) {
    const done = store.get("kk.done", {});
    if (done[el.dataset.ack]) { done[el.dataset.ack].ack = el.value.trim(); store.set("kk.done", done); }
  }
}

function checkGstins() {
  const local = store.get("kk.local", {});
  const bad = ["landlordGstin", "tenantGstin"].some((k) => local[k] && !isValidGstin(local[k]));
  $("#gstin-error").hidden = !bad;
  return !bad;
}

function reopenForm(n) {
  $("#result").hidden = true;
  $("#demo-start").hidden = false;
  form.hidden = false;
  showStep(n);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function withDone(tasks) {
  const done = store.get("kk.done", {});
  return tasks.map((tk) => (done[tk.id] ? { ...tk, status: "DONE" } : tk));
}

function downloadIcs() {
  const ics = toICS(withDone(lastResponse.result.tasks), new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z");
  saveBlob(new Blob([ics], { type: "text/calendar" }), "kirayakhata-dates.ics");
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function makePdf() {
  if (!checkGstins()) return;
  const btn = $("#btn-pdf");
  btn.disabled = true;
  try {
    await downloadPdf(lastResponse, store.get("kk.local", {}));
  } catch (e) {
    console.error(e);
    showError(tr("err.generic"));
  } finally {
    btn.disabled = false;
  }
}

function openEmail() {
  const r = lastResponse.result;
  const a = r.amounts;
  const local = store.get("kk.local", {});
  const doc = docTitle(r.scenario.documentType);
  const period = `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(r.period.month.slice(5, 7)) - 1]} ${r.period.month.slice(0, 4)}`;
  const lines = [
    `Dear ${local.tenantName || "Sir/Madam"},`,
    "",
    `Please find attached the ${doc.toLowerCase()} for rent for ${period}${local.propertyLabel ? ` (${local.propertyLabel})` : ""}.`,
    "",
    `Rent: ${inr(a.contractRent)}`,
    a.otherCharges ? `Other charges: ${inr(a.otherCharges)}` : null,
    a.gstOnInvoice ? `GST @ ${r.scenario.gstRate}%: ${inr(a.gstOnInvoice)}` : null,
    a.gstByTenant ? `GST is payable by you under reverse charge (${inr(a.gstByTenant)}).` : null,
    `Invoice total: ${inr(a.invoiceTotal)}`,
    a.tdsReported ? `TDS deducted (as informed by you): ${inr(a.tdsReported)}. Kindly share the TDS certificate when available.` : null,
    `Amount received: ${inr(a.amountReceived)}`,
    "",
    "Regards,",
    local.landlordName || "",
  ].filter((l) => l !== null);
  const href = `mailto:${encodeURIComponent(local.tenantEmail || "")}?subject=${encodeURIComponent(`${doc} — rent for ${period}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
  window.location.href = href;
}

// ---------- usage strip ----------
export async function loadStats() {
  try {
    const res = await fetch("/api/stats", { cache: "no-store" });
    if (!res.ok) return;
    const s = await res.json();
    $("#u-rent").textContent = inr(s.total_rent_checked);
    $("#u-months").textContent = String(s.months_closed);
    $("#u-caught").textContent = inr(s.caught_amount);
    const common = $("#u-common");
    common.dataset.code = s.most_common_scenario || "";
    common.textContent = s.most_common_scenario ? tr(`scn.${s.most_common_scenario}`) : tr("usage.none");
  } catch { /* leave placeholders */ }
}

// ---------- wiring ----------
function startExample() {
  form.dataset.example = "1";
  fill({ ...readyExample(), language: lang() });
  form.hidden = false;
  $("#result").hidden = true;
  showStep(3);
  const note = $("#form-error");
  note.textContent = tr("d.exampleLoaded");
  note.hidden = false;
  note.classList.add("is-info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startOwn() {
  form.dataset.example = "0";
  form.reset();
  buildMonthPickers();
  setMonth("period", addMonths(todayIST().slice(0, 7), -1));
  applyConditions();
  form.hidden = false;
  $("#result").hidden = true;
  showStep(1);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function onLanguageChange() {
  buildStates();
  buildMonthPickers();
  if (!form.hidden) updatePreview();
  if (!$("#result").hidden && lastResponse) renderResult(lastResponse);
  renderSaved();
  const common = $("#u-common");
  if (common.dataset.code !== undefined) common.textContent = common.dataset.code ? tr(`scn.${common.dataset.code}`) : tr("usage.none");
}

export function initDemo() {
  if (!form) return;
  buildStates();
  buildMonthPickers();
  applyConditions();
  renderSaved();

  $("#btn-example").addEventListener("click", startExample);
  $("#btn-own").addEventListener("click", startOwn);
  $("#btn-next").addEventListener("click", () => { $("#form-error").classList.remove("is-info"); if (validateStep(step)) showStep(step + 1); });
  $("#btn-back").addEventListener("click", () => showStep(step - 1));
  form.addEventListener("submit", (e) => { e.preventDefault(); $("#form-error").classList.remove("is-info"); submit(); });
  form.addEventListener("change", () => { applyConditions(); updatePreview(); form.dataset.example = "0"; });
  form.addEventListener("input", (e) => {
    if (e.target.name === "note") $("#note-count").textContent = String(e.target.value.length);
    updatePreview();
  });
  for (const name of ["monthlyRent", "amountReceived", "tdsReported", "otherCharges"]) {
    form.elements[name].addEventListener("blur", () => { const n = money(name); if (n !== null) setMoney(name, n); });
  }
  $("#saved-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-saved]");
    if (!b) return;
    lastResponse = store.get("kk.saved", [])[Number(b.dataset.saved)]?.resp;
    if (lastResponse) renderResult(lastResponse);
  });
  const result = $("#result");
  result.addEventListener("click", onResultClick);
  result.addEventListener("input", onResultInput);
  document.addEventListener("kk:lang", onLanguageChange);
  // Header/hero "Try with an example" links load the example directly.
  for (const a of $$('a[href="#demo"]')) a.addEventListener("click", () => setTimeout(startExample, 0));

  loadStats();
}
