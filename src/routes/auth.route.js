const express = require('express');
const {
  AuthController,
} = require('../controller/auth.controller');
const { validateReq } = require('../middleware/validate');
const Authorization = require('../utils/authorization.service');
const {
  signInSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validations/auth.validations');
const router = express.Router();

const BASE = '/auth';

router.post(`${BASE}/sign-in`, validateReq(signInSchema), AuthController.signIn);
router.post(`${BASE}/sign-up`, validateReq(signUpSchema), AuthController.signup);

router.post(
  `${BASE}/forgot-password`,
  validateReq(forgotPasswordSchema),
  AuthController.forgotPassword
);
router.post(
  `${BASE}/reset-password`,
  validateReq(resetPasswordSchema),
  AuthController.resetPassword
);
// Public - the link in the welcome email. No auth required (the caller may
// not even have signed in on this device yet).
router.post(`${BASE}/verify-email/:token`, AuthController.verifyEmail);
// Authenticated - "Resend verification email" action on the dashboard
// banner, always targets the caller's own account (see
// AuthService.resendVerificationEmail).
router.post(
  `${BASE}/resend-verification`,
  Authorization.authenticateToken,
  AuthController.resendVerification
);

module.exports = router;
