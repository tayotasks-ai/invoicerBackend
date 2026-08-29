// Shared branded shell for every transactional email this app sends
// (welcome/verify, password reset, staff invite, accountant invite, invoice
// created, quote sent, payment reminder, payment receipt). Mirrors the
// frontend's lilac design language (tailwind.config.js's `lilac` scale and
// `ink` neutral scale, and the small rounded-square "In" logo mark used in
// AuthLayout.vue/AcceptAccountantInvite.vue) so an email doesn't look like a
// different, unbranded product from the app it came from.
//
// Deliberately all inline styles, no <style> block or external stylesheet -
// most webmail clients (Gmail in particular) strip <style> tags or scope
// them unreliably, so inline is the only style that's guaranteed to render
// the same everywhere. This is the standard approach for transactional
// email, not a shortcut.
const BRAND = {
  lilac600: '#7A46D6',
  lilac700: '#6535B3',
  ink900: '#141417',
  ink600: '#52525F',
  ink500: '#71717F',
  ink400: '#9E9EAE',
  ink200: '#E4E4EA',
  ink50: '#F8F8FA',
};

// Inter is the app's font, but most email clients strip @font-face/webfonts
// entirely - this stack just falls through gracefully to each platform's
// native sans-serif when Inter isn't available, same as any web font would.
const FONT_STACK = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// `bodyHtml` is trusted HTML built by the caller (short paragraphs, plus
// occasional infoRow() lines) - callers are responsible for escaping any
// user-supplied text they interpolate into it, same as htmlTemplate.js's
// convention for invoice PDFs.
//
// `cta` is optional: { label, url } renders a single button; omit it for a
// plain informational email with no primary action.
function buildEmailHtml({ preheader = '', heading, bodyHtml, cta = null, footnote = '' }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.ink50};">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>` : ''}
  <div style="background:${BRAND.ink50};padding:40px 16px;font-family:${FONT_STACK};">
    <div style="max-width:480px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:36px;height:36px;background:${BRAND.lilac600};border-radius:10px;color:#ffffff;font-weight:700;font-size:15px;line-height:36px;text-align:center;font-family:${FONT_STACK};">In</div>
        <div style="margin-top:10px;font-size:14px;font-weight:600;color:${BRAND.ink900};">invoecr</div>
      </div>
      <div style="background:#ffffff;border:1px solid ${BRAND.ink200};border-radius:14px;padding:32px 28px;">
        <h1 style="margin:0 0 14px;font-size:18px;line-height:1.4;font-weight:600;color:${BRAND.ink900};font-family:${FONT_STACK};">${esc(heading)}</h1>
        <div style="font-size:14px;line-height:1.65;color:${BRAND.ink600};font-family:${FONT_STACK};">${bodyHtml}</div>
        ${cta ? `
        <div style="margin-top:26px;">
          <a href="${esc(cta.url)}" style="display:inline-block;background:${BRAND.lilac600};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;font-family:${FONT_STACK};">${esc(cta.label)}</a>
        </div>` : ''}
      </div>
      ${footnote ? `<p style="margin:20px 0 0;text-align:center;font-size:12px;line-height:1.5;color:${BRAND.ink400};font-family:${FONT_STACK};">${footnote}</p>` : ''}
    </div>
  </div>
</body>
</html>`;
}

// A small label/value line - for credentials, amounts, invoice numbers,
// etc. inside `bodyHtml`. `value` is escaped here (unlike the free-text
// paragraphs around it), since these are almost always direct
// interpolations of a name/number/token rather than authored prose.
function infoRow(label, value) {
  return `<div style="margin:4px 0;font-size:13px;color:${BRAND.ink500};font-family:${FONT_STACK};"><span>${esc(label)}:</span> <strong style="color:${BRAND.ink900};">${esc(value)}</strong></div>`;
}

module.exports = { buildEmailHtml, infoRow, esc, BRAND };
