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
  reference: {
    type: String,
    index: true,
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

module.exports = mongoose.model('Transaction', transactionSchema);
