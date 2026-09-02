var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var crypto = require('crypto');

// Self-logged business spending - the "I spent money" side of outflow,
// deliberately separate from Expense (expense.model.js), which is an
// accounts-payable "request payment details from a vendor" workflow with
// its own pending/submitted/paid lifecycle. A Spend record has no
// lifecycle at all: it's a ledger entry for money that's already gone -
// rent, fuel, a software subscription, supplies bought in person - logged
// by the business itself, with a category, so ReportingService can build a
// real profit/loss breakdown instead of just a cash-flow total. See
// reporting.service.js's getOverview for how this and Expense's paid
// records are combined into one honest outflow figure.
const CATEGORIES = [
  'rent',
  'utilities',
  'transport',
  'inventory_supplies',
  'salaries_wages',
  'marketing',
  'software_subscriptions',
  'professional_fees',
  'bank_charges',
  'equipment',
  'taxes',
  'other',
];

var spendSchema = new Schema(
  {
    code: {
      type: String,
      default: function () {
        return 'spd_' + crypto.randomUUID().split('-').join('').slice(0, 17);
      },
    },
    entity: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    // When the cost was actually incurred, not when it was logged in the
    // app - defaults to now but backdatable (e.g. entering last week's fuel
    // receipts today). This is what ReportingService groups by month on.
    date: { type: Date, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'card', 'pos', 'other'],
      default: 'other',
    },
    // Who it was paid to - free text, not a full Vendor record, same
    // simplification expense.model.js's vendorName/payeeName already make
    // for this app's accounts-payable side.
    payee: { type: String },
    // Same base64-data-URI pattern as Entity.logo/signature (see
    // EntityService._fileToDataUri) - optional, capped at 2MB by the same
    // express-fileupload limit already configured in app.js. Unlike the
    // entity logo, this is never fetched on every authenticated request, so
    // there's no "document gets fat" concern to worry about here.
    receipt: { type: String, default: null },
  },
  { timestamps: true }
);

spendSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('Spend', spendSchema);
