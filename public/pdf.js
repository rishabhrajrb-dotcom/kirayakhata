// Client-side invoice / receipt PDF with jsPDF. Names and GSTINs come from
// this device only and are never sent to the server. Every PDF is marked
// DRAFT / DEMO: an unauthenticated demo has no immutable invoice series.
// (jsPDF's built-in fonts have no ₹ glyph, so amounts use "Rs.")

const DOC_TITLES = {
  TAX_INVOICE: "Tax Invoice",
  TAX_INVOICE_RCM: "Tax Invoice",
  BILL_OF_SUPPLY: "Bill of Supply",
  RENT_RECEIPT: "Rent Receipt",
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const docTitle = (type) => DOC_TITLES[type] || "Rent Receipt";
const rs = (n) => "Rs. " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthEn = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const dateEn = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

let loading;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/jspdf.umd.min.js";
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => { loading = null; reject(new Error("jsPDF failed to load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export async function downloadPdf(resp, local) {
  const JsPDF = await loadJsPdf();
  const r = resp.result;
  const a = r.amounts;
  const type = r.scenario.documentType;
  const registered = resp.input.landlord.gstRegistered === "yes";
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  let y = 20;

  // watermark
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.08 }));
  doc.setTextColor(142, 27, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(70);
  doc.text("DRAFT / DEMO", W / 2, 165, { align: "center", angle: 35 });
  doc.restoreGraphicsState();

  // header band
  doc.setFillColor(142, 27, 27);
  doc.rect(0, 0, W, 8, "F");
  doc.setFillColor(224, 161, 0);
  doc.rect(0, 8, W, 1.5, "F");

  doc.setTextColor(30, 36, 51);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(docTitle(type).toUpperCase(), M, (y += 4));
  doc.setFontSize(9);
  doc.setTextColor(142, 27, 27);
  doc.text("DRAFT / DEMO — not a valid tax document", W - M, y, { align: "right" });
  if (type === "TAX_INVOICE_RCM") {
    doc.setTextColor(30, 36, 51);
    doc.text("Tax payable on reverse charge: YES", M, (y += 6));
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 36, 51);
  doc.setFontSize(10);
  const today = r.today;
  const number = `KK-DEMO-${r.period.month.replace("-", "")}-001`;
  y += 8;
  doc.text(`Number: ${number} (draft numbering)`, M, y);
  doc.text(`Date: ${dateEn(today)}`, W - M, y, { align: "right" });
  doc.text(`Rent period: ${monthEn(r.period.month)}`, M, (y += 6));
  if (r.scenario.placeOfSupply) doc.text(`Place of supply: ${r.scenario.placeOfSupply}`, W - M, y, { align: "right" });

  // parties
  y += 10;
  const colW = (W - 2 * M - 8) / 2;
  const party = (x, title, name, gstin, extra) => {
    let yy = y;
    doc.setFont("helvetica", "bold");
    doc.text(title, x, yy);
    doc.setFont("helvetica", "normal");
    doc.text(name || "—", x, (yy += 6), { maxWidth: colW });
    if (gstin) doc.text(`GSTIN: ${gstin}`, x, (yy += 6));
    if (extra) doc.text(extra, x, (yy += 6), { maxWidth: colW });
    return yy;
  };
  const y1 = party(M, "From (landlord)", local.landlordName, registered ? local.landlordGstin || "_______________" : "", registered ? "" : "Not registered under GST");
  const y2 = party(M + colW + 8, "To (tenant)", local.tenantName, local.tenantGstin, local.propertyLabel ? `Property: ${local.propertyLabel}` : "");
  y = Math.max(y1, y2) + 10;

  // table
  const rows = [[`Rent for ${monthEn(r.period.month)} (SAC ${r.scenario.sac})`, a.contractRent]];
  if (a.otherCharges) rows.push(["Separately billed charges", a.otherCharges]);
  if (type === "TAX_INVOICE" || a.gstOnInvoice) {
    rows.push(["Taxable value", a.taxableValue]);
    rows.push([`CGST @ ${r.scenario.gstRate / 2}%`, a.cgst]);
    rows.push([`SGST @ ${r.scenario.gstRate / 2}%`, a.sgst]);
  }
  rows.push(["Total", a.invoiceTotal]);

  doc.setDrawColor(228, 231, 238);
  doc.setFillColor(250, 250, 247);
  doc.rect(M, y - 5, W - 2 * M, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Description", M + 3, y);
  doc.text("Amount", W - M - 3, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  for (const [label, amt] of rows) {
    y += 8;
    const isTotal = label === "Total";
    if (isTotal) doc.setFont("helvetica", "bold");
    doc.text(label, M + 3, y);
    doc.text(rs(amt), W - M - 3, y, { align: "right" });
    doc.line(M, y + 3, W - M, y + 3);
  }
  doc.setFont("helvetica", "normal");

  y += 12;
  const notes = [];
  if (a.gstByTenant) notes.push(`GST of ${rs(a.gstByTenant)} at ${r.scenario.gstRate}% is payable by the recipient under reverse charge and is not included above.`);
  if (type === "BILL_OF_SUPPLY") notes.push("Exempt supply: renting of residential dwelling for use as residence. No GST charged.");
  if (type === "RENT_RECEIPT") notes.push(`Received with thanks ${rs(a.amountReceived)} towards rent for ${monthEn(r.period.month)}.`);
  if (a.tdsReported) notes.push(`TDS of ${rs(a.tdsReported)} deducted by the tenant (as informed). Amount received: ${rs(a.amountReceived)}.`);
  doc.setFontSize(9.5);
  for (const n of notes) {
    const lines = doc.splitTextToSize(n, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 5 + 2;
  }

  // signature + footer
  doc.setFontSize(10);
  doc.text("Signature", W - M, 250, { align: "right" });
  doc.line(W - M - 50, 244, W - M, 244);
  doc.setFontSize(8.5);
  doc.setTextColor(74, 81, 99);
  doc.text("Prepared with KirayaKhata — verify before filing.", W / 2, 282, { align: "center" });
  doc.text(`Rules ${r.rules_version} · config ${r.config_version} · ${r.scenario.code}`, W / 2, 287, { align: "center" });

  doc.save(`kirayakhata-${type.toLowerCase()}-${r.period.month}-DRAFT.pdf`);
}
