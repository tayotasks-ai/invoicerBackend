const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

const transactionSchema = new Schema({
  code: {
    type: String,
    default: function () {
      return 'txn_' + crypto.randomUUID().replace(/-/g, '').slice(0, 17);
    },
    unique: true,
    index: true,
  },
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  entity: {
    type: Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
  },
  invoice: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    required: false,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: 'NGN',
    enum: ['NGN', 'USD', 'EUR'],
  },
  type: {
    type: String,
    enum: ['PAYMENT'],
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
  },
  // MANUAL covers payment collected outside Paystack entirely (a direct
  // bank transfer, cash, POS in person) - very common for Nigerian SMEs,
  // since not every customer wants to pay a card/online processing fee.
  // See InvoiceService.recordManualPayment.
  channel: {
    type: String,
    enum: ['PAYSTACK', 'FLUTTERWAVE', 'MANUAL'],
  },
  // Only meaningful for channel: 'MANUAL' - how the business actually
  // received the money.
  method: {
    type: String,
    enum: ['bank_transfer', 'cash', 'pos', 'other'],
    default: null,
  },
  // Which Entity recorded this (self-attested, unlike Paystack/Flutterwave
  // transactions which are verified by the processor) - an accountability
  // trail for manual entries specifically. Null for processor-verified
  // transactions.
  recordedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Entity',
    default: null,
  },
  // Set when a manual entry is voided (see InvoiceService.voidManualPayment)
  // - a correction path for mis-recorded entries, since these aren't backed
  // by a processor's own record the way a Paystack transaction is.
  voidedAt: {
    type: Date,
    default: null,
  },
  // Not globally unique at the schema level: a MANUAL entry's reference is
  // free text the merchant types in (their bank transfer reference, say),
  // and two different merchants entering the same bank reference is
  // perfectly normal - it shouldn't 500. Paystack/Flutterwave references are
  // different: those are processor-verified and, since this Paystack
  // account's webhook is shared with another product (see
  // paystack.utils.js), true uniqueness there is what makes the shared
  // webhook safe to route by reference. See the partial unique index below,
  // which enforces uniqueness for exactly those channels.
  // Indexed below via the partial unique index, not with `index: true` here
  // - Mongoose warns ("duplicate schema index") if both declare an index on
  // the same field.
  reference: {
    type: String,
  },
  description: {
    type: String,
  },
  metadata: {
    type: Schema.Types.Mixed,
  },
  response: {
    code: { type: String },
    message: { type: String },
    raw: { type: Schema.Types.Mixed },
  },
  failureReason: {
    type: String,
  },
  initiatedBy: {
    type: String,
  },
  processedAt: {
    type: Date,
  },
}, { timestamps: true });

// Partial unique index: only applies to processor-verified channels
// (currently just Paystack), so a duplicate reference there is a real bug -
// e.g. a collision or a code path accidentally reusing one - not something
// that should ever happen. MANUAL entries (free-text, merchant-typed
// references) are excluded on purpose - see the field comment above.
transactionSchema.index(
  { reference: 1 },
  {
    unique: true,
    partialFilterExpression: { channel: { $in: ['PAYSTACK', 'FLUTTERWAVE'] } },
  }
);

module.exports = mongoose.model('Transaction', transactionSchema);
