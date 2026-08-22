var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
  // Set when this line item was drawn from the entity's inventory catalog
  // (see inventoryItem.model.js) rather than typed in free-text. When set,
  // `name`/`unitPrice` are copied from the inventory record at invoice
  // creation time (a snapshot - later inventory edits don't retroactively
  // change past invoices), and creating the invoice decrements
  // `quantityInStock` by `quantity` (InventoryService.reserveStockForItems).
  inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
  total: {
    type: Number,
    required: true,
    default: function () {
      return this.unitPrice * this.quantity;
    }
  },
}, { _id: false });

module.exports = itemSchema; // Exported for reuse in Invoice
