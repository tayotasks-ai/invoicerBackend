const BaseRepository = require('./base.repo');
const InventoryItem = require('../models/inventoryItem.model');

class InventoryItemRepository extends BaseRepository {
  constructor() {
    super(InventoryItem);
  }
}

module.exports = new InventoryItemRepository();
