const { getTheme } = require('./templates/themes');
const { buildInvoiceHtml } = require('./templates/htmlTemplate');
const { htmlToPdfBuffer } = require('./templates/pdf');

// Renders an invoice to a PDF Buffer using its selected theme (falls back to
// the default theme if `invoice.template` is missing/unrecognised - see
// getTheme() in templates/themes.js). Nothing is written to disk; callers
// stream/email/upload the returned Buffer directly.
//
// Expected shape of `invoice` - see htmlTemplate.js's buildInvoiceHtml() for
// the full field list.
async function generateInvoice(invoice) {
  const theme = getTheme(invoice.template);
  const html = buildInvoiceHtml(invoice, theme);
  return htmlToPdfBuffer(html);
}

module.exports = { generateInvoice };
