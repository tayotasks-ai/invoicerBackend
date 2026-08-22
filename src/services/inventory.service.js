const httpStatus = require("http-status").default;
const { abortIf } = require("../utils/responder");
const inventoryRepo = require("../repo/inventoryItem.repo");

class InventoryService {
  static listInventory = async (entity_id, filters = {}) => {
    const { search } = filters;
    const query = { entity: entity_id };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }
    return inventoryRepo.findAll({ query, sort: { name: 1 } });
  };

  static createInventoryItem = async (data, entity_id) => {
    return inventoryRepo.create({ ...data, entity: entity_id });
  };

  static getInventoryItem = async (code, entity_id) => {
    const item = await inventoryRepo.findOne({ query: { code, entity: entity_id } });
    abortIf(!item, httpStatus.NOT_FOUND, "Inventory item not found");
    return item;
  };

  // Scoped to entity_id, same IDOR-prevention pattern as invoice/customer
  // update - a business can only ever touch its own inventory.
  static updateInventoryItem = async (code, data, entity_id) => {
    const existing = await inventoryRepo.findOne({ query: { code, entity: entity_id } });
    abortIf(!existing, httpStatus.NOT_FOUND, "Inventory item not found");
    const updated = await inventoryRepo.update(existing._id, data);
    return updated;
  };

  static deleteInventoryItem = async (code, entity_id) => {
    const existing = await inventoryRepo.findOne({ query: { code, entity: entity_id } });
    abortIf(!existing, httpStatus.NOT_FOUND, "Inventory item not found");
    return inventoryRepo.delete(existing._id);
  };

  // Called from InvoiceService.createInvoice for every line item that
  // references an inventoryItemId. Deducts stock atomically per item (a
  // conditional $inc that only applies if enough stock exists, so two
  // concurrent invoices against the same item can't both succeed and drive
  // quantityInStock negative), and rolls back everything already deducted
  // if any later item in the same invoice turns out to be short on stock -
  // an invoice should never be created half-fulfilled from inventory.
  //
  // Returns the same items array with inventory-linked entries filled in:
  // `inventoryItem` set, and `name`/`description`/`unitPrice` taken
  // authoritatively from the inventory record (never trusted from the
  // client - otherwise a request could invoice inventory at an arbitrary
  // price). Non-inventory (free-text) items pass through untouched.
  static reserveStockForItems = async (items, entity_id) => {
    const linked = (items || []).filter((i) => i.inventoryItemId);
    if (!linked.length) return items;

    // Fetched purely for nice error messages (item names) before we know
    // whether a given deduction will succeed - the actual deduction below
    // is a separate atomic operation per item, not reliant on this read.
    const ids = linked.map((i) => i.inventoryItemId);
    const nameById = new Map(
      (
        await inventoryRepo.findAll({
          query: { _id: { $in: ids }, entity: entity_id },
        })
      ).map((i) => [String(i._id), i.name])
    );

    const succeeded = []; // [{inventoryItemId, quantity}] - for rollback on failure
    const resolvedById = new Map();

    for (const line of linked) {
      const updated = await inventoryRepo.model.findOneAndUpdate(
        {
          _id: line.inventoryItemId,
          entity: entity_id,
          quantityInStock: { $gte: line.quantity },
        },
        { $inc: { quantityInStock: -line.quantity } },
        { new: true }
      );

      if (!updated) {
        // Undo every deduction already made for this invoice before
        // erroring out.
        await Promise.all(
          succeeded.map((s) =>
            inventoryRepo.model.findByIdAndUpdate(s.inventoryItemId, {
              $inc: { quantityInStock: s.quantity },
            })
          )
        );
        const label = nameById.get(String(line.inventoryItemId));
        abortIf(
          !label,
          httpStatus.NOT_FOUND,
          "Inventory item not found"
        );
        abortIf(
          true,
          httpStatus.BAD_REQUEST,
          `Not enough stock for "${label}" to fulfil this invoice`
        );
      }

      succeeded.push({ inventoryItemId: line.inventoryItemId, quantity: line.quantity });
      resolvedById.set(String(line.inventoryItemId), updated);
    }

    return items.map((line) => {
      if (!line.inventoryItemId) return line;
      const invItem = resolvedById.get(String(line.inventoryItemId));
      return {
        ...line,
        inventoryItem: invItem._id,
        name: line.name || invItem.name,
        description: line.description || invItem.description || "",
        unitPrice: invItem.unitPrice,
      };
    });
  };

  // Called from InvoiceService.deleteInvoice to undo reserveStockForItems
  // when an invoice that drew from inventory is deleted.
  static restoreStockForItems = async (items = []) => {
    const linked = (items || []).filter((i) => i.inventoryItem);
    if (!linked.length) return;
    await Promise.all(
      linked.map((line) =>
        inventoryRepo.model.findByIdAndUpdate(line.inventoryItem, {
          $inc: { quantityInStock: line.quantity },
        })
      )
    );
  };
}

module.exports = {
  InventoryService,
};
