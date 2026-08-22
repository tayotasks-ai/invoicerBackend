const nodemailer = require('nodemailer');

// Lazily built so requiring this module never fails just because SMTP env
// vars aren't set yet (e.g. in local dev before mail is configured).
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

// Best-effort email send. Callers should treat a failed/no-op send as
// non-fatal - a business's invoice should still get created even if their
// customer's email couldn't be delivered.
const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  if (!to) {
    console.warn(`sendEmail: no recipient address, skipping "${subject}"`);
    return { sent: false, reason: 'No recipient address' };
  }
  const client = getTransporter();
  if (!client) {
    console.warn(`sendEmail: SMTP_HOST not configured, skipping email to ${to}: "${subject}"`);
    return { sent: false, reason: 'SMTP not configured' };
  }
  try {
    await client.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@invoecr.app',
      to,
      subject,
      html,
      attachments,
    });
    return { sent: true };
  } catch (error) {
    console.error(`sendEmail: failed to send to ${to}:`, error.message);
    return { sent: false, reason: error.message };
  }
};

// Mirrors whatsapp.util.js's isConfigured() - lets callers (the reminder
// chaser, mainly) check ahead of time whether this channel will actually
// do anything, rather than just letting sendEmail() no-op silently.
function isConfigured() {
  return !!process.env.SMTP_HOST;
}

module.exports = { sendEmail, isConfigured };
