const express = require('express');
const { SpendController } = require('../controller/spend.controller');
const { validateReq } = require('../middleware/validate');
const { createSpendSchema, updateSpendSchema } = require('../validations/spend.validations');
const Authorization = require('../utils/authorization.service');
const router = express.Router();

const BASE = '/spend';

router.post(`${BASE}`, Authorization.authenticateToken, validateReq(createSpendSchema), SpendController.createSpend);
router.get(`${BASE}`, Authorization.authenticateToken, SpendController.getAllSpend);
// Stats for the Spending list's stat cards + category breakdown - must come
// before /:code below, or Express would match "stats" as a :code param.
router.get(`${BASE}/stats`, Authorization.authenticateToken, SpendController.getSpendStats);

router.get(`${BASE}/:code`, Authorization.authenticateToken, SpendController.getSpendByCode);
router.patch(`${BASE}/:code`, Authorization.authenticateToken, validateReq(updateSpendSchema), SpendController.updateSpend);
router.delete(`${BASE}/:code`, Authorization.authenticateToken, SpendController.deleteSpend);
// Multipart file upload - takes a form file, not a JSON body, same pattern
// as entity.route.js's add-logo/add-signature.
router.post(`${BASE}/:code/receipt`, Authorization.authenticateToken, SpendController.addReceipt);

module.exports = router;
