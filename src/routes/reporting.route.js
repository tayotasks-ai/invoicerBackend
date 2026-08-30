const express = require("express");
const { ReportingController } = require("../controller/reporting.controller");
const Authorization = require("../utils/authorization.service");
const router = express.Router();

const BASE = "/reports";

// The dashboard's financial overview: revenue trend, cash flow, top
// customers, aging - see ReportingService.getOverview for the full shape.
// Authenticated and implicitly scoped to the caller's own entity (same
// pattern as every other authenticated route - the service takes user.id,
// never a value from the request body/params).
router.get(`${BASE}/overview`, Authorization.authenticateToken, ReportingController.getOverview);

module.exports = router;
