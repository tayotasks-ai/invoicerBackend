const catchAsync = require('../utils/catchAsync');
const { RecurringInvoiceService } = require('../services/recurringInvoice.service');
const { successResponse } = require('../utils/responder');

class RecurringInvoiceController {
  static createSchedule = catchAsync(async (req, res, next) => {
    const user = req.user;
    const schedule = await RecurringInvoiceService.createSchedule(req.body, user.id);
    return successResponse(req, res, schedule, 'Recurring invoice schedule created');
  });

  static getAllSchedules = catchAsync(async (req, res, next) => {
    const user = req.user;
    const schedules = await RecurringInvoiceService.getAllSchedules(user.id);
    return successResponse(req, res, schedules, 'Operation Successful');
  });

  static getSchedule = catchAsync(async (req, res, next) => {
    const user = req.user;
    const schedule = await RecurringInvoiceService.getSchedule(req.params.code, user.id);
    return successResponse(req, res, schedule, 'Operation Successful');
  });

  static updateSchedule = catchAsync(async (req, res, next) => {
    const user = req.user;
    const schedule = await RecurringInvoiceService.updateSchedule(req.params.code, user.id, req.body);
    return successResponse(req, res, schedule, 'Recurring invoice schedule updated');
  });

  static pauseSchedule = catchAsync(async (req, res, next) => {
    const user = req.user;
    const schedule = await RecurringInvoiceService.setActive(req.params.code, user.id, false);
    return successResponse(req, res, schedule, 'Schedule paused');
  });

  static resumeSchedule = catchAsync(async (req, res, next) => {
    const user = req.user;
    const schedule = await RecurringInvoiceService.setActive(req.params.code, user.id, true);
    return successResponse(req, res, schedule, 'Schedule resumed');
  });

  static deleteSchedule = catchAsync(async (req, res, next) => {
    const user = req.user;
    await RecurringInvoiceService.deleteSchedule(req.params.code, user.id);
    return successResponse(req, res, null, 'Recurring invoice schedule deleted');
  });

  static generateNow = catchAsync(async (req, res, next) => {
    const user = req.user;
    const schedule = await RecurringInvoiceService.generateNow(req.params.code, user.id);
    return successResponse(req, res, schedule, 'Draft invoice generated');
  });
}

module.exports = {
  RecurringInvoiceController,
};
