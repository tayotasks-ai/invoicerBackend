const catchAsync = require("../utils/catchAsync");
const { ReportingService } = require("../services");
const { successResponse } = require("../utils/responder");

class ReportingController {
  static getOverview = catchAsync(async (req, res, next) => {
    const user = req.user;
    const overview = await ReportingService.getOverview(user.id);
    return successResponse(req, res, overview);
  });
}

module.exports = {
  ReportingController,
};
