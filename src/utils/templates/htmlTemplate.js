const { money } = require('./money');
const { FONT_STACKS } = require('./themes');

// Builds the full HTML document Chromium renders to PDF (see pdf.js).
// `invoice` is the plain-object shape assembled by invoice.service.js's
// _pdfDataFor()/downloadInvoiceById():
//   businessName, businessAddress, businessPhone, logoPath, signaturePath,
//   invoiceNumber, issueDate, dueDate, status, currency,
//   customer: { name, email, address },
//   items: [{ name, description, quantity, unitPrice, total }],
//   subtotal, tax, vatRate, total, amountPaid,
//   paymentLink, bank: { accountName, accountNumber, bankName } | null,
//   notes, terms
// `theme` is one entry from themes.js (see getTheme()).
function buildInvoiceHtml(invoice, theme) {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const currency = invoice.currency || 'NGN';
  const vatRate = Number(invoice.vatRate || 0);

  // Real invoices always carry a computed subtotal/tax/total from the
  // Mongoose pre-validate hook (invoice.model.js). Sample/preview data
  // (sampleInvoiceData.js) is a plain object that's never saved, so it
  // doesn't get that hook - falling back to computing from items here keeps
  // template previews accurate without duplicating that math in two places.
  // `!= null` (not a truthy check) so a legitimately free/zero invoice still
  // renders 0 instead of recomputing.
  const itemsSubtotal = items.reduce((acc, item) => {
    const lineTotal = item.total != null ? Number(item.total) : Number(item.unitPrice || 0) * Number(item.quantity || 0);
    return acc + lineTotal;
  }, 0);
  const subtotal = invoice.subtotal != null ? Number(invoice.subtotal) : itemsSubtotal;
  const tax = invoice.tax != null ? Number(invoice.tax) : subtotal * (vatRate / 100);
  // Paystack's processing fee, passed through to the customer - see
  // invoice.model.js's pre-validate hook. Not present on quotes/preview
  // data (which never carry a real Paystack charge), so this defaults to 0
  // rather than being recomputed here.
  const paymentFee = Number(invoice.paymentFee || 0);
  const total = invoice.total != null ? Number(invoice.total) : subtotal + tax + paymentFee;
  const amountPaid = Number(invoice.amountPaid || 0);
  const balanceDue = Math.max(total - amountPaid, 0);
  const hasPartialPayment = amountPaid > 0 && amountPaid < total;
  const isFullyPaid = total > 0 && amountPaid >= total;

  const issueDate = formatDate(invoice.issueDate);
  const dueDate = formatDate(invoice.dueDate);

  const rowsHtml = items
    .map((item) => {
      const lineTotal = item.total != null ? Number(item.total) : Number(item.unitPrice || 0) * Number(item.quantity || 0);
      return `
        <tr>
          <td class="cell cell-desc">
            <div class="item-name">${esc(item.name || item.description || '')}</div>
            ${item.description && item.name ? `<div class="item-sub">${esc(item.description)}</div>` : ''}
          </td>
          <td class="cell cell-num">${esc(item.quantity != null ? item.quantity : '')}</td>
          <td class="cell cell-num">${money(item.unitPrice, currency)}</td>
          <td class="cell cell-num cell-linetotal">${money(lineTotal, currency)}</td>
        </tr>`;
    })
    .join('');

  const itemsTable = `
    <table class="items">
      <thead>
        <tr>
          <th class="cell cell-desc">Description</th>
          <th class="cell cell-num">Qty</th>
          <th class="cell cell-num">Unit Price</th>
          <th class="cell cell-num">Amount</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || emptyItemsRow()}</tbody>
    </table>`;

  const totalsRows = [
    ['Subtotal', money(subtotal, currency)],
    [`Tax${vatRate ? ` (${trimZeros(vatRate)}%)` : ''}`, money(tax, currency)],
  ];
  // Only shown when there actually is one - older invoices created before
  // this existed have paymentFee = 0 and shouldn't show a spurious ₦0 line.
  if (paymentFee > 0) {
    totalsRows.push(['Payment processing fee', money(paymentFee, currency)]);
  }

  const totalsHtml = `
    <div class="totals ${theme.totalStyle === 'card' ? 'totals-card' : ''}">
      ${totalsRows.map(([label, value]) => `
        <div class="totals-row">
          <span>${label}</span>
          <span>${value}</span>
        </div>`).join('')}
      <div class="totals-row totals-grand">
        <span>Total</span>
        <span>${money(total, currency)}</span>
      </div>
      ${hasPartialPayment ? `
        <div class="totals-row totals-paid">
          <span>Amount paid</span>
          <span>-${money(amountPaid, currency)}</span>
        </div>
        <div class="totals-row totals-balance">
          <span>Balance due</span>
          <span>${money(balanceDue, currency)}</span>
        </div>` : ''}
    </div>`;

  const statusHtml = statusBadge(invoice.status, isFullyPaid, hasPartialPayment);
  const logoHtml = buildLogo(theme, invoice.logoPath, invoice.businessName);
  const signatureHtml = buildSignature(invoice.signaturePath, invoice.businessName);
  const payHtml = buildPaymentDetails(invoice, theme, balanceDue, currency, isFullyPaid);
  const businessBlock = `
    <div class="business-name">${esc(invoice.businessName || '')}</div>
    ${invoice.businessAddress ? `<div class="business-line">${esc(invoice.businessAddress)}</div>` : ''}
    ${invoice.businessPhone ? `<div class="business-line">${esc(invoice.businessPhone)}</div>` : ''}
  `;
  const billTo = `
    <div class="block-label">Billed to</div>
    <div class="bill-name">${esc(invoice.customer?.name || '')}</div>
    ${invoice.customer?.email ? `<div class="bill-line">${esc(invoice.customer.email)}</div>` : ''}
    ${invoice.customer?.address ? `<div class="bill-line">${esc(invoice.customer.address)}</div>` : ''}
  `;
  // documentLabel/dueDateLabel let a non-invoice document (currently just
  // quotes - see quote.service.js's _pdfDataFor) reuse this exact renderer
  // with different wording ("Proforma Invoice"/"Valid until" instead of
  // "Invoice"/"Due"). Both default to the original text, so real invoices
  // (which never set these) render byte-for-byte the same as before.
  const documentLabel = invoice.documentLabel || 'Invoice';
  const dueDateLabel = invoice.dueDateLabel || 'Due';
  const metaList = `
    <div class="meta-row"><span>${esc(documentLabel)}</span><span>${esc(invoice.invoiceNumber || '')}</span></div>
    <div class="meta-row"><span>Issued</span><span>${issueDate}</span></div>
    ${dueDate ? `<div class="meta-row"><span>${esc(dueDateLabel)}</span><span>${dueDate}</span></div>` : ''}
  `;
  const notesHtml = invoice.notes || invoice.terms ? `
    <div class="notes">
      ${invoice.notes ? `<div class="notes-block"><div class="block-label">Notes</div><p>${esc(invoice.notes)}</p></div>` : ''}
      ${invoice.terms ? `<div class="notes-block"><div class="block-label">Terms</div><p>${esc(invoice.terms)}</p></div>` : ''}
    </div>` : '';

  const body = renderLayout(theme.layout, {
    theme, logoHtml, signatureHtml, businessBlock, billTo, metaList, statusHtml,
    itemsTable, totalsHtml, payHtml, notesHtml, invoice,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(invoice.invoiceNumber || documentLabel)}</title>
<style>${baseCss(theme)}</style>
</head>
<body class="theme-${theme.id}${theme.dark ? ' theme-dark' : ''}">
  ${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Layout dispatch - each layout arranges the same partials differently.
// ---------------------------------------------------------------------------
function renderLayout(layout, parts) {
  switch (layout) {
    case 'minimal':
      return layoutMinimal(parts);
    case 'split':
      return layoutSplit(parts);
    case 'receipt':
      return layoutReceipt(parts);
    case 'banded':
      return layoutBanded(parts);
    case 'sidebar':
      return layoutSidebar(parts);
    case 'bordered':
    default:
      return layoutBordered(parts);
  }
}

function layoutBordered({ logoHtml, signatureHtml, businessBlock, billTo, metaList, statusHtml, itemsTable, totalsHtml, payHtml, notesHtml }) {
  return `
  <div class="page page-bordered">
    <header class="header header-classic">
      <div class="header-left">
        <div class="doc-title">Invoice</div>
        ${businessBlock}
      </div>
      <div class="header-right">
        ${logoHtml}
        ${statusHtml}
      </div>
    </header>
    <div class="rule"></div>
    <section class="parties">
      <div>${billTo}</div>
      <div class="meta">${metaList}</div>
    </section>
    ${itemsTable}
    <section class="totals-wrap">${totalsHtml}</section>
    ${payHtml}
    ${notesHtml}
    ${signatureHtml}
  </div>`;
}

function layoutMinimal({ signatureHtml, businessBlock, billTo, metaList, statusHtml, itemsTable, totalsHtml, payHtml, notesHtml }) {
  return `
  <div class="page page-minimal">
    <header class="header header-minimal">
      <div class="doc-title">invoice</div>
      ${statusHtml}
    </header>
    <section class="parties parties-minimal">
      <div>${businessBlock}</div>
      <div>${billTo}</div>
      <div class="meta">${metaList}</div>
    </section>
    ${itemsTable}
    <section class="totals-wrap">${totalsHtml}</section>
    ${payHtml}
    ${notesHtml}
    ${signatureHtml}
  </div>`;
}

function layoutSplit({ logoHtml, signatureHtml, businessBlock, billTo, metaList, statusHtml, itemsTable, totalsHtml, payHtml, notesHtml }) {
  return `
  <div class="page page-split">
    <header class="header header-split">
      <div class="header-left">
        ${logoHtml}
        ${businessBlock}
      </div>
      <div class="header-right">
        <div class="doc-title">Invoice</div>
        ${statusHtml}
        <div class="meta meta-right">${metaList}</div>
      </div>
    </header>
    <div class="rule"></div>
    <section class="parties">
      <div>${billTo}</div>
    </section>
    ${itemsTable}
    <section class="totals-wrap">${totalsHtml}</section>
    ${payHtml}
    ${notesHtml}
    ${signatureHtml}
  </div>`;
}

function layoutReceipt({ signatureHtml, businessBlock, billTo, metaList, statusHtml, itemsTable, totalsHtml, payHtml, notesHtml }) {
  return `
  <div class="page page-receipt">
    <header class="header header-receipt">
      ${businessBlock}
      <div class="doc-title">invoice</div>
      ${statusHtml}
    </header>
    <div class="dashed"></div>
    <div class="meta meta-center">${metaList}</div>
    <div class="dashed"></div>
    <section>${billTo}</section>
    ${itemsTable}
    <div class="dashed"></div>
    <section class="totals-wrap">${totalsHtml}</section>
    <div class="dashed"></div>
    ${payHtml}
    ${notesHtml}
    ${signatureHtml}
  </div>`;
}

function layoutBanded({ logoHtml, signatureHtml, businessBlock, billTo, metaList, statusHtml, itemsTable, totalsHtml, payHtml, notesHtml, theme }) {
  return `
  <div class="page page-banded">
    <header class="band ${theme.bandHeight === 'tall' ? 'band-tall' : ''}">
      <div class="band-inner">
        <div class="band-left">
          <div class="doc-title">Invoice</div>
          ${businessBlock}
        </div>
        <div class="band-right">${logoHtml}</div>
      </div>
    </header>
    <div class="page-body">
      <section class="parties">
        <div>${billTo}</div>
        <div class="meta">${metaList}${statusHtml}</div>
      </section>
      ${itemsTable}
      <section class="totals-wrap">${totalsHtml}</section>
      ${payHtml}
      ${notesHtml}
      ${signatureHtml}
    </div>
  </div>`;
}

function layoutSidebar({ logoHtml, signatureHtml, businessBlock, billTo, metaList, statusHtml, itemsTable, totalsHtml, payHtml, notesHtml }) {
  return `
  <div class="page page-sidebar">
    <aside class="sidebar">
      ${logoHtml}
      ${businessBlock}
      <div class="sidebar-rule"></div>
      ${billTo}
      <div class="sidebar-rule"></div>
      ${metaList}
      ${statusHtml}
    </aside>
    <main class="main">
      ${itemsTable}
      <section class="totals-wrap">${totalsHtml}</section>
      ${payHtml}
      ${notesHtml}
      ${signatureHtml}
    </main>
  </div>`;
}

// ---------------------------------------------------------------------------
// Partials
// ---------------------------------------------------------------------------
function buildLogo(theme, logoPath, businessName) {
  if (!theme.showLogo || !logoPath) return '';
  const style = theme.logoStyle || 'plain';
  const alt = esc(businessName || 'Logo');
  if (style === 'watermark') {
    return `<div class="logo logo-watermark"><img src="${esc(logoPath)}" alt="${alt}" /></div>`;
  }
  if (style === 'badge') {
    return `<div class="logo logo-badge"><img src="${esc(logoPath)}" alt="${alt}" /></div>`;
  }
  if (style === 'large-center') {
    return `<div class="logo logo-large-center"><img src="${esc(logoPath)}" alt="${alt}" /></div>`;
  }
  return `<div class="logo logo-plain"><img src="${esc(logoPath)}" alt="${alt}" /></div>`;
}

// Uploaded via Settings -> Business profile (EntityService.addSignature,
// stored as a base64 data: URI). Rendered the same way in every layout -
// unlike the logo, there's no per-theme style variant, since a signature is
// a small, consistent "sign-off" element regardless of the invoice design.
function buildSignature(signaturePath, businessName) {
  if (!signaturePath) return '';
  const alt = esc(businessName ? `${businessName} signature` : 'Signature');
  return `
    <div class="signature-block">
      <img src="${esc(signaturePath)}" alt="${alt}" />
      <div class="signature-line"></div>
      <div class="signature-caption">Authorized signature</div>
    </div>`;
}

function statusBadge(status, isFullyPaid, hasPartialPayment) {
  let label = (status || 'draft').replace(/-/g, ' ');
  let cls = 'status-default';
  if (isFullyPaid || status === 'paid') { label = 'paid'; cls = 'status-paid'; }
  else if (hasPartialPayment || status === 'partially-paid') { label = 'partially paid'; cls = 'status-partial'; }
  else if (status === 'overdue') cls = 'status-overdue';
  else if (status === 'sent') cls = 'status-sent';
  else if (status === 'draft') cls = 'status-draft';
  return `<div class="status-badge ${cls}">${esc(label)}</div>`;
}

function buildPaymentDetails(invoice, theme, balanceDue, currency, isFullyPaid) {
  const bank = invoice.bank;
  const showPayLink = invoice.paymentLink && !isFullyPaid;
  if (!bank && !showPayLink) return '';
  return `
    <section class="payment-details">
      <div class="block-label">Payment details</div>
      ${bank ? `
        <div class="pay-grid">
          <div><span class="pay-label">Bank</span><span>${esc(bank.bankName || '')}</span></div>
          <div><span class="pay-label">Account name</span><span>${esc(bank.accountName || '')}</span></div>
          <div><span class="pay-label">Account number</span><span>${esc(bank.accountNumber || '')}</span></div>
        </div>` : ''}
      ${showPayLink ? `
        <a class="pay-link" href="${esc(invoice.paymentLink)}">
          Pay ${money(balanceDue, currency)} online &rarr;
        </a>` : ''}
    </section>`;
}

function emptyItemsRow() {
  return `<tr><td class="cell cell-desc" colspan="4" style="text-align:center;opacity:.6;">No items</td></tr>`;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function trimZeros(n) {
  return Number(n).toFixed(2).replace(/\.?0+$/, '');
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// CSS - shared skeleton driven entirely by theme tokens, so each of the 12
// themes produces a visually distinct PDF without 12 copies of this file.
// ---------------------------------------------------------------------------
function baseCss(theme) {
  const font = FONT_STACKS[theme.font] || FONT_STACKS.sans;
  const gradientCss = theme.gradient
    ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`
    : theme.accent;

  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ${font};
      color: ${theme.ink};
      background: ${theme.paper};
      font-size: 12px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { width: 100%; min-height: 297mm; padding: 40px 44px; position: relative; }
    .page-bordered { border: 1px solid ${theme.border}; margin: 6px; }
    .page-sidebar, .page-banded { padding: 0; }

    .doc-title { font-size: 26px; font-weight: 700; letter-spacing: 1px; color: ${theme.accent}; text-transform: uppercase; margin-bottom: 6px; }
    .business-name { font-size: 15px; font-weight: 700; color: ${theme.ink}; }
    .business-line, .bill-line { color: ${theme.muted}; font-size: 12px; }
    .block-label { text-transform: uppercase; font-size: 10px; letter-spacing: 1px; color: ${theme.muted}; margin-bottom: 4px; font-weight: 600; }
    .bill-name { font-weight: 700; font-size: 13px; margin-bottom: 2px; }

    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .header-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .header-minimal { align-items: center; }
    .header-minimal .doc-title { font-size: 20px; }

    .rule { height: 1px; background: ${theme.border}; margin: 18px 0; }
    .dashed { border-top: 1px dashed ${theme.border}; margin: 14px 0; }

    .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
    .parties-minimal { flex-wrap: wrap; }
    .meta { text-align: right; min-width: 160px; }
    .meta-right { text-align: left; margin-top: 10px; }
    .meta-center { text-align: center; margin: 10px 0; }
    .meta-row { display: flex; justify-content: space-between; gap: 16px; font-size: 11px; color: ${theme.muted}; margin-bottom: 3px; }
    .meta-row span:last-child { color: ${theme.ink}; font-weight: 600; }

    table.items { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
    table.items thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: ${theme.muted}; border-bottom: 2px solid ${theme.border}; padding: 8px 6px; }
    table.items td.cell { padding: 10px 6px; border-bottom: 1px solid ${theme.border}; vertical-align: top; }
    .cell-num { text-align: right; white-space: nowrap; }
    .cell-linetotal { font-weight: 600; }
    .item-name { font-weight: 600; }
    .item-sub { color: ${theme.muted}; font-size: 11px; margin-top: 2px; }

    .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals { min-width: 260px; }
    .totals-card { background: ${theme.accentSoft}; border-radius: 10px; padding: 14px 18px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 6px; font-size: 12px; color: ${theme.muted}; }
    .totals-grand { border-top: 1px solid ${theme.border}; margin-top: 6px; padding-top: 10px; font-size: 15px; font-weight: 700; color: ${theme.ink}; }
    .totals-paid { color: ${theme.muted}; }
    .totals-balance { font-weight: 700; color: ${theme.accent}; border-top: 1px dashed ${theme.border}; padding-top: 8px; }

    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
    .status-paid { background: #DCFCE7; color: #166534; }
    .status-partial { background: #FEF3C7; color: #92400E; }
    .status-overdue { background: #FEE2E2; color: #991B1B; }
    .status-sent { background: ${theme.accentSoft}; color: ${theme.accent}; }
    .status-draft { background: #F3F4F6; color: #6B7280; }
    .status-default { background: ${theme.accentSoft}; color: ${theme.accent}; }

    .payment-details { border-top: 1px solid ${theme.border}; padding-top: 14px; margin-top: 6px; }
    .pay-grid { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 10px; }
    .pay-grid > div { display: flex; flex-direction: column; font-size: 12px; }
    .pay-label { color: ${theme.muted}; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
    .pay-link { display: inline-block; color: #fff; background: ${theme.accent}; padding: 9px 16px; border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 12px; }

    .notes { margin-top: 18px; display: flex; gap: 30px; flex-wrap: wrap; }
    .notes-block p { margin: 2px 0 0; color: ${theme.muted}; font-size: 11px; max-width: 320px; }

    .signature-block { margin-top: 28px; display: inline-flex; flex-direction: column; align-items: flex-start; }
    .signature-block img { max-height: 50px; max-width: 160px; object-fit: contain; margin-bottom: 6px; }
    .signature-line { width: 160px; border-top: 1px solid ${theme.border}; }
    .signature-caption { margin-top: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: ${theme.muted}; }

    .logo img { display: block; }
    .logo-plain img { max-height: 46px; max-width: 140px; object-fit: contain; }
    .logo-badge img { max-height: 44px; max-width: 44px; object-fit: cover; border-radius: 10px; border: 1px solid ${theme.border}; background: #fff; padding: 3px; }
    .logo-watermark { position: absolute; top: 40px; right: 44px; opacity: .12; }
    .logo-watermark img { max-height: 90px; max-width: 200px; object-fit: contain; }
    .logo-large-center img { max-height: 64px; max-width: 220px; object-fit: contain; margin: 0 auto; display: block; }

    /* ---- banded layout ---- */
    .band { background: ${gradientCss}; color: #fff; padding: 34px 44px; }
    .band-tall { padding: 54px 44px; }
    .band-inner { display: flex; justify-content: space-between; align-items: center; }
    .band .doc-title { color: #fff; }
    .band .business-name { color: #fff; }
    .band .business-line { color: rgba(255,255,255,.8); }
    .band-right .logo-plain img, .band-right .logo-large-center img { filter: drop-shadow(0 1px 3px rgba(0,0,0,.15)); }
    .band-right .logo-badge img { background: #fff; }
    .page-banded .page-body { padding: 30px 44px 40px; }

    /* ---- sidebar layout ---- */
    .page-sidebar { display: flex; min-height: 297mm; }
    .sidebar { width: 220px; background: ${theme.accentSoft}; padding: 34px 26px; color: ${theme.ink}; }
    .sidebar .business-name { margin-top: 10px; }
    .sidebar-rule { height: 1px; background: ${theme.border}; margin: 16px 0; }
    .sidebar .meta-row { flex-direction: column; gap: 0; margin-bottom: 10px; }
    .sidebar .meta-row span:first-child { font-size: 9px; text-transform: uppercase; color: ${theme.muted}; }
    .sidebar .meta-row span:last-child { font-size: 12px; }
    .main { flex: 1; padding: 34px 40px; }

    /* ---- receipt layout ---- */
    .page-receipt { max-width: 420px; margin: 0 auto; text-align: center; }
    .header-receipt { flex-direction: column; align-items: center; gap: 4px; }
    .page-receipt .parties { flex-direction: column; text-align: center; }
    .page-receipt table.items thead { display: none; }
    .page-receipt .item-name { text-align: left; }
    .page-receipt .totals-wrap { justify-content: center; }
    .page-receipt .payment-details { text-align: left; }

    /* ---- dark theme ---- */
    .theme-dark .status-sent, .theme-dark .status-default { background: rgba(212,175,55,.15); color: ${theme.accent}; }
    .theme-dark table.items thead th { color: ${theme.muted}; }
    .theme-dark .pay-link { color: #111; }
  `;
}

module.exports = { buildInvoiceHtml };
