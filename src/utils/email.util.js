const { Resend } = require('resend');

// Lazily built, same reasoning as before with the nodemailer/SMTP
// transporter: requiring this module should never fail just because
// RESEND_API_KEY isn't set yet (e.g. in local dev before mail is
// configured).
let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.RESEND_API_KEY) return null;
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Best-effort email send. Callers should treat a failed/no-op send as
// non-fatal - a business's invoice should still get created even if their
// customer's email couldn't be delivered.
//
// `attachments` keeps the exact same shape callers already use
// (`{ filename, content: <Buffer> }`) - Resend's SDK accepts a Buffer for
// `content` directly, so no conversion was needed when this moved off
// nodemailer/SMTP.
const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  if (!to) {
    console.warn(`sendEmail: no recipient address, skipping "${subject}"`);
    return { sent: false, reason: 'No recipient address' };
  }
  const resend = getClient();
  if (!resend) {
    console.warn(`sendEmail: RESEND_API_KEY not configured, skipping email to ${to}: "${subject}"`);
    return { sent: false, reason: 'Email (Resend) not configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      // Must be on a domain you've verified in the Resend dashboard, or
      // sends will be restricted to your own account email (Resend's
      // sandbox behavior for unverified domains). See sample/.env.
      from: process.env.RESEND_FROM || 'no-reply@invoecr.app',
      to,
      subject,
      html,
      attachments,
    });
    if (error) {
      console.error(`sendEmail: Resend rejected email to ${to}:`, error.message || error);
      return { sent: false, reason: error.message || 'Resend rejected the email' };
    }
    return { sent: true, messageId: data?.id };
  } catch (error) {
    console.error(`sendEmail: failed to send to ${to}:`, error.message);
    return { sent: false, reason: error.message };
  }
};

// Mirrors whatsapp.util.js's isConfigured() - lets callers (the reminder
// chaser, mainly) check ahead of time whether this channel will actually
// do anything, rather than just letting sendEmail() no-op silently.
function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

module.exports = { sendEmail, isConfigured };
