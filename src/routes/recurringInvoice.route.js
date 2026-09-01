const express = require('express');
const { RecurringInvoiceController } = require('../controller/recurringInvoice.controller');
const { validateReq } = require('../middleware/validate');
const { createScheduleSchema, updateScheduleSchema } = require('../validations/recurringInvoice.validations');
const Authorization = require('../utils/authorization.service');
const router = express.Router();

const BASE = '/recurring-invoice';

router.post(
  `${BASE}`,
  Authorization.authenticateToken,
  validateReq(createScheduleSchema),
  RecurringInvoiceController.createSchedule
);
router.get(`${BASE}`, Authorization.authenticateToken, RecurringInvoiceController.getAllSchedules);
router.get(`${BASE}/:code`, Authorization.authenticateToken, RecurringInvoiceController.getSchedule);
router.put(
  `${BASE}/:code`,
  Authorization.authenticateToken,
  validateReq(updateScheduleSchema),
  RecurringInvoiceController.updateSchedule
);
router.delete(`${BASE}/:code`, Authorization.authenticateToken, RecurringInvoiceController.deleteSchedule);
router.post(`${BASE}/:code/pause`, Authorization.authenticateToken, RecurringInvoiceController.pauseSchedule);
router.post(`${BASE}/:code/resume`, Authorization.authenticateToken, RecurringInvoiceController.resumeSchedule);
router.post(`${BASE}/:code/generate-now`, Authorization.authenticateToken, RecurringInvoiceController.generateNow);

module.exports = router;
