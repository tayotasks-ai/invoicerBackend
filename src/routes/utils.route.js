const express = require('express');
const { 
    UtilsController
} = require('../controller/utils.controller');
const { validateReq } = require('../middleware/validate');
const { verifyBankAccount } = require('../validations/utils.validations');
const router = express.Router();

const BASE = '/utils';

router.get(`${BASE}/get-banks`, UtilsController.listBanks);
router.post(`${BASE}/resolve-bank`, validateReq(verifyBankAccount), UtilsController.verifyBanks);

module.exports = router;
