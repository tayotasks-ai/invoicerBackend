const express = require('express');
const {
  AuthController,
} = require('../controller/auth.controller');
const { validateReq } = require('../middleware/validate');
const { signInSchema, signUpSchema } = require('../validations/auth.validations');
const router = express.Router();

const BASE = '/auth';

router.post(`${BASE}/sign-in`, validateReq(signInSchema), AuthController.signIn);
router.post(`${BASE}/sign-up`, validateReq(signUpSchema), AuthController.signup);

module.exports = router;
