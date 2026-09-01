const express = require('express');
const { CustomerController } = require('../controller/customer.controller');
const Authorization = require('../utils/authorization.service');
const router = express.Router();

const BASE = '/customer';

router.get(`${BASE}`, Authorization.authenticateToken, CustomerController.getAllCustomers);
router.get(`${BASE}/export/csv`, Authorization.authenticateToken, CustomerController.exportCsv);
router.get(`${BASE}/:code/statement/download`, Authorization.authenticateToken, CustomerController.downloadCustomerStatement);
router.get(`${BASE}/:code/statement`, Authorization.authenticateToken, CustomerController.getCustomerStatement);
router.get(`${BASE}/:code`, Authorization.authenticateToken, CustomerController.getCustomerByCode);

module.exports = router;
