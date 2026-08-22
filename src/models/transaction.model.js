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
  channel: {
    type: String,
    enum: ['PAYSTACK', 'FLUTTERWAVE'],
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
