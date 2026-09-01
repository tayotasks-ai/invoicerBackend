const invoiceRepo = require('../repo/invoice.repo');
const { sendWhatsAppTemplate, isConfigured: isWhatsAppConfigured } = require('../utils/whatsapp.util');
const { sendEmail, isConfigured: isEmailConfigured } = require('../utils/email.util');
const { money } = require('../utils/templates/money');
const { getPlan, effectivePlanId } = require('../config/plans');
const { buildEmailHtml, esc } = require('../utils/templates/emailLayout');

// Only remind for invoices that are actually still owed, and only once
// every REMINDER_COOLDOWN_HOURS per invoice (the scheduled chaser runs
// daily - this is a safety net against running it more than once and
// double-messaging someone). REMINDER_LOOKAHEAD_DAYS controls how early a
// "your invoice is due soon" nudge goes out before the due date.
const REMINDER_COOLDOWN_HOURS = 24;
const REMINDER_LOOKAHEAD_DAYS = 3;

// Must match a WhatsApp template already built and approved in the Termii
// dashboard (Termii submits it to Meta for approval on your behalf) - Meta
// doesn't let you send freeform business-initiated messages, only approved
// templates, and Termii doesn't change that. See sample/.env for the exact
// body text/variable names to use when building the template.
const TERMII_REMINDER_TEMPLATE_ID = process.env.TERMII_WHATSAPP_TEMPLATE_ID || '';

class ReminderService {
  // Invoices that are billable (sent/overdue/partially-paid, i.e. not
  // draft/paid), due within the lookahead window or already overdue, and
  // not reminded within the cooldown window.
  static findDueForReminder = async () => {
    const cooldownCutoff = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000);
    const lookaheadCutoff = new Date(Date.now() + REMINDER_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    return invoiceRepo.findAll({
      query: {
        status: { $in: ['sent', 'overdue', 'partially-paid'] },
        dueDate: { $ne: null, $lte: lookaheadCutoff },
        $or: [{ lastReminderSentAt: null }, { lastReminderSentAt: { $lte: cooldownCutoff } }],
      },
      populate: [
        { path: 'customer', select: 'name email phone' },
        { path: 'entity', select: 'name whatsappRemindersEnabled plan' },
      ],
    });
  };

  static _reminderContext = (invoice) => {
    const balanceDue = Math.max(Number(invoice.total || 0) - Number(invoice.amountPaid || 0), 0);
    const now = new Date();
    const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    let dueLabel = 'is due soon';
    if (due) {
      const days = Math.round((due - now) / (1000 * 60 * 60 * 24));
      if (days < 0) dueLabel = `was due ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
      else if (days === 0) dueLabel = 'is due today';
      else dueLabel = `is due in ${days} day${days === 1 ? '' : 's'}`;
    }
    return {
      customerName: invoice.customer?.name || 'there',
      invoiceNumber: invoice.invoiceNumber,
      businessName: invoice.entity?.name || 'your supplier',
      balanceDueLabel: money(balanceDue, invoice.currency),
      dueLabel,
      paymentLink: `${process.env.APP_URL || ''}/payment/${invoice.invoiceNumber}`,
    };
  };

  // Email is the lower-friction channel - sent via Resend's API, no vendor
  // business-verification or template approval needed, so it's the one
  // that actually works the moment sample/.env's RESEND_API_KEY is filled
  // in (and RESEND_FROM's domain is verified in the Resend dashboard).
  // Kept as its own method so sendReminderForInvoice can attempt it
  // independently of WhatsApp.
  static _sendEmailReminder = async (invoice, ctx) => {
    const email = invoice.customer?.email;
    if (!email) {
      return { sent: false, reason: 'Customer has no email address on file' };
    }
    if (!isEmailConfigured()) {
      return { sent: false, reason: 'Email (Resend) not configured' };
    }
    return sendEmail({
      to: email,
      subject: `Reminder: Invoice ${ctx.invoiceNumber} ${ctx.dueLabel}`,
      html: buildEmailHtml({
        preheader: `Invoice ${ctx.invoiceNumber} ${ctx.dueLabel} - ${ctx.balanceDueLabel} due.`,
        heading: `Payment reminder from ${esc(ctx.businessName)}`,
        bodyHtml: `<p style="margin:0;">Hi ${esc(ctx.customerName)}, this is a friendly reminder that invoice <strong>${esc(ctx.invoiceNumber)}</strong> from ${esc(ctx.businessName)} for <strong>${esc(ctx.balanceDueLabel)}</strong> ${esc(ctx.dueLabel)}.</p>`,
        cta: { label: `Pay ${ctx.balanceDueLabel} now`, url: ctx.paymentLink },
        footnote: "If you've already paid, please disregard this message.",
      }),
    });
  };

  static _sendWhatsAppReminder = async (invoice, ctx) => {
    const phone = invoice.customer?.phone;
    if (!phone) {
      return { sent: false, reason: 'Customer has no phone number on file' };
    }
    return sendWhatsAppTemplate({
      to: phone,
      templateId: TERMII_REMINDER_TEMPLATE_ID,
      data: {
        customer_name: ctx.customerName,
        invoice_number: ctx.invoiceNumber,
        business_name: ctx.businessName,
        amount_due: ctx.balanceDueLabel,
        due_label: ctx.dueLabel,
        payment_link: ctx.paymentLink,
      },
    });
  };

  // Sends one reminder, regardless of cooldown - used both by the batch
  // chaser (which already filtered by cooldown in findDueForReminder) and
  // by the manual "send reminder now" button (InvoiceService.sendReminder),
  // where an explicit request should always go out immediately.
  //
  // Attempts email and WhatsApp independently and best-effort - each one
  // is skipped (not failed) if its channel isn't configured or the
  // customer has no address/number for it, and a success on either channel
  // counts as the reminder having gone out. This isn't "email first, then
  // WhatsApp as fallback" - both fire every cycle, since email costs
  // nothing extra to attempt and a customer who gets nudged twice via two
  // channels is not a real problem.
  static sendReminderForInvoice = async (invoice) => {
    const ctx = ReminderService._reminderContext(invoice);
    const [email, whatsapp] = await Promise.all([
      ReminderService._sendEmailReminder(invoice, ctx),
      ReminderService._sendWhatsAppReminder(invoice, ctx),
    ]);
    const sent = email.sent || whatsapp.sent;
    if (sent) {
      await invoiceRepo.update(invoice._id, {
        lastReminderSentAt: new Date(),
        reminderCount: (invoice.reminderCount || 0) + 1,
      });
    }
    return { sent, email, whatsapp };
  };

  // Batch entry point for the scheduled chaser - see
  // src/jobs/sendPaymentReminders.js, which any external scheduler (cron,
  // your host's "scheduled jobs" feature, a GitHub Actions cron workflow)
  // can invoke daily via `npm run send-reminders`.
  static runChaser = async () => {
    if (!isEmailConfigured() && !isWhatsAppConfigured()) {
      console.warn('ReminderService.runChaser: neither email (Resend) nor WhatsApp is configured (see sample/.env), nothing to do.');
      return { sent: 0, skipped: 0, failed: 0, total: 0 };
    }
    const invoices = await ReminderService.findDueForReminder();
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const invoice of invoices) {
      if (invoice.entity && invoice.entity.whatsappRemindersEnabled === false) {
        skipped++;
        continue;
      }
      // Reminders are a Growth-plan+ feature (see config/plans.js) - a
      // Free/Starter business's invoices are silently skipped here rather
      // than erroring, same treatment as whatsappRemindersEnabled === false
      // above. The manual "send reminder now" button enforces the same
      // thing loudly instead (see InvoiceService.sendReminder), since that's
      // an explicit user action that deserves an explanation.
      if (!getPlan(effectivePlanId(invoice.entity)).allowReminders) {
        skipped++;
        continue;
      }
      const result = await ReminderService.sendReminderForInvoice(invoice);
      if (result.sent) {
        sent++;
      } else {
        // Only "skipped" (not a real failure) if BOTH channels were skipped
        // for benign reasons (no contact info / not configured) rather than
        // an actual send error on either one.
        const benign = (r) => !r || /phone|email address|not configured/i.test(r.reason || '');
        if (benign(result.email) && benign(result.whatsapp)) skipped++;
        else failed++;
      }
    }
    return { sent, skipped, failed, total: invoices.length };
  };
}

module.exports = { ReminderService };
