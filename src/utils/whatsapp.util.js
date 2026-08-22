const axios = require('axios');

// WhatsApp payment reminders via Termii (a Business Solution Provider sitting
// on top of Meta's WhatsApp Business Platform), instead of calling Meta's
// Graph API directly. Termii still requires the underlying Meta business
// verification + an approved message template - a BSP does not bypass
// Meta's rules, it just fronts the integration with a simpler API/dashboard
// (in exchange for its own per-message markup). See the setup checklist in
// sample/.env.
//
// Like email.util.js, this no-ops gracefully (with a console warning)
// rather than throwing when unconfigured, so nothing about invoice
// creation/payment ever breaks just because WhatsApp isn't set up yet.

function isConfigured() {
  return !!(process.env.TERMII_API_KEY && process.env.TERMII_DEVICE_ID);
}

// Nigerian numbers show up in every shape a human might type them:
// "0803 123 4567", "+234 803 123 4567", "234-803-1234567". Termii, like
// Meta, wants the destination as digits only, international format without
// a leading '+' (e.g. "2348031234567").
function normalizeNigerianPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  if (digits.length === 10) return '234' + digits; // e.g. 8031234567, no leading 0
  return digits; // already has some other country code - pass through as-is
}

function baseUrl() {
  return process.env.TERMII_BASE_URL || 'https://api.ng.termii.com';
}

// Sends a pre-approved WhatsApp template via Termii's Template API - the
// counterpart to Meta's "business-initiated message" restriction: you
// cannot freeform-message a customer who hasn't messaged you first within
// the last 24 hours, so any outbound reminder has to go through a template
// that's already been approved (built in the Termii dashboard, which
// submits it to Meta for approval on your behalf).
//
// `templateId` is the ID Termii's dashboard shows for the approved
// template. `data` is a flat object of named placeholders substituted into
// that template's body - the key names must match whatever you named the
// variables when building the template (Termii, unlike Meta's raw Graph
// API, uses named keys rather than positional {{1}}, {{2}}... parameters).
async function sendWhatsAppTemplate({ to, templateId, data = {} }) {
  const recipient = normalizeNigerianPhone(to);
  if (!recipient) {
    console.warn(`sendWhatsAppTemplate: no recipient phone number, skipping template "${templateId}"`);
    return { sent: false, reason: 'No recipient phone number' };
  }
  if (!isConfigured()) {
    console.warn(`sendWhatsAppTemplate: TERMII_API_KEY/TERMII_DEVICE_ID not configured, skipping message to ${recipient}`);
    return { sent: false, reason: 'WhatsApp (Termii) not configured' };
  }
  if (!templateId) {
    console.warn(`sendWhatsAppTemplate: no template id configured, skipping message to ${recipient}`);
    return { sent: false, reason: 'No WhatsApp template id configured' };
  }
  try {
    const { data: res } = await axios.post(`${baseUrl()}/api/send/template`, {
      phone_number: recipient,
      device_id: process.env.TERMII_DEVICE_ID,
      template_id: templateId,
      api_key: process.env.TERMII_API_KEY,
      data,
    });
    const ok = res?.code === 'ok';
    if (!ok) {
      console.error(`sendWhatsAppTemplate: Termii rejected message to ${recipient}:`, res?.message || res);
      return { sent: false, reason: res?.message || 'Termii rejected the message' };
    }
    return { sent: true, messageId: res?.message_id, raw: res };
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error(`sendWhatsAppTemplate: failed to send to ${recipient}:`, message);
    return { sent: false, reason: message };
  }
}

module.exports = { sendWhatsAppTemplate, isConfigured, normalizeNigerianPhone };
