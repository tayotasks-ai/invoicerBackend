const catchAsync = require("../utils/catchAsync");
const { ReportingService } = require("../services");
const { successResponse } = require("../utils/responder");

class ReportingController {
  static getOverview = catchAsync(async (req, res, next) => {
    const user = req.user;
    const overview = await ReportingService.getOverview(user.id);
    return successResponse(req, res, overview);
  });

  static getActionItems = catchAsync(async (req, res, next) => {
    const user = req.user;
    const actionItems = await ReportingService.getActionItems(user.id);
    return successResponse(req, res, actionItems);
  });

  static exportTransactionsCsv = catchAsync(async (req, res, next) => {
    const user = req.user;
    const csv = await ReportingService.exportTransactionsCsv(user.id, req.query);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="transactions.csv"');
    return res.send(csv);
  });
}

module.exports = {
  ReportingController,
};
