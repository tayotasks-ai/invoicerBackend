const express = require("express");
const { QuoteController } = require("../controller/quote.controller");
const { validateReq } = require("../middleware/validate");
const {
  createQuoteSchema,
  updateQuoteSchema,
  respondToQuoteSchema,
} = require("../validations/quote.validations");
const Authorization = require("../utils/authorization.service");
const router = express.Router();

const BASE = "/quote";

router.post(
  `${BASE}`,
  validateReq(createQuoteSchema),
  Authorization.authenticateToken,
  QuoteController.createQuote
);
router.get(
  `${BASE}`,
  Authorization.authenticateToken,
  QuoteController.getAllQuotes
);
// Unauthenticated: the link emailed to the customer, and their accept/reject
// action from that same page - same pattern as invoice's public/:code.
router.get(
  `${BASE}/public/:code`,
  QuoteController.getPublicQuote
);
router.post(
  `${BASE}/public/:code/respond`,
  validateReq(respondToQuoteSchema),
  QuoteController.respondToQuote
);
router.get(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  QuoteController.getQuoteById
);
router.get(
  `${BASE}/:code/download`,
  Authorization.authenticateToken,
  QuoteController.downloadQuoteById
);
router.post(
  `${BASE}/:code/convert`,
  Authorization.authenticateToken,
  QuoteController.convertToInvoice
);
router.put(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  validateReq(updateQuoteSchema),
  QuoteController.updateQuote
);
router.delete(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  QuoteController.deleteQuote
);

module.exports = router;
