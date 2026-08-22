const express = require('express');
const { CustomerController } = require('../controller/customer.controller');
const Authorization = require('../utils/authorization.service');
const router = express.Router();

const BASE = '/customer';

router.get(`${BASE}`, Authorization.authenticateToken, CustomerController.getAllCustomers);

module.exports = router;
