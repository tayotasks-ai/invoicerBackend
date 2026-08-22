var mongoose = require('mongoose');
var crypto = require('crypto');
var itemSchema = require('./item.model'); // shared with Invoice - same line-item shape,

// including optional inventory linkage. Creating/updating a quote never
// touches inventory stock (see quote.service.js) - only converting it to a
// real invoice does, via the same reservation path a normal invoice uses.

var quoteSchema = new mongoose.Schema({
  quoteNumber: {
    type: String,
    default: function () {
      return 'quo_' + crypto.randomUUID().split('-').join('').slice(0, 17);
    }
  },
  currency: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  entity: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  items: [itemSchema],
  issueDate: { type: Date, required: true },
  // A quote's counterpart to an invoice's dueDate - how long the quoted
  // price is valid for, not a payment deadline. Optional: a business may not
  // want to commit to an expiry.
  expiryDate: { type: Date },
  // 'sent' -> customer saw it via the public link. 'accepted'/'rejected' are
  // set by the customer themselves (see respondToQuote); 'converted' is set
  // once the business turns it into a real invoice - after that the quote is
  // a historical record, not an active document. 'expired' is informational
  // only for now (no background job flips it automatically yet).
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'],
    default: 'draft'
  },
  notes: { type: String },
  terms: { type: String },
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  total: {
    type: Number,
    required: true,
    default: function () {
      return this.subtotal + this.tax;
    }
  },
  // Set once QuoteService.convertToInvoice creates the real Invoice - kept
  // as a link rather than deleting the quote, so the sales history (what was
  // quoted vs what was actually billed) stays intact.
  convertedInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
}, { timestamps: true });

// Same reasoning as invoice.model.js: runs on pre('validate'), not
// pre('save'), so subtotal/total are computed before Mongoose enforces their
// `required: true` constraints.
quoteSchema.pre('validate', function (next) {
  this.subtotal = (this.items || []).reduce(function (acc, item) {
    return acc + (item.unitPrice || 0) * (item.quantity || 0);
  }, 0);
  this.total = this.subtotal + (this.tax || 0);
  next();
});

quoteSchema.pre('findOneAndUpdate', function (next) {
  var update = this.getUpdate();
  if (update.items) {
    var subtotal = update.items.reduce(function (acc, item) {
      return acc + (item.unitPrice || 0) * (item.quantity || 0);
    }, 0);
    update.subtotal = subtotal;
    update.total = subtotal + (update.tax || 0);
  }
  next();
});

module.exports = mongoose.model('Quote', quoteSchema);
