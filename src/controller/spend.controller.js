const catchAsync = require('../utils/catchAsync');
const { SpendService } = require('../services/spend.service');
const { successResponse } = require('../utils/responder');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

class SpendController {
  static createSpend = catchAsync(async (req, res) => {
    const user = req.user;
    const spend = await SpendService.createSpend(req.body, user.id);
    return successResponse(req, res, spend, 'Spend logged');
  });

  static getAllSpend = catchAsync(async (req, res) => {
    const user = req.user;
    const spend = await SpendService.getAllSpend(user.id, req.query);
    return successResponse(req, res, spend, 'Operation Successful');
  });

  static getSpendStats = catchAsync(async (req, res) => {
    const user = req.user;
    const stats = await SpendService.getSpendStats(user.id);
    return successResponse(req, res, stats, 'Operation Successful');
  });

  static getSpendByCode = catchAsync(async (req, res) => {
    const user = req.user;
    const spend = await SpendService.getSpendByCode(req.params.code, user.id);
    return successResponse(req, res, spend, 'Operation Successful');
  });

  static updateSpend = catchAsync(async (req, res) => {
    const user = req.user;
    const spend = await SpendService.updateSpend(req.params.code, req.body, user.id);
    return successResponse(req, res, spend, 'Spend updated');
  });

  static deleteSpend = catchAsync(async (req, res) => {
    const user = req.user;
    const spend = await SpendService.deleteSpend(req.params.code, user.id);
    return successResponse(req, res, spend, 'Spend deleted');
  });

  // Multipart file upload, same pattern as EntityController.addLogo/addSignature.
  static addReceipt = catchAsync(async (req, res, next) => {
    const user = req.user;
    const file = req.files?.file;
    if (!file) {
      return next(new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded', true));
    }
    const result = await SpendService.addReceipt({ code: req.params.code, entity_id: user.id, file });
    return successResponse(req, res, result, 'Receipt uploaded successfully');
  });
}

module.exports = {
  SpendController,
};
