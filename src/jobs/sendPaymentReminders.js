// Standalone entry point for the payment-reminder chaser (email + WhatsApp,
// each attempted best-effort per invoice - see reminder.service.js), meant
// to be invoked by an external scheduler rather than run inside the API
// server's own process - most hosts (Render, Railway, a plain VPS crontab,
// a scheduled GitHub Actions workflow) have a "run this command daily"
// feature, and pointing it at `npm run send-reminders` is simpler and more
// portable than baking a scheduler into the app itself.
//
// Example crontab entry (once a day at 9am):
//   0 9 * * * cd /path/to/invoecr && npm run send-reminders >> logs/reminders.log 2>&1
require('dotenv').config();
const mongoose = require('mongoose');
const dbConnect = require('../config/db.config');
const { ReminderService } = require('../services/reminder.service');

(async () => {
  await dbConnect;
  const summary = await ReminderService.runChaser();
  console.log('Payment reminder chaser finished:', summary);
  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error('Payment reminder chaser failed:', error);
  process.exit(1);
});
