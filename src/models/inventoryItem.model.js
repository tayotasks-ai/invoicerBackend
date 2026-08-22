var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var crypto = require('crypto');

// A tenant's stock catalog. Invoice line items can optionally reference one
// of these (see item.model.js's `inventoryItem` field) so that creating an
// invoice can draw down real stock instead of just being free-text pricing.
var inventoryItemSchema = new Schema({
  code: {
    type: String,
    default: function () {
      return 'itm_' + crypto.randomUUID().split('-').join('').slice(0, 15);
    },
    unique: true,
  },
  entity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
  },
  name: { type: String, required: true },
  sku: { type: String, default: null },
  description: { type: String },
  unitPrice: { type: Number, required: true, min: 0 },
  // Current stock on hand. Decremented atomically when an invoice is
  // created against this item (InventoryService.reserveStockForItems) and
  // restored if that invoice is later deleted (restoreStockForItems).
  quantityInStock: { type: Number, required: true, default: 0, min: 0 },
  // Purely informational for now - surfaced in the UI as a low-stock
  // highlight, doesn't block anything.
  lowStockThreshold: { type: Number, default: 0 },
  unit: { type: String, default: 'unit' }, // e.g. "pcs", "kg", "box", "hr"
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

inventoryItemSchema.index({ entity: 1, name: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
