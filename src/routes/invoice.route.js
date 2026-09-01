const express = require("express");
const { InvoiceController } = require("../controller/invoice.controller");
const { validateReq } = require("../middleware/validate");
const {
  createInvoiceSchema,
  updateInvoiceSchema,
  initiatePaymentSchema,
  recordPaymentSchema,
} = require("../validations/invoice.validations");
const Authorization = require("../utils/authorization.service");
const router = express.Router();

const BASE = "/invoice";

// Invoice routes
router.post(
  `${BASE}`,
  validateReq(createInvoiceSchema),
  Authorization.authenticateToken,
  InvoiceController.createInvoice
);
router.get(
  `${BASE}`,
  Authorization.authenticateToken,
  InvoiceController.getAllInvoices
);
router.get(
  `${BASE}/export/csv`,
  Authorization.authenticateToken,
  InvoiceController.exportCsv
);
router.post(
  `${BASE}/:code/initiate-payment`,
  validateReq(initiatePaymentSchema),
  InvoiceController.initiatePayment
);
// Unauthenticated: this is what the payment link in the invoice email/PDF
// points customers to, so it can't require the business's own login.
router.get(
  `${BASE}/public/:code`,
  InvoiceController.getPublicInvoice
);
router.get(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  InvoiceController.getInvoiceById
);
router.get(
  `${BASE}/:code/download`,
  Authorization.authenticateToken,
  InvoiceController.downloadInvoiceById
);
router.get(
  `${BASE}/:code/transactions`,
  Authorization.authenticateToken,
  InvoiceController.getInvoiceTransactions
);
router.post(
  `${BASE}/:code/send-reminder`,
  Authorization.authenticateToken,
  InvoiceController.sendReminder
);
router.post(
  `${BASE}/:code/record-payment`,
  Authorization.authenticateToken,
  validateReq(recordPaymentSchema),
  InvoiceController.recordPayment
);
router.post(
  `${BASE}/:code/void-payment/:transactionId`,
  Authorization.authenticateToken,
  InvoiceController.voidPayment
);
router.put(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  validateReq(updateInvoiceSchema),
  InvoiceController.updateInvoice
);
router.delete(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  InvoiceController.deleteInvoice
);

module.exports = router;
