const express = require("express");
const { AdminController } = require("../controller/admin.controller");
const { validateReq } = require("../middleware/validate");
const Authorization = require("../utils/authorization.service");
const {
  setTestFlagSchema,
  suspendMerchantSchema,
  changePlanSchema,
} = require("../validations/admin.validations");
const router = express.Router();

const BASE = "/admin";

// No login route here, deliberately - root signs in through the normal
// POST /auth/sign-in like any business (see authorization.service.js's
// isRootEmail/requireRoot). Every route below requires BOTH a valid
// business session (authenticateToken) AND that session's email being on
// the ROOT_ADMIN_EMAILS allowlist (requireRoot) - a real, signed-in
// business account with an unlisted email is rejected same as a signed-out
// visitor.
router.get(
  `${BASE}/merchants`,
  Authorization.authenticateToken,
  Authorization.requireRoot,
  AdminController.listMerchants
);
router.get(
  `${BASE}/merchants/:code`,
  Authorization.authenticateToken,
  Authorization.requireRoot,
  AdminController.getMerchant
);
router.patch(
  `${BASE}/merchants/:code/test-flag`,
  validateReq(setTestFlagSchema),
  Authorization.authenticateToken,
  Authorization.requireRoot,
  AdminController.setTestFlag
);
router.post(
  `${BASE}/merchants/:code/suspend`,
  validateReq(suspendMerchantSchema),
  Authorization.authenticateToken,
  Authorization.requireRoot,
  AdminController.suspend
);
router.post(
  `${BASE}/merchants/:code/unsuspend`,
  Authorization.authenticateToken,
  Authorization.requireRoot,
  AdminController.unsuspend
);
router.patch(
  `${BASE}/merchants/:code/plan`,
  validateReq(changePlanSchema),
  Authorization.authenticateToken,
  Authorization.requireRoot,
  AdminController.changePlan
);

module.exports = router;
