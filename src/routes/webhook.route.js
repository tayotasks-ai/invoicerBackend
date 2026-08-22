const express = require('express');
const {
    UtilsController
} = require('../controller/utils.controller');
const router = express.Router();

const BASE = '/webhook';

router.post(`${BASE}`, UtilsController.webhook);

module.exports = router;
