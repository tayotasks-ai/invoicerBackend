var mongoose = require('mongoose');
var crypto = require('crypto');
var itemSchema = require('./item.model'); // Assuming itemSchema is exported from './item.model'

var invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    default: function() {
      return 'inv_' + crypto.randomUUID().split('-').join('').slice(0, 17); // Adjusted to use a regular function instead of an arrow function
    }
  },
  currency: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  entity: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  items: [itemSchema],
  issueDate: { type: Date, required: true },
  dueDate: { type: Date },
  status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'partially-paid'], default: 'draft' },
  notes: { type: String },
  terms: { type: String },
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  // Cumulative sum of successful transactions against this invoice - lets an
  // invoice be paid across multiple partial payments. Incremented by the
  // Paystack webhook handler (utils.service.js), never trusted from a client
  // request. `total - amountPaid` is the outstanding balance due.
  amountPaid: { type: Number, default: 0 },
  total: {
    type: Number,
    required: true,
    default: function() {
      return this.subtotal + this.tax; // Regular function expression for `default`
    }
  },
  // WhatsApp payment-reminder chaser (see src/services/reminder.service.js).
  // lastReminderSentAt drives the cooldown so the scheduled chaser can't spam
  // a customer more than once/day; reminderCount is informational.
  lastReminderSentAt: { type: Date, default: null },
  reminderCount: { type: Number, default: 0 },
  // FIRS e-invoicing submission status - see src/services/firs.service.js.
  // Real submission requires an accredited middleware vendor (Flick/Taxlyne
  // etc - see docs/BUSINESS_DIRECTION.md); until one is wired up, every
  // invoice just sits at 'pending_integration'. Modeled now so the frontend
  // and downstream logic have a stable field to read once submission goes
  // live, instead of needing a schema migration later.
  firs: {
    status: {
      type: String,
      enum: ['pending_integration', 'not_required', 'submitted', 'accepted', 'rejected', 'error'],
      default: 'pending_integration',
    },
    irn: { type: String, default: null }, // Invoice Reference Number, returned by FIRS/Peppol on acceptance
    qrCodeUrl: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
}, { timestamps: true });

// Runs on pre('validate') rather than pre('save') so that `subtotal`/`total`
// are computed *before* Mongoose enforces their `required: true` constraints
// - a pre('save') hook fires after validation, which was making every create
// fail validation (or, prior to that, silently computing NaN because the
// items sub-schema field is `unitPrice`, not `price`).
invoiceSchema.pre('validate', function(next) {
  this.subtotal = (this.items || []).reduce(function(acc, item) {
    return acc + (item.unitPrice || 0) * (item.quantity || 0);
  }, 0);
  this.total = this.subtotal + (this.tax || 0);

  next();
});

// Pre-update hook
invoiceSchema.pre('findOneAndUpdate', function(next) {
  var update = this.getUpdate();
  if (update.items) {
    var subtotal = update.items.reduce(function(acc, item) {
      return acc + (item.unitPrice || 0) * (item.quantity || 0);
    }, 0);
    update.subtotal = subtotal;
    update.total = subtotal + (update.tax || 0);
  }

  next();
});

// Export the model
module.exports = mongoose.model('Invoice', invoiceSchema);
