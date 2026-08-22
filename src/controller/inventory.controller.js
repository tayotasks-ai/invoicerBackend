const catchAsync = require("../utils/catchAsync");
const { InventoryService } = require("../services");
const { successResponse } = require("../utils/responder");

class InventoryController {
  static listInventory = catchAsync(async (req, res) => {
    const items = await InventoryService.listInventory(req.user.id, req.query);
    return successResponse(req, res, items, "Operation Successful");
  });

  static createInventoryItem = catchAsync(async (req, res) => {
    const item = await InventoryService.createInventoryItem(req.body, req.user.id);
    return successResponse(req, res, item, "Inventory item created");
  });

  static getInventoryItem = catchAsync(async (req, res) => {
    const item = await InventoryService.getInventoryItem(req.params.code, req.user.id);
    return successResponse(req, res, item, "Operation Successful");
  });

  static updateInventoryItem = catchAsync(async (req, res) => {
    const item = await InventoryService.updateInventoryItem(
      req.params.code,
      req.body,
      req.user.id
    );
    return successResponse(req, res, item, "Inventory item updated");
  });

  static deleteInventoryItem = catchAsync(async (req, res) => {
    await InventoryService.deleteInventoryItem(req.params.code, req.user.id);
    return successResponse(req, res, {}, "Inventory item deleted");
  });
}

module.exports = {
  InventoryController,
};
