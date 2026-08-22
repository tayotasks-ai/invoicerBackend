const express = require("express");
const { InventoryController } = require("../controller/inventory.controller");
const { validateReq } = require("../middleware/validate");
const {
  createInventoryItemSchema,
  updateInventoryItemSchema,
} = require("../validations/inventory.validations");
const Authorization = require("../utils/authorization.service");
const router = express.Router();

const BASE = "/inventory";

router.get(
  `${BASE}`,
  Authorization.authenticateToken,
  InventoryController.listInventory
);
router.post(
  `${BASE}`,
  Authorization.authenticateToken,
  validateReq(createInventoryItemSchema),
  InventoryController.createInventoryItem
);
router.get(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  InventoryController.getInventoryItem
);
router.put(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  validateReq(updateInventoryItemSchema),
  InventoryController.updateInventoryItem
);
router.delete(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  InventoryController.deleteInventoryItem
);

module.exports = router;
