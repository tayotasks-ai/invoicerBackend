const catchAsync = require('../utils/catchAsync');
const { AdminService } = require('../services');
const { successResponse } = require('../utils/responder');

class AdminController {
  static listMerchants = catchAsync(async (req, res) => {
    const { q, plan, flag, page, limit } = req.query;
    const result = await AdminService.listMerchants({ q, plan, flag, page, limit });
    return successResponse(req, res, result, 'Operation Successful');
  });

  static getMerchant = catchAsync(async (req, res) => {
    const result = await AdminService.getMerchant(req.params.code);
    return successResponse(req, res, result, 'Operation Successful');
  });

  static setTestFlag = catchAsync(async (req, res) => {
    const result = await AdminService.setTestFlag(req.params.code, req.body.enabled);
    return successResponse(req, res, result, 'Updated');
  });

  static suspend = catchAsync(async (req, res) => {
    const result = await AdminService.suspend(req.params.code, req.body.reason);
    return successResponse(req, res, result, 'Merchant suspended');
  });

  static unsuspend = catchAsync(async (req, res) => {
    const result = await AdminService.unsuspend(req.params.code);
    return successResponse(req, res, result, 'Merchant unsuspended');
  });

  static changePlan = catchAsync(async (req, res) => {
    const result = await AdminService.changePlan(req.params.code, req.body.plan);
    return successResponse(req, res, result, 'Plan updated');
  });

  static syncSubaccountFees = catchAsync(async (req, res) => {
    const result = await AdminService.syncSubaccountFees();
    return successResponse(req, res, result, 'Subaccount fees synced');
  });
}

module.exports = { AdminController };
