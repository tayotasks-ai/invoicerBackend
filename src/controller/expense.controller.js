const catchAsync = require('../utils/catchAsync');
const { ExpenseService } = require('../services/expense.service');
const { successResponse } = require('../utils/responder');

class ExpenseController {
  static requestExpense = catchAsync(async (req, res) => {
    const user = req.user;
    const expense = await ExpenseService.requestExpense(req.body, user.id);
    return successResponse(req, res, expense, 'Payment request sent');
  });

  static getAllExpenses = catchAsync(async (req, res) => {
    const user = req.user;
    const expenses = await ExpenseService.getAllExpenses(user.id, req.query);
    return successResponse(req, res, expenses, 'Operation Successful');
  });

  static getExpenseStats = catchAsync(async (req, res) => {
    const user = req.user;
    const stats = await ExpenseService.getExpenseStats(user.id);
    return successResponse(req, res, stats, 'Operation Successful');
  });

  static getExpenseByCode = catchAsync(async (req, res) => {
    const user = req.user;
    const expense = await ExpenseService.getExpenseByCode(req.params.code, user.id);
    return successResponse(req, res, expense, 'Operation Successful');
  });

  // Unauthenticated - the vendor reaching this from their emailed link.
  static getPublicExpense = catchAsync(async (req, res) => {
    const expense = await ExpenseService.getPublicExpense(req.params.code);
    return successResponse(req, res, expense, 'Operation Successful');
  });

  static submitExpenseDetails = catchAsync(async (req, res) => {
    const expense = await ExpenseService.submitExpenseDetails(req.params.code, req.body);
    return successResponse(req, res, expense, 'Payment details submitted');
  });

  static recordPayment = catchAsync(async (req, res) => {
    const user = req.user;
    const expense = await ExpenseService.recordManualPayment(req.params.code, user.id, req.body);
    return successResponse(req, res, expense, 'Marked as paid');
  });

  static cancelExpense = catchAsync(async (req, res) => {
    const user = req.user;
    const expense = await ExpenseService.cancelExpense(req.params.code, user.id);
    return successResponse(req, res, expense, 'Request cancelled');
  });
}

module.exports = {
  ExpenseController,
};
