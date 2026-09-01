const { BRAND, esc } = require("./emailLayout");
const { money } = require("./money");

const FONT_STACK = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

function fmtDate(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// One clean, single-layout statement - unlike invoices, this isn't a
// per-theme document a customer picks; it's an internal/accounting
// artifact, so it just needs to look clearly like invoecr's own branding
// rather than match the business's chosen invoice theme.
function buildStatementHtml(statement) {
  const {
    customer,
    businessName,
    businessAddress,
    logoPath,
    ledger,
    totalInvoiced,
    totalPaid,
    balanceDue,
    currency,
  } = statement;

  const rows = ledger
    .map(
      (entry) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid ${BRAND.ink200};color:${BRAND.ink600};">${fmtDate(entry.date)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${BRAND.ink200};color:${BRAND.ink900};">${esc(entry.label)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${BRAND.ink200};text-align:right;color:${BRAND.ink900};">${entry.type === "invoice" ? money(entry.amount, currency) : ""}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${BRAND.ink200};text-align:right;color:${BRAND.ink900};">${entry.type === "payment" ? money(-entry.amount, currency) : ""}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${BRAND.ink200};text-align:right;font-weight:600;color:${BRAND.ink900};">${money(entry.balance, currency)}</td>
    </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT_STACK};">
  <div style="max-width:720px;margin:0 auto;padding:36px 40px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;">
      <div>
        ${logoPath ? `<img src="${esc(logoPath)}" style="max-height:44px;max-width:160px;object-fit:contain;margin-bottom:8px;" />` : `<div style="width:32px;height:32px;background:${BRAND.lilac600};border-radius:8px;color:#fff;font-weight:700;font-size:13px;line-height:32px;text-align:center;">In</div>`}
        <div style="margin-top:6px;font-size:15px;font-weight:600;color:${BRAND.ink900};">${esc(businessName || "")}</div>
        ${businessAddress ? `<div style="font-size:12px;color:${BRAND.ink500};">${esc(businessAddress)}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:20px;font-weight:700;color:${BRAND.ink900};">Statement of Account</div>
        <div style="font-size:12px;color:${BRAND.ink500};margin-top:4px;">Generated ${fmtDate(new Date())}</div>
      </div>
    </div>

    <div style="background:${BRAND.ink50};border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND.ink500};margin-bottom:4px;">Statement for</div>
      <div style="font-size:15px;font-weight:600;color:${BRAND.ink900};">${esc(customer.name || "")}</div>
      ${customer.email ? `<div style="font-size:12px;color:${BRAND.ink500};">${esc(customer.email)}</div>` : ""}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:${BRAND.ink50};">
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND.ink500};">Date</th>
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND.ink500};">Description</th>
          <th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND.ink500};">Charge</th>
          <th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND.ink500};">Payment</th>
          <th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND.ink500};">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" style="padding:20px 10px;text-align:center;color:${BRAND.ink400};">No activity yet</td></tr>`}
      </tbody>
    </table>

    <div style="margin-top:24px;display:flex;justify-content:flex-end;">
      <table style="font-size:13px;min-width:240px;">
        <tr>
          <td style="padding:5px 12px 5px 0;color:${BRAND.ink500};">Total invoiced</td>
          <td style="padding:5px 0;text-align:right;color:${BRAND.ink900};">${money(totalInvoiced, currency)}</td>
        </tr>
        <tr>
          <td style="padding:5px 12px 5px 0;color:${BRAND.ink500};">Total paid</td>
          <td style="padding:5px 0;text-align:right;color:${BRAND.ink900};">${money(totalPaid, currency)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px 0 0;font-weight:700;color:${BRAND.ink900};border-top:1px solid ${BRAND.ink200};">Balance due</td>
          <td style="padding:8px 0 0;text-align:right;font-weight:700;color:${BRAND.lilac600};border-top:1px solid ${BRAND.ink200};">${money(balanceDue, currency)}</td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildStatementHtml };
