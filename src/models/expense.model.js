var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var crypto = require('crypto');

// The Accounts-Payable mirror of Invoice: an Invoice is money the business
// is OWED, an Expense is money the business OWES. Unlike every other
// document in this app, the business doesn't know the amount up front here
// - that's the whole point of the flow (see ExpenseService.requestExpense):
// the business only supplies who they owe (an email address), and the
// vendor fills in how much and where to send it via a public, unguessable
// link. Everything from `amount` down stays empty until that happens.
var expenseSchema = new Schema({
  code: {
    type: String,
    default: function () {
      return 'exp_' + crypto.randomUUID().split('-').join('').slice(0, 17);
    },
  },
  entity: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  // Who the business is expecting payment details from. Deliberately just
  // an email + optional name here rather than a full Vendor model/CRUD -
  // unlike Customer (who a business invoices repeatedly and wants a
  // standing record for), a payee here is usually a one-off or infrequent
  // relationship. Can grow into a real Vendor list later if that turns out
  // to be wanted.
  vendorEmail: { type: String, required: true },
  vendorName: { type: String },
  // The business's own note on what this expense is for - shown to the
  // vendor on the public form for context ("what is Acme Ltd asking me to
  // fill this in for?"), and shown back to the business in their own list.
  description: { type: String },
  // pending: requested, vendor hasn't filled in details yet.
  // submitted: vendor filled in amount + bank details, awaiting payment.
  // paid: the business has paid it (manually or via an automated payout).
  // cancelled: the business withdrew the request before it was fulfilled.
  status: {
    type: String,
    enum: ['pending', 'submitted', 'paid', 'cancelled'],
    default: 'pending',
  },
  amount: { type: Number, default: null },
  currency: { type: String, default: 'NGN' },
  // Filled in by the vendor on the public form - who/what the money should
  // actually be paid to and where. `payeeName` defaults to `vendorName` if
  // the business already supplied one, but the vendor can correct it (the
  // email might belong to an accounts contact, not the payee itself).
  payeeName: { type: String },
  bankAccountNumber: { type: String },
  bankAccountName: { type: String },
  bankName: { type: String },
  bankCode: { type: String, default: null },
  submittedAt: { type: Date, default: null },
  // 'manual': business paid outside invoecr and marked it done themselves.
  // 'seerbit': paid via an automated payout through this app.
  paidVia: { type: String, enum: ['manual', 'seerbit'], default: null },
  paidAt: { type: Date, default: null },
  paymentReference: { type: String, default: null },
  paymentNote: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
