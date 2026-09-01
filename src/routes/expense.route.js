const express = require('express');
const { ExpenseController } = require('../controller/expense.controller');
const { validateReq } = require('../middleware/validate');
const {
  requestExpenseSchema,
  submitExpenseSchema,
  recordExpensePaymentSchema,
} = require('../validations/expense.validations');
const Authorization = require('../utils/authorization.service');
const router = express.Router();

const BASE = '/expense';

router.post(
  `${BASE}`,
  Authorization.authenticateToken,
  validateReq(requestExpenseSchema),
  ExpenseController.requestExpense
);
router.get(`${BASE}`, Authorization.authenticateToken, ExpenseController.getAllExpenses);
// Stat cards for the Expenses list - must come before the /:code route
// below, or Express would match "stats" as a :code param instead.
router.get(`${BASE}/stats`, Authorization.authenticateToken, ExpenseController.getExpenseStats);

// Unauthenticated: the link emailed to the vendor, and their one-time
// submission from that same page - same pattern as quote's public/:code.
router.get(`${BASE}/public/:code`, ExpenseController.getPublicExpense);
router.post(
  `${BASE}/public/:code/submit`,
  validateReq(submitExpenseSchema),
  ExpenseController.submitExpenseDetails
);

router.get(`${BASE}/:code`, Authorization.authenticateToken, ExpenseController.getExpenseByCode);
router.post(
  `${BASE}/:code/record-payment`,
  Authorization.authenticateToken,
  validateReq(recordExpensePaymentSchema),
  ExpenseController.recordPayment
);
router.post(`${BASE}/:code/cancel`, Authorization.authenticateToken, ExpenseController.cancelExpense);

module.exports = router;
