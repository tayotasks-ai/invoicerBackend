var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var crypto = require('crypto');
var { FREQUENCIES } = require('../utils/recurringFrequency.util');

// Deliberately its own shape rather than reusing item.model.js's itemSchema:
// this is a *template* for a not-yet-created invoice line, so `total` (a
// computed invoice field) doesn't apply, and `name`/`unitPrice` aren't
// required at the schema level the way they are on a real Invoice - an
// inventory-linked template item only needs `inventoryItemId` + `quantity`,
// the same way a fresh invoice-creation request does (see
// InventoryService.reserveStockForItems, which every generated draft goes
// through, same as a normal invoice).
var recurringItemSchema = new Schema({
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
  name: { type: String },
  description: { type: String },
  unitPrice: { type: Number },
  quantity: { type: Number, required: true, default: 1 },
}, { _id: false });

var recurringInvoiceSchema = new Schema({
  code: {
    type: String,
    default: function () {
      return 'rec_' + crypto.randomUUID().split('-').join('').slice(0, 17);
    },
  },
  entity: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: { type: [recurringItemSchema], required: true },
  currency: { type: String, required: true },
  tax: { type: Number, default: 0 },
  notes: { type: String },
  terms: { type: String },
  frequency: { type: String, enum: FREQUENCIES, required: true },
  // How many days after each generated draft's issue date its due date
  // should land - mirrors a normal invoice's independently-picked dueDate,
  // just computed relative to whatever date the draft actually gets
  // generated on instead of chosen by hand each cycle.
  dueInDays: { type: Number, default: 14 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  // When the next draft should be generated. Starts equal to startDate;
  // RecurringInvoiceService advances it by one `frequency` interval every
  // time a draft is generated (scheduled job or manual "Generate now").
  nextRunAt: { type: Date, required: true },
  lastGeneratedAt: { type: Date, default: null },
  lastGeneratedInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  generationCount: { type: Number, default: 0 },
}, { timestamps: true });

// The scheduled job's whole query is "isActive && nextRunAt <= now" - see
// RecurringInvoiceService.generateDueInvoices.
recurringInvoiceSchema.index({ isActive: 1, nextRunAt: 1 });

module.exports = mongoose.model('RecurringInvoice', recurringInvoiceSchema);
