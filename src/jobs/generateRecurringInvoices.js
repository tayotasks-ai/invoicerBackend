// Standalone entry point for generating this cycle's draft invoices from
// every due recurring-invoice schedule, meant to be invoked by an external
// scheduler rather than run inside the API server's own process - same
// reasoning as sendPaymentReminders.js: most hosts (Render, Railway, a
// plain VPS crontab, a scheduled GitHub Actions workflow) have a "run this
// command daily" feature, and pointing it at
// `npm run generate-recurring-invoices` is simpler and more portable than
// baking a scheduler into the app itself.
//
// Every generated invoice lands as a draft (see
// RecurringInvoiceService._generateOne / InvoiceService.createInvoice's
// skipEmail option) - nothing is emailed to a customer until the business
// reviews it and sends it themselves, per how recurring invoices were
// deliberately scoped ("draft for review", not "auto-send").
//
// Example crontab entry (once a day at 7am, before the reminder chaser):
//   0 7 * * * cd /path/to/invoecr && npm run generate-recurring-invoices >> logs/recurring.log 2>&1
require('dotenv').config();
const mongoose = require('mongoose');
const dbConnect = require('../config/db.config');
const { RecurringInvoiceService } = require('../services/recurringInvoice.service');

(async () => {
  await dbConnect;
  const summary = await RecurringInvoiceService.generateDueInvoices();
  console.log('Recurring invoice generation finished:', summary);
  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error('Recurring invoice generation failed:', error);
  process.exit(1);
});
