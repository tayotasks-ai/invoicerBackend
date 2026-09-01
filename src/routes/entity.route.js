const express = require("express");
const { EntityController } = require("../controller/entity.controller");
const { validateReq } = require("../middleware/validate");
const Authorization = require("../utils/authorization.service");
const {
  addBankSchema,
  editEntitySchema,
  addMemberSchema,
  subscribeSchema,
  provisionVirtualAccountSchema,
} = require("../validations/entity.validations");
const router = express.Router();

const BASE = "/entity";

router.post(
  `${BASE}/add-bank`,
  validateReq(addBankSchema),
  Authorization.authenticateToken,
  EntityController.addBank
);
router.get(
  `${BASE}/get-banks`,
  Authorization.authenticateToken,
  EntityController.getBanks
);
// add-logo/add-signature take a multipart file upload (see express-fileupload
// in app.js), not a JSON body, so no Joi body schema applies here.
router.post(
  `${BASE}/add-logo`,
  Authorization.authenticateToken,
  EntityController.addLogo
);
router.post(
  `${BASE}/add-signature`,
  Authorization.authenticateToken,
  EntityController.addSignature
);
//entity
router.patch(
  `${BASE}`,
  validateReq(editEntitySchema),
  Authorization.authenticateToken,
  EntityController.editEntity
);
router.post(
  `${BASE}/add-member`,
  validateReq(addMemberSchema),
  Authorization.authenticateToken,
  EntityController.addMember
);

router.get(`${BASE}/me`, Authorization.authenticateToken, EntityController.getMe);

// Templates: gallery + live PDF preview (see themes.js for the 12 designs).
router.get(
  `${BASE}/templates`,
  Authorization.authenticateToken,
  EntityController.listTemplates
);
router.get(
  `${BASE}/templates/:templateId/preview`,
  Authorization.authenticateToken,
  EntityController.previewTemplate
);

// Plans/subscription
router.get(`${BASE}/plans`, EntityController.getPlans);
router.post(
  `${BASE}/subscribe`,
  validateReq(subscribeSchema),
  Authorization.authenticateToken,
  EntityController.subscribe
);

// Virtual account (Expenses/Accounts Payable) - provisioning only, see
// EntityService.provisionVirtualAccount. Status is read back via the
// existing GET /entity/me (the `virtualAccount` field on the entity), so
// there's no separate GET route here.
router.post(
  `${BASE}/virtual-account`,
  validateReq(provisionVirtualAccountSchema),
  Authorization.authenticateToken,
  EntityController.provisionVirtualAccount
);

module.exports = router;
