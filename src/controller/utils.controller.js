const catchAsync = require('../utils/catchAsync');
const { UtilsService } = require('../services');
const { successResponse } = require('../utils/responder');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

class UtilsController {
  // Signup
  static listBanks = catchAsync(async (req, res, next) => {
    const entity = await UtilsService.listAllBanks()
    return successResponse(req, res, entity, 'Operation Successful');
  });

  static verifyBanks = catchAsync(async (req, res, next) => {
    const { accountNumber, bankCode } = req.body;
    const entity = await UtilsService.verifyBankNumber(accountNumber, bankCode)
    return successResponse(req, res, entity, 'Operation Successful');
  });

  static webhook = catchAsync(async (req, res, next) => {
    const signature = req.headers['x-paystack-signature'];
    const isValid = UtilsService.verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Invalid webhook signature', true));
    }
    // Ack immediately so Paystack doesn't retry/timeout, then process.
    successResponse(req, res, {}, 'Operation Successful');
    const data = req.body;
    await UtilsService.webhook(data);
    return;
  });
}

module.exports = {
  UtilsController,
};
