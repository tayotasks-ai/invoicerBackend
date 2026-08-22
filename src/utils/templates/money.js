// HTML/CSS invoices render through Chromium (see pdf.js), which has full
// Unicode + system-font support - unlike PDFKit's base-14 fonts, so we can
// use real currency symbols instead of falling back to ISO codes.
const SYMBOLS = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
  GHS: 'GH₵',
  KES: 'KSh',
  ZAR: 'R',
};

function money(amount, currency = 'NGN') {
  const symbol = SYMBOLS[currency];
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `${symbol}${formatted}` : `${currency} ${formatted}`;
}

module.exports = { money };
