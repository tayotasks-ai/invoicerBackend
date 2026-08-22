const express = require("express");
const { AccountantController } = require("../controller/accountant.controller");
const { validateReq } = require("../middleware/validate");
const { inviteAccountantSchema } = require("../validations/accountant.validations");
const Authorization = require("../utils/authorization.service");
const router = express.Router();

const BASE = "/entity/accountants";

// Business invites someone to access its books.
router.post(
  `${BASE}/invite`,
  validateReq(inviteAccountantSchema),
  Authorization.authenticateToken,
  AccountantController.inviteAccountant
);
// Public - the accept page reads invite details before requiring sign-in.
router.get(
  `${BASE}/invite/:token`,
  AccountantController.getInviteByToken
);
router.post(
  `${BASE}/invite/:token/accept`,
  Authorization.authenticateToken,
  AccountantController.acceptInvite
);
// For the accountant: businesses they can act as (the frontend's workspace
// switcher). Called without an `x-business-id` header, so this always
// resolves against the caller's own real identity.
router.get(
  `${BASE}/my-businesses`,
  Authorization.authenticateToken,
  AccountantController.listMyBusinesses
);
// For the business: who currently has (or is pending) access to its books.
router.get(
  `${BASE}`,
  Authorization.authenticateToken,
  AccountantController.listMyAccountants
);
router.delete(
  `${BASE}/:accessId`,
  Authorization.authenticateToken,
  AccountantController.revokeAccess
);

module.exports = router;
